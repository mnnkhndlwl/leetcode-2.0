import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { WS_URL } from "../config";
import useUserStore from "../store/useUserStore";

// phase: "idle" | "connecting" | "watching" | "done" | "error"
//
// Opens a Socket.IO connection (JWT in the handshake), emits `watch:submission`,
// and resolves once the ws-server emits `submission:result` / `submission:error`.
export function useSubmissionWatcher() {
  const socketRef = useRef(null);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPhase("idle");
    setResult(null);
    setError(null);
  }, []);

  const watch = useCallback((submissionId) => {
    const token = useUserStore.getState().token;

    // Tear down any previous connection before starting a new watch.
    socketRef.current?.disconnect();
    setResult(null);
    setError(null);
    setPhase("connecting");

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"], // RN: skip long-polling, go straight to ws
      forceNew: true,
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setPhase("watching");
      socket.emit("watch:submission", submissionId);
    });

    socket.on("submission:result", (data) => {
      setResult(data);
      setPhase("done");
      socket.disconnect();
    });

    socket.on("submission:error", (e) => {
      setError(e?.message ?? "Submission error");
      setPhase("error");
      socket.disconnect();
    });

    socket.on("connect_error", (e) => {
      setError(e?.message ?? "Connection failed");
      setPhase("error");
    });
  }, []);

  // Always close the socket when the screen unmounts.
  useEffect(() => () => socketRef.current?.disconnect(), []);

  return { phase, result, error, watch, reset };
}
