const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { computeScore } = require("../lib/scoring");

// In-memory authoritative state per live quiz. Fine for a single-process
// deployment (Railway); for multi-instance scaling, back this with Redis
// (the ioredis client in lib/redis.js is already wired for a socket.io
// Redis adapter — see NOTES at the bottom of this file).
const liveQuizzes = new Map();
// liveQuizzes[quizId] = {
//   status, roundIndex, roundTimer (Timeout), roundStartedAt, roundDurationMs,
//   participants: Map<participantId, { socketId, questionOrder: [questionId...], answeredThisRound: bool, disconnectTimer }>
// }

const WARNING_MESSAGES = {
  1: "Do Not Leave Quiz Window",
  2: "Final Warning",
};
const RECONNECT_GRACE_MS = 30_000;

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLive(quizId) {
  return liveQuizzes.get(quizId);
}

function publicQuestion(question) {
  const options = [question.optionA, question.optionB, question.optionC, question.optionD].filter(
    Boolean
  );
  return {
    id: question.id,
    type: question.type,
    question: question.question,
    options: shuffle(options),
    timerSeconds: question.timerSeconds,
  };
}

async function computeLeaderboard(quizId) {
  const participants = await prisma.participant.findMany({
    where: { quizId, disqualified: false },
    orderBy: { score: "desc" },
  });
  return participants.map((p, ix) => ({ rank: ix + 1, name: p.name, score: p.score, id: p.id }));
}

