import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "../../hooks/useSocket";

type StoredParticipant = {
  participantId: string;
  quizId: string;
  name: string;
  quizTitle: string;
  enableFullscreen: boolean;
  enableAntiCheat: boolean;
};

export default function LobbyPage() {
  const navigate = useNavigate();
  const socket = useSocket();
  const [participant] = useState<StoredParticipant | null>(() => {
    const raw = sessionStorage.getItem("qb_participant");
    return raw ? JSON.parse(raw) : null;
  });
  const [count, setCount] = useState(1);
  const [avatars, setAvatars] = useState<string[]>([]);

  useEffect(() => {
    if (!participant) {
      navigate("/join");
      return;
    }
    if (!socket) return;

    socket.emit("participant:hello", {
      participantId: participant.participantId,
      quizId: participant.quizId,
    });

    const onLobby = ({ count }: { count: number }) => {
      setCount(count);
      setAvatars((prev) => [...prev, "🙋"].slice(-12));
    };
    const onStarted = () => navigate("/play");

    socket.on("lobby:update", onLobby);
    socket.on("quiz:started", onStarted);
    return () => {
      socket.off("lobby:update", onLobby);
      socket.off("quiz:started", onStarted);
    };
  }, [socket, participant, navigate]);

  if (!participant) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-teal via-brand-purple to-brand-pink flex flex-col items-center justify-center text-white p-4">
      <motion.h1
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="text-2xl md:text-4xl font-extrabold text-center mb-2"
      >
        {participant.quizTitle}
      </motion.h1>
      <p className="text-white/80 mb-8">Waiting for the host to start…</p>

      <div className="bg-white/10 backdrop-blur rounded-2xl px-8 py-6 text-center mb-8">
        <p className="text-5xl font-black">{count}</p>
        <p className="text-white/70 uppercase text-xs tracking-widest mt-1">Players joined</p>
      </div>

      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        <AnimatePresence>
          {avatars.map((a, ix) => (
            <motion.span
              key={ix}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-2xl"
            >
              {a}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <p className="mt-10 text-sm text-white/60">You're in as <strong>{participant.name}</strong></p>
    </div>
  );
}
