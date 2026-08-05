import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { submissions } from "./schema.js";
import { subscribe } from "./redis.js";
import {
  sendContestSnapshot,
  startContestBroadcastTicker,
  roomName,
} from "./contestRoom.js";

const PORT = process.env.PORT ?? 3001;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── HTTP + Socket.IO bootstrap ───────────────────────────────────────────────

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    // CORS_ORIGIN can be a comma-separated list: "http://localhost:8081,https://app.example.com"
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? "*",
    methods: ["GET", "POST"],
  },
});

// ── Auth middleware ──────────────────────────────────────────────────────────
// Client must pass the JWT as:  { auth: { token: "<jwt>" } }  in the
// Socket.IO handshake options.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("UNAUTHORIZED: missing token"));
  }
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("UNAUTHORIZED: invalid or expired token"));
  }
});

// ── Connection handler ───────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[ws] + connected   userId=${socket.user.id}  socketId=${socket.id}`);

  // ── watch:submission ──────────────────────────────────────────────────────
  // Client emits this immediately after connecting to subscribe to a verdict.
  //
  // Events emitted back:
  //   submission:result  { submissionId, status, runtimeMs, memoryUsedMb,
  //                        compileError, testCaseResults, passedCount, totalCount }
  //   submission:error   { message }
  socket.on("watch:submission", async (submissionId) => {
    if (typeof submissionId !== "string" || !submissionId.trim()) {
      socket.emit("submission:error", { message: "Invalid submissionId" });
      return;
    }

    try {
      const [row] = await db
        .select({
          userId: submissions.userId,
          status: submissions.status,
          runtimeMs: submissions.runtimeMs,
          memoryUsedMb: submissions.memoryUsedMb,
          compileError: submissions.compileError,
          testCaseResults: submissions.testCaseResults,
        })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);

      // Ownership check — never let a user watch someone else's submission.
      if (!row || row.userId !== socket.user.id) {
        socket.emit("submission:error", {
          message: "Submission not found or access denied",
        });
        return;
      }

      // Race-condition guard: if the result arrived before the client connected
      // (e.g. very fast judge, slow mobile network) emit from DB immediately
      // instead of subscribing to a channel that will never fire again.
      if (row.status !== "PENDING" && row.status !== "RUNNING") {
        const testCaseResults = row.testCaseResults ?? [];
        socket.emit("submission:result", {
          submissionId,
          status: row.status,
          runtimeMs: row.runtimeMs,
          memoryUsedMb: row.memoryUsedMb,
          compileError: row.compileError ?? null,
          testCaseResults,
          passedCount: testCaseResults.filter((t) => t.passed).length,
          totalCount: testCaseResults.length,
        });
        return;
      }

      // Submission is still PENDING/RUNNING — subscribe to Redis and wait.
      const channel = `submission:${submissionId}`;

      const unsub = subscribe(channel, (message) => {
        try {
          socket.emit("submission:result", JSON.parse(message));
        } catch (err) {
          console.error(`[ws] failed to emit result for ${submissionId}:`, err.message);
        }
        cleanup();
      });

      // One-shot: clean up after verdict arrives OR if the client disconnects
      // early (e.g. user navigates away before judging finishes).
      function cleanup() {
        unsub();
        socket.off("disconnect", cleanup);
      }
      socket.once("disconnect", cleanup);

      console.log(`[ws] watching  userId=${socket.user.id}  submissionId=${submissionId}`);
    } catch (err) {
      console.error(
        `[ws] watch:submission error — userId=${socket.user.id} submissionId=${submissionId}:`,
        err.message
      );
      socket.emit("submission:error", { message: "Internal server error" });
    }
  });

  // ── watch:contest ─────────────────────────────────────────────────────────
  // Joins the Socket.IO room for a contest's live leaderboard. The 10s
  // broadcast ticker (startContestBroadcastTicker) pushes `contest:leaderboard`
  // to everyone in the room, plus a personal `contest:rank` to anyone outside
  // the top 50 — this just sends an immediate one-shot snapshot so the client
  // isn't waiting for the next tick.
  socket.on("watch:contest", async (contestId) => {
    if (typeof contestId !== "string" || !UUID_RE.test(contestId)) {
      socket.emit("contest:error", { message: "Invalid contestId" });
      return;
    }

    socket.join(roomName(contestId));

    try {
      await sendContestSnapshot(socket, contestId);
    } catch (err) {
      console.error(
        `[ws] watch:contest error — userId=${socket.user.id} contestId=${contestId}:`,
        err.message,
      );
      socket.emit("contest:error", { message: "Internal server error" });
    }
  });

  socket.on("unwatch:contest", (contestId) => {
    if (typeof contestId === "string" && UUID_RE.test(contestId)) {
      socket.leave(roomName(contestId));
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[ws] - disconnected userId=${socket.user.id}  socketId=${socket.id}  reason=${reason}`);
  });
});

startContestBroadcastTicker(io);

// ── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`WebSocket server listening on :${PORT}`);
});
