import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../lib/api";

export default function JoinPage() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || pin.trim().length !== 6) {
      setError("Enter your name and the 6-digit PIN.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/api/participants/join", { name: name.trim(), pin: pin.trim() });
      sessionStorage.setItem("qb_participant", JSON.stringify(data));
      navigate("/lobby");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not join. Check the PIN and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-purple via-brand-pink to-brand-yellow flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm"
      >
        <h1 className="text-3xl font-extrabold text-center text-brand-purple mb-1">QuizBlast</h1>
        <p className="text-center text-slate-500 mb-6">Enter your name and the event PIN to join</p>

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand-purple"
            placeholder="Your name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-brand-purple"
            placeholder="6-digit PIN"
            maxLength={6}
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-purple text-white font-bold py-3 rounded-xl hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? "Joining…" : "Join Quiz"}
          </button>
        </form>

        <a href="/admin/login" className="block text-center text-xs text-slate-400 mt-6 hover:underline">
          Host login
        </a>
      </motion.div>
    </div>
  );
}
