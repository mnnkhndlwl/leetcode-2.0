import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { WS_URL } from "../config";
import useUserStore from "../store/useUserStore";

// phase: "idle" | "connecting" | "watching" | "error"
export function useContestWatcher() {
  const socketRef = useRef(null);

  const [phase, setPhase] = useState("idle");
  const [leaderboard, setLeaderboard] = useState([]);
  const [rank, setRank] = useState(null);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPhase("idle");
    setLeaderboard([]);
    setRank(null);
    setError(null);
  }, []);

  const watch = useCallback((contestId) => {
    const token = useUserStore.getState().token;

    // Tear down any previous connection before starting a new watch.
    socketRef.current?.disconnect();
    setLeaderboard([]);
    setRank(null);
    setError(null);
    setPhase("connecting");

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"], // RN: skip long-polling; go straight to ws
      forceNew: true,
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setPhase("watching");
      socket.emit("watch:contest", contestId);
    });

    socket.on("contest:leaderboard", (data) => {
      // Server emits: { top50, updatedAt }
      setLeaderboard(data?.top50 ?? []);
    });

    socket.on("contest:rank", (data) => {
      // Server emits: { rank }
      setRank(data?.rank ?? null);
    });

    socket.on("contest:error", (e) => {
      setError(e?.message ?? "Contest error");
      setPhase("error");
      socket.disconnect();
    });

    socket.on("connect_error", (e) => {
      setError(e?.message ?? "Connection failed");
      setPhase("error");
    });
  }, []);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  return { phase, leaderboard, rank, error, watch, reset };
}

