const express = require("express");
const { z } = require("zod");
const xss = require("xss");
const prisma = require("../lib/prisma");
const { joinLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const joinSchema = z.object({
  name: z.string().min(1).max(40),
  pin: z.string().length(6),
});

// Auto-suffix duplicate names within a quiz: "Sanjay", "Sanjay#2", "Sanjay#3", ...
async function dedupeName(quizId, rawName) {
  const base = rawName.trim();
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.participant.findUnique({
      where: { quizId_name: { quizId, name: candidate } },
    });
    if (!existing) return candidate;
    candidate = `${base}#${n}`;
    n += 1;
  }
}

router.post("/join", joinLimiter, async (req, res, next) => {
  try {
    const { name, pin } = joinSchema.parse(req.body);
    const cleanName = xss(name.trim());
    if (!cleanName) return res.status(400).json({ error: "Name is required" });

    const quiz = await prisma.quiz.findFirst({
      where: { pin, status: { in: ["PUBLISHED", "LOBBY"] } },
    });
    if (!quiz) return res.status(404).json({ error: "Invalid or expired PIN" });

    const currentCount = await prisma.participant.count({ where: { quizId: quiz.id } });
    if (currentCount >= quiz.maxParticipants) {
      return res.status(409).json({ error: "This quiz is full" });
    }

    const finalName = await dedupeName(quiz.id, cleanName);

    const participant = await prisma.participant.create({
      data: { quizId: quiz.id, name: finalName },
    });

    if (quiz.status === "PUBLISHED") {
      await prisma.quiz.update({ where: { id: quiz.id }, data: { status: "LOBBY" } });
    }

    res.status(201).json({
      participantId: participant.id,
      quizId: quiz.id,
      name: participant.name,
      quizTitle: quiz.title,
      enableFullscreen: quiz.enableFullscreen,
      enableAntiCheat: quiz.enableAntiCheat,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
