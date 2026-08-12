import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { useSocket } from "../../hooks/useSocket";
import { useAuth } from "../../context/AuthContext";

type LeaderRow = { rank: number; name: string; score: number; id: string };
type AuditRow = { participantId: string; name: string; warnings: number; disqualified: boolean };

export default function LiveMonitor() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();

  const { data: quiz } = useQuery({
    queryKey: ["quiz", id],
    queryFn: async () => (await api.get(`/api/quizzes/${id}`)).data,
  });

  const [status, setStatus] = useState<string>("");
  const [round, setRound] = useState<{ index: number; total: number; duration: number } | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [audit, setAudit] = useState<Record<string, AuditRow>>({});
  const [lobbyCount, setLobbyCount] = useState(0);

  useEffect(() => {
    if (!socket || !id || !token) return;
    socket.emit("admin:auth", { token, quizId: id });

    const onReady = () => {};
    const onLobby = ({ count }: { count: number }) => setLobbyCount(count);
    const onStatus = ({ status }: { status: string }) => setStatus(status);
    const onRoundStarted = (payload: { roundIndex: number; totalRounds: number; durationSeconds: number }) => {
      setStatus("LIVE");
      setRound({ index: payload.roundIndex, total: payload.totalRounds, duration: payload.durationSeconds });
      setProgress({ answered: 0, total: progress.total });
    };
    const onProgress = (p: { answered: number; total: number }) => setProgress(p);
    const onLeaderboard = ({ leaderboard }: { leaderboard: LeaderRow[] }) => setLeaderboard(leaderboard);
    const onPaused = () => setStatus("PAUSED");
    const onResumed = () => setStatus("LIVE");
    const onEnded = ({ leaderboard }: { leaderboard: LeaderRow[] }) => {
      setStatus("COMPLETED");
      setLeaderboard(leaderboard);
    };
    const onAntiCheatUpdate = (row: AuditRow) =>
      setAudit((a) => ({ ...a, [row.participantId]: { ...a[row.participantId], ...row } }));
    const onDisqualified = ({ participantId, name }: { participantId: string; name: string }) =>
      setAudit((a) => ({ ...a, [participantId]: { ...a[participantId], participantId, name, disqualified: true, warnings: 3 } }));

    socket.on("admin:ready", onReady);
    socket.on("lobby:update", onLobby);
    socket.on("quiz:status", onStatus);
    socket.on("round:started", onRoundStarted);
    socket.on("round:progress", onProgress);
    socket.on("leaderboard:admin", onLeaderboard);
    socket.on("quiz:paused", onPaused);
    socket.on("quiz:resumed", onResumed);
    socket.on("quiz:ended", onEnded);
    socket.on("anticheat:update", onAntiCheatUpdate);
    socket.on("anticheat:disqualified", onDisqualified);

    return () => {
      socket.off("admin:ready", onReady);
      socket.off("lobby:update", onLobby);
      socket.off("quiz:status", onStatus);
      socket.off("round:started", onRoundStarted);
      socket.off("round:progress", onProgress);
      socket.off("leaderboard:admin", onLeaderboard);
      socket.off("quiz:paused", onPaused);
      socket.off("quiz:resumed", onResumed);
      socket.off("quiz:ended", onEnded);
      socket.off("anticheat:update", onAntiCheatUpdate);
      socket.off("anticheat:disqualified", onDisqualified);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, id, token]);

  if (!quiz) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="font-bold">{quiz.title}</h1>
          <p className="text-xs text-white/40">PIN {quiz.pin} · Status: {status || quiz.status}</p>
        </div>
        <div className="flex gap-2">
          {status !== "LIVE" && status !== "COMPLETED" && (
            <button
              onClick={() => socket?.emit("quiz:start")}
              className="bg-emerald-600 px-4 py-2 rounded-lg font-bold hover:brightness-110"
            >
              ▶ Start Quiz
            </button>
          )}
          {status === "LIVE" && (
            <>
              <button onClick={() => socket?.emit("quiz:pause")} className="bg-amber-600 px-4 py-2 rounded-lg font-bold">
                ⏸ Pause
              </button>
              <button onClick={() => socket?.emit("quiz:skip")} className="bg-slate-600 px-4 py-2 rounded-lg font-bold">
                ⏭ Skip
              </button>
            </>
          )}
          {status === "PAUSED" && (
            <button onClick={() => socket?.emit("quiz:resume")} className="bg-emerald-600 px-4 py-2 rounded-lg font-bold">
              ▶ Resume
            </button>
          )}
          {status !== "COMPLETED" && (
            <button
              onClick={() => socket?.emit("quiz:end")}
              className="bg-red-600 px-4 py-2 rounded-lg font-bold hover:brightness-110"
            >
              ■ End Quiz
            </button>
          )}
          {status === "COMPLETED" && (
            <button
              onClick={() => navigate(`/admin/quiz/${id}/results`)}
              className="bg-brand-purple px-4 py-2 rounded-lg font-bold"
            >
              View Results →
            </button>
          )}
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        <section className="bg-white/5 rounded-xl p-5 lg:col-span-2">
          <h2 className="font-bold mb-3">Live Progress</h2>
          {status === "DRAFT" || status === "PUBLISHED" || status === "LOBBY" || !status ? (
            <p className="text-white/60">
              {lobbyCount} player{lobbyCount === 1 ? "" : "s"} in the lobby. Hit Start when ready.
            </p>
          ) : round ? (
            <div>
              <p className="text-white/70 mb-2">
                Question {round.index + 1} / {round.total} · {round.duration}s timer
              </p>
              <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-3 transition-all"
                  style={{ width: `${progress.total ? (progress.answered / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">
                {progress.answered} / {progress.total} answered
              </p>
            </div>
          ) : (
            <p className="text-white/60">Waiting for round to start…</p>
          )}

          <h2 className="font-bold mt-8 mb-3">Leaderboard</h2>
          <table className="w-full text-sm">
            <thead className="text-white/40 text-left">
              <tr>
                <th className="py-1">Rank</th>
                <th>Name</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="py-1">#{r.rank}</td>
                  <td>{r.name}</td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white/5 rounded-xl p-5">
          <h2 className="font-bold mb-3">Anti-Cheat Monitor</h2>
          {Object.values(audit).length === 0 && <p className="text-white/40 text-sm">No warnings yet.</p>}
          <ul className="space-y-2">
            {Object.values(audit).map((a) => (
              <li
                key={a.participantId}
                className={`flex justify-between text-sm px-3 py-2 rounded-lg ${
                  a.disqualified ? "bg-red-900/40" : a.warnings > 0 ? "bg-amber-900/30" : "bg-white/5"
                }`}
              >
                <span>{a.name}</span>
                <span>{a.disqualified ? "Disqualified" : `${a.warnings} warning${a.warnings === 1 ? "" : "s"}`}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
