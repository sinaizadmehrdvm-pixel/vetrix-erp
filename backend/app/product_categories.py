from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal
from app.company_scope import current_company_id

router = APIRouter(prefix="/product-categories", tags=["Product Categories"])


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    main_category = Column(String, nullable=False)
    sub_category = Column(String, default="")
    code = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, nullable=True)


class ProductCategoryCreate(BaseModel):
    main_category: str
    sub_category: str = ""
    code: str = ""


class ProductCategoryUpdate(BaseModel):
    main_category: str
    sub_category: str = ""
    code: str = ""


def _category_dict(category):
    return {
        "id": category.id,
        "main_category": category.main_category,
        "sub_category": category.sub_category or "",
        "code": category.code or "",
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


@router.get("")
def list_categories(request: Request):
    db: Session = SessionLocal()
    try:
        categories = (
            db.query(ProductCategory)
            .filter(ProductCategory.company_id == current_company_id(request))
            .order_by(ProductCategory.main_category, ProductCategory.sub_category)
            .all()
        )
        return [_category_dict(c) for c in categories]
    finally:
        db.close()


@router.post("")
def create_category(data: ProductCategoryCreate, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        main_category = data.main_category.strip()
        if not main_category:
            raise ValueError("Main category is required")
        sub_category = data.sub_category.strip()

        duplicate = (
            db.query(ProductCategory)
            .filter(
                ProductCategory.main_category == main_category,
                ProductCategory.sub_category == sub_category,
                ProductCategory.company_id == company_id,
            )
            .first()
        )
        if duplicate:
            raise ValueError("This category already exists")

        category = ProductCategory(
            main_category=main_category,
            sub_category=sub_category,
            code=data.code.strip(),
            company_id=company_id,
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        return {"status": "created", **_category_dict(category)}
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@router.put("/{category_id}")
def update_category(category_id: int, data: ProductCategoryUpdate, request: Request):
    db: Session = SessionLocal()
    try:
        company_id = current_company_id(request)
        category = db.query(ProductCategory).filter(ProductCategory.id == category_id, ProductCategory.company_id == company_id).first()
        if not category:
            return {"status": "error", "message": "Category not found"}

        main_category = data.main_category.strip()
        if not main_category:
            raise ValueError("Main category is required")
        sub_category = data.sub_category.strip()

        duplicate = (
            db.query(ProductCategory)
            .filter(
                ProductCategory.id != category_id,
                ProductCategory.main_category == main_category,
                ProductCategory.sub_category == sub_category,
                ProductCategory.company_id == company_id,
            )
            .first()
        )
        if duplicate:
            raise ValueError("This category already exists")

        # Products reference categories by name, not a foreign key (see
        # Product.main_category/sub_category) - renaming here must also
        # relabel any product already assigned to the old name, or those
        # products would silently point at a category that no longer exists.
        old_main, old_sub = category.main_category, category.sub_category or ""
        from app.models.product import Product
        if old_main != main_category or old_sub != sub_category:
            db.query(Product).filter(
                Product.main_category == old_main,
                Product.sub_category == old_sub,
                Product.company_id == company_id,
            ).update({"main_category": main_category, "sub_category": sub_category}, synchronize_session=False)

        category.main_category = main_category
        category.sub_category = sub_category
        category.code = data.code.strip()
        db.commit()
        db.refresh(category)
        return {"status": "updated", **_category_dict(category)}
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@router.delete("/{category_id}")
def delete_category(category_id: int, request: Request):
    db: Session = SessionLocal()
    try:
        category = db.query(ProductCategory).filter(ProductCategory.id == category_id, ProductCategory.company_id == current_company_id(request)).first()
        if not category:
            return {"status": "error", "message": "Category not found"}
        db.delete(category)
        db.commit()
        return {"status": "deleted", "id": category_id}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()
