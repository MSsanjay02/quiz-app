import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

type WarningState = { level: number; message: string } | null;

/**
 * Wires up fullscreen enforcement, tab-switch/focus/devtools detection,
 * and copy/right-click prevention. Reports events to the server via
 * `anticheat:event`; the server owns the warning escalation (1/2/3 ->
 * disqualify) and audit log — this hook only detects + relays + reflects
 * the resulting warning/disqualify state back into the UI.
 */
export function useAntiCheat(socket: Socket | null, enabled: boolean) {
  const [warning, setWarning] = useState<WarningState>(null);
  const [disqualified, setDisqualified] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const devtoolsCheckRef = useRef<number | null>(null);

  function report(type: string, meta: Record<string, unknown> = {}) {
    socket?.emit("anticheat:event", { type, meta });
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers require a user gesture; caller should trigger this
      // from a click handler (e.g. "Enter Fullscreen to Begin" button).
    }
  }

  useEffect(() => {
    if (!enabled || !socket) return;

    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) report("FULLSCREEN_EXIT");
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") report("TAB_SWITCH");
    };

    const onBlur = () => report("FOCUS_LOSS");

    const onKeyDown = (e: KeyboardEvent) => {
      const isDevtoolsCombo =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i")) ||
        (e.ctrlKey && e.shiftKey && (e.key === "J" || e.key === "j"));
      if (isDevtoolsCombo) {
        e.preventDefault();
        report("DEVTOOLS_DETECTED", { key: e.key });
      }
      if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        report("COPY_ATTEMPT");
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      report("COPY_ATTEMPT");
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onSelectStart = (e: Event) => e.preventDefault();

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectstart", onSelectStart);

    // Lightweight devtools-open heuristic via viewport delta polling.
    devtoolsCheckRef.current = window.setInterval(() => {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > 160 || heightDelta > 160) {
        report("DEVTOOLS_DETECTED", { heuristic: "viewport-delta" });
      }
    }, 2000);

    const onWarning = ({ level, message }: { level: number; message: string }) =>
      setWarning({ level, message });
    const onDisqualified = () => setDisqualified(true);
    socket.on("anticheat:warning", onWarning);
    socket.on("anticheat:disqualified", onDisqualified);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
      if (devtoolsCheckRef.current) window.clearInterval(devtoolsCheckRef.current);
      socket.off("anticheat:warning", onWarning);
      socket.off("anticheat:disqualified", onDisqualified);
    };
  }, [socket, enabled]);

  return { warning, disqualified, isFullscreen, enterFullscreen, clearWarning: () => setWarning(null) };
}