function initSocket(io) {
  const nsp = io.of("/quiz");

  nsp.on("connection", (socket) => {
    // ---- ADMIN AUTH ----
    socket.on("admin:auth", async ({ token, quizId }) => {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role !== "admin") throw new Error("not admin");
        const quiz = await prisma.quiz.findFirst({ where: { id: quizId, adminId: payload.sub } });
        if (!quiz) throw new Error("quiz not found");

        socket.data.role = "admin";
        socket.data.quizId = quizId;
        socket.join(`quiz:${quizId}:admin`);
        socket.join(`quiz:${quizId}`);
        socket.emit("admin:ready", { quiz });

        const live = getLive(quizId);
        if (live) {
          socket.emit("quiz:status", { status: live.status, roundIndex: live.roundIndex });
        }
      } catch (err) {
        socket.emit("error:auth", { error: "Admin auth failed" });
      }
    });

    // ---- PARTICIPANT JOIN (post REST /participants/join) ----
    socket.on("participant:hello", async ({ participantId, quizId }) => {
      try {
        const participant = await prisma.participant.findFirst({
          where: { id: participantId, quizId },
        });
        if (!participant) throw new Error("not found");

        socket.data.role = "participant";
        socket.data.participantId = participantId;
        socket.data.quizId = quizId;
        socket.join(`quiz:${quizId}`);
        socket.join(`participant:${participantId}`);

        await prisma.participant.update({
          where: { id: participantId },
          data: { connected: true, socketId: socket.id, lastSeenAt: new Date() },
        });

        let live = getLive(quizId);
        if (live) {
          const p = live.participants.get(participantId);
          if (p) {
            clearTimeout(p.disconnectTimer);
            p.socketId = socket.id;
          }
        }

        const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
        const count = await prisma.participant.count({ where: { quizId } });
        nsp.to(`quiz:${quizId}`).emit("lobby:update", { count, quizTitle: quiz.title });

        if (live && live.status === "LIVE") {
          // Reconnect mid-quiz: resume current round state
          const roundInfo = live.roundPublicByParticipant?.get(participantId);
          socket.emit("quiz:resume_state", {
            roundIndex: live.roundIndex,
            question: roundInfo || null,
            score: participant.score,
            warnings: participant.warnings,
          });
        }
      } catch (err) {
        socket.emit("error:join", { error: "Could not join session" });
      }
    });

    // ---- ADMIN: START QUIZ ----
    socket.on("quiz:start", async () => {
      if (socket.data.role !== "admin") return;
      const quizId = socket.data.quizId;
      try {
        const quiz = await prisma.quiz.findUnique({
          where: { id: quizId },
          include: { questions: { orderBy: { order: "asc" } } },
        });
        if (!quiz || quiz.questions.length === 0) return;

        const participants = await prisma.participant.findMany({ where: { quizId } });

        const live = {
          status: "LIVE",
          roundIndex: -1,
          roundTimer: null,
          questions: quiz.questions,
          shuffleQuestions: quiz.shuffleQuestions,
          participants: new Map(),
          roundPublicByParticipant: new Map(),
          answeredCount: 0,
        };

        for (const p of participants) {
          const order = quiz.shuffleQuestions
            ? shuffle(quiz.questions.map((q) => q.id))
            : quiz.questions.map((q) => q.id);
          live.participants.set(p.id, { order, disconnectTimer: null });
        }

        liveQuizzes.set(quizId, live);
        await prisma.quiz.update({ where: { id: quizId }, data: { status: "LIVE", currentQuestionIx: -1 } });

        nsp.to(`quiz:${quizId}`).emit("quiz:started");
        advanceRound(nsp, quizId);
      } catch (err) {
        console.error("quiz:start error", err);
      }
    });

    // ---- PARTICIPANT: SUBMIT ANSWER ----
    socket.on("answer:submit", async ({ answer }) => {
      const { role, participantId, quizId } = socket.data;
      if (role !== "participant") return;
      const live = getLive(quizId);
      if (!live || live.status !== "LIVE") return;

      try {
        const pState = live.participants.get(participantId);
        if (!pState || pState.answeredThisRound) return;

        const questionId = pState.order[live.roundIndex];
        const question = live.questions.find((q) => q.id === questionId);
        if (!question) return;

        const existing = await prisma.answer.findUnique({
          where: { participantId_questionId: { participantId, questionId } },
        });
        if (existing) return;

        const elapsedMs = Date.now() - live.roundStartedAt;
        const remainingSeconds = Math.max(0, live.roundDurationMs / 1000 - elapsedMs / 1000);
        const isCorrect = String(answer).trim() === String(question.correctAnswer).trim();
        const score = computeScore({ isCorrect, remainingSeconds });

        await prisma.answer.create({
          data: {
            participantId,
            questionId,
            answer: String(answer),
            status: isCorrect ? "CORRECT" : "WRONG",
            timeTakenMs: elapsedMs,
            score,
          },
        });
        await prisma.participant.update({
          where: { id: participantId },
          data: { score: { increment: score } },
        });

        pState.answeredThisRound = true;
        live.answeredCount += 1;

        socket.emit("answer:locked", { correct: isCorrect, score });
        broadcastAdminProgress(nsp, quizId, live);

        // If everyone connected has answered, end the round early.
        const connectedCount = [...live.participants.values()].filter((p) => !p.disconnectTimer).length;
        if (live.answeredCount >= connectedCount) {
          endRound(nsp, quizId);
        }
      } catch (err) {
        console.error("answer:submit error", err);
      }
    });

    // ---- ADMIN EMERGENCY CONTROLS ----
    socket.on("quiz:pause", async () => {
      if (socket.data.role !== "admin") return;
      const live = getLive(socket.data.quizId);
      if (!live) return;
      live.status = "PAUSED";
      clearTimeout(live.roundTimer);
      await prisma.quiz.update({ where: { id: socket.data.quizId }, data: { status: "PAUSED" } });
      nsp.to(`quiz:${socket.data.quizId}`).emit("quiz:paused");
    });

    socket.on("quiz:resume", async () => {
      if (socket.data.role !== "admin") return;
      const quizId = socket.data.quizId;
      const live = getLive(quizId);
      if (!live) return;
      live.status = "LIVE";
      await prisma.quiz.update({ where: { id: quizId }, data: { status: "LIVE" } });
      nsp.to(`quiz:${quizId}`).emit("quiz:resumed");
      const remaining = live.roundDurationMs - (Date.now() - live.roundStartedAt);
      if (remaining > 0) {
        live.roundTimer = setTimeout(() => endRound(nsp, quizId), remaining);
      } else {
        endRound(nsp, quizId);
      }
    });

    socket.on("quiz:skip", async () => {
      if (socket.data.role !== "admin") return;
      const quizId = socket.data.quizId;
      const live = getLive(quizId);
      if (!live) return;
      clearTimeout(live.roundTimer);
      endRound(nsp, quizId);
    });

    socket.on("quiz:end", async () => {
      if (socket.data.role !== "admin") return;
      await finishQuiz(nsp, socket.data.quizId);
    });

    // ---- ANTI-CHEAT EVENTS ----
    socket.on("anticheat:event", async ({ type, meta }) => {
      const { role, participantId, quizId } = socket.data;
      if (role !== "participant") return;
      try {
        await prisma.auditEvent.create({ data: { participantId, type, meta: meta || {} } });

        const WARNABLE = ["TAB_SWITCH", "FOCUS_LOSS", "FULLSCREEN_EXIT", "DEVTOOLS_DETECTED", "COPY_ATTEMPT"];
        if (!WARNABLE.includes(type)) return;

        const participant = await prisma.participant.update({
          where: { id: participantId },
          data: { warnings: { increment: 1 } },
        });

        if (participant.warnings >= 3) {
          await prisma.participant.update({ where: { id: participantId }, data: { disqualified: true } });
          await prisma.auditEvent.create({ data: { participantId, type: "DISQUALIFIED" } });
          nsp.to(`participant:${participantId}`).emit("anticheat:disqualified");
          nsp.to(`quiz:${quizId}:admin`).emit("anticheat:disqualified", { participantId, name: participant.name });
        } else {
          await prisma.auditEvent.create({
            data: { participantId, type: "WARNING_ISSUED", meta: { level: participant.warnings } },
          });
          nsp.to(`participant:${participantId}`).emit("anticheat:warning", {
            level: participant.warnings,
            message: WARNING_MESSAGES[participant.warnings] || "Warning",
          });
        }
        nsp.to(`quiz:${quizId}:admin`).emit("anticheat:update", {
          participantId,
          name: participant.name,
          warnings: participant.warnings,
        });
      } catch (err) {
        console.error("anticheat:event error", err);
      }
    });

    // ---- DISCONNECT / RECONNECT GRACE ----
    socket.on("disconnect", async () => {
      const { role, participantId, quizId } = socket.data;
      if (role !== "participant" || !participantId) return;
      try {
        await prisma.participant.update({ where: { id: participantId }, data: { connected: false } });
        await prisma.auditEvent.create({ data: { participantId, type: "DISCONNECT" } });

        const live = getLive(quizId);
        if (live) {
          const pState = live.participants.get(participantId);
          if (pState) {
            pState.disconnectTimer = setTimeout(async () => {
              // Grace period expired without reconnect — leave state as-is
              // (score/warnings/order preserved; they just won't get further rounds).
              pState.disconnectTimer = null;
            }, RECONNECT_GRACE_MS);
          }
        }
        nsp.to(`quiz:${quizId}:admin`).emit("participant:disconnected", { participantId });
      } catch (err) {
        console.error("disconnect handler error", err);
      }
    });
  });
}

