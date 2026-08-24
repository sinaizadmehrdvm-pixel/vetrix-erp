import unittest
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Query, sessionmaker

import app.security as security
import app.users_routes as users_routes
from app.database import Base
from app.models.company import Company
from app.models.user import User
from app.users_routes import (
    ForgotPasswordRequest,
    PublicRegisterRequest,
    UserCreate,
    create_user,
    forgot_password,
    public_register,
)


class AuthFinalizationRouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self._patches = [
            patch.object(users_routes, "SessionLocal", self.SessionLocal),
            patch.object(security, "engine", self.engine),
        ]
        for item in self._patches:
            item.start()

    def tearDown(self):
        for item in reversed(self._patches):
            item.stop()
        self.engine.dispose()

    def _session(self):
        return self.SessionLocal()

    def test_public_register_creates_only_the_first_system_admin(self):
        response = public_register(PublicRegisterRequest(
            full_name="First Administrator",
            username="first-admin",
            password="StrongFirstAdmin!42",
            confirm_password="StrongFirstAdmin!42",
        ))

        self.assertEqual(response["status"], "created")
        self.assertTrue(response["requires_login"])

        db = self._session()
        try:
            users = db.query(User).all()
            self.assertEqual(len(users), 1)
            self.assertEqual(users[0].username, "first-admin")
            self.assertEqual(users[0].role, "admin")
            self.assertTrue(users[0].is_super_admin)
            self.assertIsNotNone(users[0].company_id)
        finally:
            db.close()

        with self.assertRaises(HTTPException) as ctx:
            public_register(PublicRegisterRequest(
                full_name="Second User",
                username="second-user",
                password="StrongSecondUser!42",
                confirm_password="StrongSecondUser!42",
            ))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_concurrent_public_register_requests_create_only_one_system_admin(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = create_engine(
                f"sqlite:///{tmpdir}/auth-race.sqlite",
                connect_args={"check_same_thread": False},
            )
            Base.metadata.create_all(bind=engine)
            SessionLocal = sessionmaker(bind=engine)
            barrier = threading.Barrier(2)
            count_lock = threading.Lock()
            synchronized_counts = 0
            original_count = Query.count

            def synchronized_user_count(query):
                nonlocal synchronized_counts
                result = original_count(query)
                is_user_query = any(
                    item.get("entity") is User
                    for item in getattr(query, "column_descriptions", [])
                )
                if is_user_query:
                    with count_lock:
                        synchronized_counts += 1
                        should_wait = synchronized_counts <= 2
                    if should_wait:
                        barrier.wait(timeout=5)
                return result

            def submit(username):
                try:
                    return "created", public_register(PublicRegisterRequest(
                        full_name=f"{username} Administrator",
                        username=username,
                        password="StrongRaceAdmin!42",
                        confirm_password="StrongRaceAdmin!42",
                    ))
                except HTTPException as exc:
                    return "rejected", exc.status_code

            with (
                patch.object(users_routes, "SessionLocal", SessionLocal),
                patch.object(Query, "count", synchronized_user_count),
            ):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = list(pool.map(submit, ["race-admin-1", "race-admin-2"]))

            db = SessionLocal()
            try:
                users = db.query(User).all()
                self.assertEqual(len(users), 1)
                self.assertEqual(users[0].role, "admin")
                self.assertTrue(users[0].is_super_admin)
            finally:
                db.close()
                engine.dispose()

            self.assertEqual(sum(1 for status, _ in results if status == "created"), 1)
            self.assertEqual(sum(1 for status, _ in results if status == "rejected"), 1)

    def test_legacy_bootstrap_user_creation_ignores_public_role_selection(self):
        db = self._session()
        try:
            db.add(Company(name="Bootstrap company"))
            db.commit()
        finally:
            db.close()

        request = SimpleNamespace(state=SimpleNamespace(auth={"role": "bootstrap"}))
        response = create_user(
            UserCreate(
                full_name="Bootstrap Administrator",
                username="bootstrap-admin",
                password="StrongBootstrapAdmin!42",
                role="cashier",
                is_super_admin=False,
            ),
            request,
        )

        self.assertEqual(response["status"], "created")
        self.assertEqual(response["role"], "admin")
        self.assertTrue(response["is_super_admin"])

    def test_public_forgot_password_response_does_not_enumerate_accounts(self):
        request = SimpleNamespace(client=SimpleNamespace(host="10.0.0.5"))

        known = forgot_password(ForgotPasswordRequest(username="known-user"), request)
        missing = forgot_password(ForgotPasswordRequest(username="missing-user"), request)

        self.assertEqual(known, missing)
        self.assertEqual(known["status"], "accepted")
        self.assertEqual(known["recovery_mode"], "administrator_reset")

    def test_public_forgot_password_is_rate_limited_without_changing_response_shape(self):
        request = SimpleNamespace(client=SimpleNamespace(host="10.0.0.6"))
        first = None
        for _ in range(security.MAX_LOGIN_FAILURES + 2):
            response = forgot_password(ForgotPasswordRequest(username="target-user"), request)
            first = first or response
            self.assertEqual(response, first)

        retry_after = security.login_retry_after(
            security.login_attempt_key("10.0.0.6", "password-recovery:target-user")
        )
        self.assertGreater(retry_after, 0)


if __name__ == "__main__":
    unittest.main()
