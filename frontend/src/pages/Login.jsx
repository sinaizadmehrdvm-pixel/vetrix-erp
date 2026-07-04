import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    username: "admin",
    password: "1234",
  });

  function handleLogin() {
    const ok = login(form.username, form.password);

    if (!ok) {
      alert("Invalid login");
      return;
    }

    navigate("/");
  }

  return (
    <div className="min-h-screen bg-[#071028] flex items-center justify-center text-white">
      <div className="w-full max-w-md bg-[#0b1736] border border-cyan-500/20 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-4xl font-black text-cyan-400 mb-2">Vetrix ERP</h1>
        <p className="text-gray-400 mb-8">Professional Accounting System</p>

        <input
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="Username"
          className="w-full mb-4 p-4 rounded-2xl bg-[#132347] outline-none"
        />

        <input
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Password"
          type="password"
          className="w-full mb-6 p-4 rounded-2xl bg-[#132347] outline-none"
        />

        <button
          onClick={handleLogin}
          className="w-full bg-cyan-400 text-black font-black py-4 rounded-2xl"
        >
          Login
        </button>
      </div>
    </div>
  );
}