function broadcastAdminProgress(nsp, quizId, live) {
  nsp.to(`quiz:${quizId}:admin`).emit("round:progress", {
    answered: live.answeredCount,
    total: live.participants.size,
  });
}

async function advanceRound(nsp, quizId) {
  const live = getLive(quizId);
  if (!live) return;

  live.roundIndex += 1;
  live.answeredCount = 0;
  for (const p of live.participants.values()) p.answeredThisRound = false;

  if (live.roundIndex >= live.questions.length) {
    return finishQuiz(nsp, quizId);
  }

  // Round timer is taken from the canonical (admin-authored) question order,
  // so every participant's round-N clock matches even though their round-N
  // question content differs when shuffleQuestions is on.
  const canonicalQuestion = live.questions[live.roundIndex];
  live.roundDurationMs = canonicalQuestion.timerSeconds * 1000;
  live.roundStartedAt = Date.now();

  await prisma.quiz.update({ where: { id: quizId }, data: { currentQuestionIx: live.roundIndex } });

  for (const [participantId, pState] of live.participants.entries()) {
    const questionId = pState.order[live.roundIndex];
    const question = live.questions.find((q) => q.id === questionId);
    const payload = publicQuestion(question);
    live.roundPublicByParticipant.set(participantId, payload);
    nsp.to(`participant:${participantId}`).emit("question:show", {
      roundIndex: live.roundIndex,
      totalRounds: live.questions.length,
      ...payload,
    });
  }

  nsp.to(`quiz:${quizId}:admin`).emit("round:started", {
    roundIndex: live.roundIndex,
    totalRounds: live.questions.length,
    durationSeconds: canonicalQuestion.timerSeconds,
  });

  live.roundTimer = setTimeout(() => endRound(nsp, quizId), live.roundDurationMs);
}

