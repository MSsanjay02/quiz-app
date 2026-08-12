import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "../../hooks/useSocket";
import { useAntiCheat } from "../../hooks/useAntiCheat";

type StoredParticipant = {
  participantId: string;
  quizId: string;
  name: string;
  quizTitle: string;
  enableFullscreen: boolean;
  enableAntiCheat: boolean;
};

type QuestionPayload = {
  id: string;
  type: "MCQ" | "TRUE_FALSE";
  question: string;
  options: string[];
  timerSeconds: number;
  roundIndex: number;
  totalRounds: number;
};

type ScreenState = "precheck" | "question" | "locked_waiting" | "ended" | "disqualified";

const OPTION_COLORS = ["bg-red-500", "bg-blue-500", "bg-amber-500", "bg-emerald-500"];

export default function QuizPlayPage() {
  const navigate = useNavigate();
  const socket = useSocket();
  const [participant] = useState<StoredParticipant | null>(() => {
    const raw = sessionStorage.getItem("qb_participant");
    return raw ? JSON.parse(raw) : null;
  });

  const [screen, setScreen] = useState<ScreenState>("precheck");
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ correct: boolean; score: number } | null>(null);
  const [readyForNext, setReadyForNext] = useState(false);
  const [finalLeaderboard, setFinalLeaderboard] = useState<any[] | null>(null);
  const timerRef = useRef<number | null>(null);

  const antiCheat = useAntiCheat(socket, !!participant?.enableAntiCheat && screen !== "precheck");

  useEffect(() => {
    if (!participant) {
      navigate("/join");
      return;
    }
    if (!socket) return;

    socket.emit("participant:hello", { participantId: participant.participantId, quizId: participant.quizId });

    const onQuestion = (payload: QuestionPayload) => {
      setQuestion(payload);
      setSelected(null);
      setLastResult(null);
      setReadyForNext(false);
      setSecondsLeft(payload.timerSeconds);
      setScreen("question");
    };
    const onLocked = (result: { correct: boolean; score: number }) => {
      setLastResult(result);
      setScreen("locked_waiting");
    };
    // Round is over server-side (everyone answered or timer expired). No
    // leaderboard is sent to participants — just move them to a light
    // "waiting for the next question" state until question:show arrives.
    const onRoundEnded = () => setScreen("locked_waiting");
    const onEnded = (payload: { leaderboard: any[] }) => {
      setFinalLeaderboard(payload.leaderboard);
      setScreen("ended");
    };
    const onDisqualified = () => setScreen("disqualified");

    socket.on("question:show", onQuestion);
    socket.on("answer:locked", onLocked);
    socket.on("round:ended", onRoundEnded);
    socket.on("quiz:ended", onEnded);
    socket.on("anticheat:disqualified", onDisqualified);

    return () => {
      socket.off("question:show", onQuestion);
      socket.off("answer:locked", onLocked);
      socket.off("round:ended", onRoundEnded);
      socket.off("quiz:ended", onEnded);
      socket.off("anticheat:disqualified", onDisqualified);
    };
  }, [socket, participant, navigate]);

  useEffect(() => {
    if (screen === "ended" && finalLeaderboard) {
      sessionStorage.setItem("qb_final_leaderboard", JSON.stringify(finalLeaderboard));
      navigate("/result");
    }
  }, [screen, finalLeaderboard, navigate]);

  // Local countdown display only — the server owns the authoritative timer
  // and will auto-submit NOT_ATTEMPTED for anyone who hasn't answered when
  // it expires, regardless of what this client shows.
  useEffect(() => {
    if (screen !== "question") return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [screen, question?.id]);

  function submitAnswer(option: string) {
    if (selected || !socket) return;
    setSelected(option);
    socket.emit("answer:submit", { answer: option });
  }

  async function handleEnterFullscreen() {
    if (participant?.enableFullscreen) await antiCheat.enterFullscreen();
    setScreen("question");
  }

  if (!participant) return null;

  if (screen === "disqualified") {
    return (
      <Centered bg="bg-slate-900">
        <p className="text-6xl mb-4">🚫</p>
        <h1 className="text-2xl font-bold text-white mb-2">You've been disqualified</h1>
        <p className="text-white/70">Repeated anti-cheat warnings removed you from this quiz.</p>
      </Centered>
    );
  }

  if (screen === "precheck") {
    return (
      <Centered bg="bg-gradient-to-br from-brand-purple to-brand-pink">
        <p className="text-5xl mb-4">🎮</p>
        <h1 className="text-2xl font-bold text-white mb-2">Ready, {participant.name}?</h1>
        <p className="text-white/80 mb-6 max-w-sm">
          {participant.enableFullscreen
            ? "This quiz runs in fullscreen. Leaving fullscreen or switching tabs will trigger a warning."
            : "The quiz will begin shortly."}
        </p>
        <button
          onClick={handleEnterFullscreen}
          className="bg-white text-brand-purple font-bold px-8 py-3 rounded-xl hover:brightness-95"
        >
          {participant.enableFullscreen ? "Enter Fullscreen & Continue" : "I'm Ready"}
        </button>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {antiCheat.warning && (
        <div className="bg-red-600 text-center py-2 font-bold animate-pop-in">
          ⚠️ {antiCheat.warning.message} (Warning {antiCheat.warning.level}/3)
        </div>
      )}

      <AnimatePresence mode="wait">
        {screen === "question" && question && (
          <motion.div
            key={question.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-white/60">
                Question {question.roundIndex + 1} / {question.totalRounds}
              </span>
              <motion.span
                key={secondsLeft}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className={`text-2xl font-black ${secondsLeft <= 5 ? "text-red-400" : ""}`}
              >
                {secondsLeft}s
              </motion.span>
            </div>

            <h2 className="text-xl md:text-3xl font-bold text-center my-8">{question.question}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto mb-4">
              {question.options.map((opt, ix) => (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  key={opt}
                  disabled={!!selected}
                  onClick={() => submitAnswer(opt)}
                  className={`${OPTION_COLORS[ix % 4]} disabled:opacity-40 rounded-2xl py-6 px-4 text-lg font-bold shadow-lg`}
                >
                  {opt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {screen === "locked_waiting" && (
          <motion.div
            key="locked"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center p-4 text-center"
          >
            {!readyForNext ? (
              <>
                <p className="text-6xl mb-4">{lastResult?.correct ? "✅" : lastResult ? "❌" : "🔒"}</p>
                <h2 className="text-2xl font-bold mb-1">
                  {lastResult
                    ? lastResult.correct
                      ? "Nice! Correct answer"
                      : "Answer locked in"
                    : "Time's up"}
                </h2>
                {lastResult && <p className="text-white/70 mb-8">+{lastResult.score} points</p>}
                <button
                  onClick={() => setReadyForNext(true)}
                  className="bg-brand-purple font-bold px-8 py-3 rounded-xl hover:brightness-110"
                >
                  Next →
                </button>
                <p className="text-white/40 text-xs mt-4 max-w-xs">
                  No need to watch the clock — tap Next whenever you're ready.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <span className="w-2 h-2 rounded-full bg-white/40 animate-pulse" /> Waiting for the next
                question…
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Centered({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <div className={`min-h-screen ${bg} flex flex-col items-center justify-center text-center p-6`}>
      {children}
    </div>
  );
}
