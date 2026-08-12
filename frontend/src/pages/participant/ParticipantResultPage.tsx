import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Row = { rank: number; name: string; score: number };

export default function ParticipantResultPage() {
  const [leaderboard, setLeaderboard] = useState<Row[]>([]);
  const [me, setMe] = useState<{ participantId: string; name: string } | null>(null);

  useEffect(() => {
    const lb = sessionStorage.getItem("qb_final_leaderboard");
    if (lb) setLeaderboard(JSON.parse(lb));
    const p = sessionStorage.getItem("qb_participant");
    if (p) setMe(JSON.parse(p));
  }, []);

  const myRow = leaderboard.find((r) => r.name === me?.name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-purple to-brand-teal flex flex-col items-center justify-center text-white p-4">
      <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl mb-2">
        🏁
      </motion.p>
      <h1 className="text-3xl font-extrabold mb-1">Quiz Complete!</h1>
      {myRow && (
        <p className="text-xl mb-8">
          You finished <strong>#{myRow.rank}</strong> with <strong>{myRow.score}</strong> points
        </p>
      )}

      <div className="bg-white/10 rounded-2xl p-4 w-full max-w-sm">
        <h2 className="font-bold mb-3 text-center">Final Leaderboard</h2>
        <ul className="space-y-2">
          {leaderboard.slice(0, 10).map((r) => (
            <li
              key={r.rank}
              className={`flex justify-between px-3 py-2 rounded-lg ${
                r.name === me?.name ? "bg-brand-yellow text-slate-900 font-bold" : "bg-white/10"
              }`}
            >
              <span>#{r.rank} {r.name}</span>
              <span>{r.score}</span>
            </li>
          ))}
        </ul>
      </div>

      <a href="/join" className="mt-8 text-sm text-white/70 hover:underline">
        Join another quiz
      </a>
    </div>
  );
}
