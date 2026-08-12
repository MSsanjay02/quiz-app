import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export default function AdminLogin() {
  const [email, setEmail] = useState("admin@quizblast.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      login(data.token, data.admin);
      navigate("/admin");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-brand-purple text-center">Host Login</h1>
        <input
          className="w-full rounded-lg border border-slate-200 px-4 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-slate-200 px-4 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-brand-purple text-white font-bold py-2 rounded-lg hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-slate-400 text-center">
          Demo credentials: admin@quizblast.dev / password123 (after running the seed script)
        </p>
      </form>
    </div>
  );
}
