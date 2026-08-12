import { Routes, Route, Navigate } from "react-router-dom";
import JoinPage from "./pages/participant/JoinPage";
import LobbyPage from "./pages/participant/LobbyPage";
import QuizPlayPage from "./pages/participant/QuizPlayPage";
import ParticipantResultPage from "./pages/participant/ParticipantResultPage";

import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import QuizEditor from "./pages/admin/QuizEditor";
import LiveMonitor from "./pages/admin/LiveMonitor";
import ResultsPage from "./pages/admin/ResultsPage";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />

      {/* Participant flow */}
      <Route path="/join" element={<JoinPage />} />
      <Route path="/lobby" element={<LobbyPage />} />
      <Route path="/play" element={<QuizPlayPage />} />
      <Route path="/result" element={<ParticipantResultPage />} />

      {/* Admin flow */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/quiz/:id"
        element={
          <ProtectedRoute>
            <QuizEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/quiz/:id/live"
        element={
          <ProtectedRoute>
            <LiveMonitor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/quiz/:id/results"
        element={
          <ProtectedRoute>
            <ResultsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}
