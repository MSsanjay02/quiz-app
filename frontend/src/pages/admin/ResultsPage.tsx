import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../lib/api";

type Result = {
  rank: number;
  name: string;
  score: number;
  accuracy: number;
  avgTimeMs: number;
  warnings: number;
  disqualified: boolean;
};

export default function ResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data } = useQuery<{ quiz: { title: string }; results: Result[] }>({
    queryKey: ["results", id],
    queryFn: async () => (await api.get(`/api/quizzes/${id}/results`)).data,
  });

  async function download(format: "csv" | "xlsx" | "pdf") {
    const res = await api.get(`/api/export/${id}/${format}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `results.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (!data) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <button onClick={() => navigate("/admin")} className="text-slate-400 hover:underline text-sm">
          ← Back
        </button>
        <h1 className="font-bold">{data.quiz.title} — Results</h1>
        <div className="flex gap-2">
          <button onClick={() => download("csv")} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
            Export CSV
          </button>
          <button onClick={() => download("xlsx")} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
            Export Excel
          </button>
          <button onClick={() => download("pdf")} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
            Export PDF
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <table className="w-full bg-white rounded-xl overflow-hidden border">
          <thead className="bg-slate-100 text-left text-sm text-slate-500">
            <tr>
              <th className="px-4 py-2">Rank</th>
              <th>Name</th>
              <th>Score</th>
              <th>Accuracy</th>
              <th>Avg Time</th>
              <th>Warnings</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {data.results.map((r) => (
              <tr key={r.rank} className={`border-t ${r.disqualified ? "bg-red-50 text-red-500" : ""}`}>
                <td className="px-4 py-2 font-bold">#{r.rank}</td>
                <td>{r.name}</td>
                <td>{r.score}</td>
                <td>{r.accuracy}%</td>
                <td>{(r.avgTimeMs / 1000).toFixed(1)}s</td>
                <td>{r.warnings}{r.disqualified && " (DQ)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
