import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";

type Question = {
  id: string;
  type: "MCQ" | "TRUE_FALSE";
  question: string;
  optionA: string;
  optionB: string;
  optionC?: string | null;
  optionD?: string | null;
  correctAnswer: string;
  timerSeconds: number;
};

type Quiz = {
  id: string;
  title: string;
  status: string;
  pin: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  enableLeaderboard: boolean;
  enableAntiCheat: boolean;
  enableFullscreen: boolean;
  maxParticipants: number;
  questions: Question[];
};

type DraftQuestion = {
  type: "MCQ" | "TRUE_FALSE";
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  timerSeconds: number;
};

const emptyQuestion: DraftQuestion = {
  type: "MCQ",
  question: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctAnswer: "",
  timerSeconds: 20,
};

export default function QuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftQuestion>({ ...emptyQuestion });
  const [error, setError] = useState<string | null>(null);

  const { data: quiz, isLoading } = useQuery<Quiz>({
    queryKey: ["quiz", id],
    queryFn: async () => (await api.get(`/api/quizzes/${id}`)).data,
  });

  const addQuestion = useMutation({
    mutationFn: async () => (await api.post(`/api/questions/quiz/${id}`, draft)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiz", id] });
      setDraft({ ...emptyQuestion });
      setError(null);
    },
    onError: (err: any) => setError(err?.response?.data?.error || "Could not add question"),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (qid: string) => api.delete(`/api/questions/${qid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", id] }),
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<Quiz>) => (await api.patch(`/api/quizzes/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", id] }),
  });

  const publish = useMutation({
    mutationFn: async () => (await api.post(`/api/quizzes/${id}/publish`)).data,
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["quiz", id] });
      navigate(`/admin/quiz/${updated.id}/live`);
    },
    onError: (err: any) => setError(err?.response?.data?.error || "Could not publish"),
  });

  if (isLoading || !quiz) return <div className="p-8 text-slate-400">Loading…</div>;
  const editable = quiz.status === "DRAFT";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <button onClick={() => navigate("/admin")} className="text-slate-400 hover:underline text-sm">
          ← Back
        </button>
        <h1 className="font-bold">{quiz.title}</h1>
        {editable ? (
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending || quiz.questions.length === 0}
            className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:brightness-110 disabled:opacity-50"
          >
            Publish & Get PIN
          </button>
        ) : (
          <span className="text-sm text-slate-400">PIN: {quiz.pin}</span>
        )}
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-8">
        {!editable && (
          <p className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-2">
            This quiz is published — questions and settings are locked. Use the live monitor to run it.
          </p>
        )}

        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-bold mb-4">Settings</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["shuffleQuestions", "Shuffle questions"],
              ["shuffleOptions", "Shuffle options"],
              ["enableLeaderboard", "Enable leaderboard (admin view)"],
              ["enableAntiCheat", "Enable anti-cheat"],
              ["enableFullscreen", "Require fullscreen"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={(quiz as any)[key]}
                  onChange={(e) => updateSettings.mutate({ [key]: e.target.checked } as any)}
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2">
              Max participants
              <input
                type="number"
                disabled={!editable}
                className="w-20 border rounded px-2 py-1"
                value={quiz.maxParticipants}
                onChange={(e) => updateSettings.mutate({ maxParticipants: Number(e.target.value) })}
              />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-bold mb-4">Questions ({quiz.questions.length})</h2>
          <ul className="space-y-2 mb-6">
            {quiz.questions.map((q, ix) => (
              <li key={q.id} className="flex justify-between items-center bg-slate-50 rounded-lg px-4 py-2">
                <span className="text-sm">
                  <strong>{ix + 1}.</strong> {q.question}{" "}
                  <span className="text-slate-400">
                    ({q.type === "TRUE_FALSE" ? "True/False" : "MCQ"} · {q.timerSeconds}s)
                  </span>
                </span>
                {editable && (
                  <button
                    onClick={() => deleteQuestion.mutate(q.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {editable && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex gap-3">
                <select
                  className="border rounded px-3 py-2"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, type: e.target.value as "MCQ" | "TRUE_FALSE", correctAnswer: "" }))
                  }
                >
                  <option value="MCQ">MCQ</option>
                  <option value="TRUE_FALSE">True / False</option>
                </select>
                <input
                  type="number"
                  className="w-24 border rounded px-3 py-2"
                  value={draft.timerSeconds}
                  min={5}
                  max={120}
                  onChange={(e) => setDraft((d) => ({ ...d, timerSeconds: Number(e.target.value) }))}
                />
                <span className="self-center text-sm text-slate-400">seconds</span>
              </div>

              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Question text"
                value={draft.question}
                onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
              />

              {draft.type === "MCQ" ? (
                <div className="grid grid-cols-2 gap-2">
                  {(["optionA", "optionB", "optionC", "optionD"] as const).map((k) => (
                    <input
                      key={k}
                      className="border rounded px-3 py-2"
                      placeholder={`Option ${k.slice(-1)}`}
                      value={(draft as any)[k]}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    />
                  ))}
                  <select
                    className="col-span-2 border rounded px-3 py-2"
                    value={draft.correctAnswer}
                    onChange={(e) => setDraft((d) => ({ ...d, correctAnswer: e.target.value }))}
                  >
                    <option value="">Correct answer…</option>
                    {[draft.optionA, draft.optionB, draft.optionC, draft.optionD]
                      .filter(Boolean)
                      .map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <select
                  className="border rounded px-3 py-2"
                  value={draft.correctAnswer}
                  onChange={(e) => setDraft((d) => ({ ...d, correctAnswer: e.target.value }))}
                >
                  <option value="">Correct answer…</option>
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={() => addQuestion.mutate()}
                disabled={addQuestion.isPending || !draft.question || !draft.correctAnswer}
                className="bg-brand-purple text-white font-bold px-5 py-2 rounded-lg hover:brightness-110 disabled:opacity-50"
              >
                + Add Question
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
