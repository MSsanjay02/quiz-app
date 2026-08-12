import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io(`${import.meta.env.VITE_SOCKET_URL || "http://localhost:4000"}/quiz`, {
      transports: ["websocket"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    ref.current = s;
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, []);

  return socket;
}
