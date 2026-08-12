import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Quiz = {
  id: string;
  title: string;
  status: string;
  pin: string | null;
  _count: { questions: number; participants: number };
};

export default function AdminDashboard() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["quizzes"],
    queryFn: async () => (await api.get("/api/quizzes")).data,
  });

  const createQuiz = useMutation({
    mutationFn: async () => (await api.post("/api/quizzes", { title })).data,
    onSuccess: (quiz) => {
      qc.invalidateQueries({ queryKey: ["quizzes"] });
      setTitle("");
      navigate(`/admin/quiz/${quiz.id}`);
    },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-extrabold text-brand-purple">QuizBlast Admin</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{admin?.email}</span>
          <button onClick={logout} className="text-red-500 hover:underline">
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createQuiz.mutate();
          }}
          className="flex gap-2 mb-8"
        >
          <input
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2"
            placeholder="New quiz title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            disabled={createQuiz.isPending}
            className="bg-brand-purple text-white font-bold px-5 py-2 rounded-lg hover:brightness-110 disabled:opacity-60"
          >
            + Create Quiz
          </button>
        </form>

        {isLoading && <p className="text-slate-400">Loading quizzes…</p>}

        <div className="space-y-3">
          {quizzes?.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex justify-between items-center"
            >
              <div>
                <p className="font-bold">{q.title}</p>
                <p className="text-xs text-slate-400">
                  {q._count.questions} questions · {q._count.participants} participants ·{" "}
                  <StatusBadge status={q.status} /> {q.pin && `· PIN ${q.pin}`}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                {(q.status === "LIVE" || q.status === "PAUSED" || q.status === "LOBBY") && (
                  <button
                    onClick={() => navigate(`/admin/quiz/${q.id}/live`)}
                    className="text-emerald-600 font-semibold hover:underline"
                  >
                    Monitor
                  </button>
                )}
                {q.status === "COMPLETED" && (
                  <button
                    onClick={() => navigate(`/admin/quiz/${q.id}/results`)}
                    className="text-brand-purple font-semibold hover:underline"
                  >
                    Results
                  </button>
                )}
                <button
                  onClick={() => navigate(`/admin/quiz/${q.id}`)}
                  className="text-slate-500 font-semibold hover:underline"
                >
                  {q.status === "DRAFT" ? "Edit" : "Details"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "text-slate-400",
    PUBLISHED: "text-blue-500",
    LOBBY: "text-amber-500",
    LIVE: "text-emerald-500",
    PAUSED: "text-orange-500",
    COMPLETED: "text-slate-500",
  };
  return <span className={colors[status] || ""}>{status}</span>;
}