async function endRound(nsp, quizId) {
  const live = getLive(quizId);
  if (!live || live.status !== "LIVE") return;
  clearTimeout(live.roundTimer);

  // Auto-submit NOT_ATTEMPTED (score 0) for anyone who didn't answer this round.
  for (const [participantId, pState] of live.participants.entries()) {
    if (pState.answeredThisRound) continue;
    const questionId = pState.order[live.roundIndex];
    const already = await prisma.answer.findUnique({
      where: { participantId_questionId: { participantId, questionId } },
    });
    if (already) continue;
    await prisma.answer.create({
      data: { participantId, questionId, answer: null, status: "NOT_ATTEMPTED", timeTakenMs: live.roundDurationMs, score: 0 },
    });
  }

  // NOTE: per an explicit follow-up instruction on this build, participants
  // never see the leaderboard at all during the live test — not even their
  // own rank mid-quiz — so leaderboard data here is admin-only (Module 10's
  // admin view). Participants just get told the round is over so their UI
  // can move to a lightweight "waiting for next question" state instead of
  // sitting on a frozen countdown.
  const leaderboard = await computeLeaderboard(quizId);
  nsp.to(`quiz:${quizId}:admin`).emit("leaderboard:admin", { leaderboard, roundIndex: live.roundIndex });
  nsp.to(`quiz:${quizId}`).emit("round:ended", { roundIndex: live.roundIndex });

  setTimeout(() => advanceRound(nsp, quizId), 1500);
}

async function finishQuiz(nsp, quizId) {
  const live = getLive(quizId);
  if (live) clearTimeout(live.roundTimer);

  await prisma.quiz.update({ where: { id: quizId }, data: { status: "COMPLETED" } });

  const leaderboard = await computeLeaderboard(quizId);
  // Assign final rank on the Participant rows for fast reads later.
  await Promise.all(
    leaderboard.map((r) => prisma.participant.update({ where: { id: r.id }, data: { rank: r.rank } }))
  );

  nsp.to(`quiz:${quizId}`).emit("quiz:ended", {
    leaderboard: leaderboard.map(({ id, ...r }) => r),
  });
  liveQuizzes.delete(quizId);
}

module.exports = { initSocket };

// NOTES on scaling beyond one process:
// - Swap `liveQuizzes` (in-memory Map) for state stored in Redis (lib/redis.js
//   is already configured) and attach @socket.io/redis-adapter to `io` so
//   rooms/broadcasts work across instances.
// - Round timers (setTimeout) would move to a Redis-backed scheduler (e.g. a
//   sorted set of round-end timestamps polled by a single elected worker) so
//   only one instance advances each round.
