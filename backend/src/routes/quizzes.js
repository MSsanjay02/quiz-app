const express = require("express");
const { z } = require("zod");
const xss = require("xss");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../middleware/auth");
const { generateUniquePin } = require("../lib/pin");

const router = express.Router();
router.use(requireAdmin);

const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  maxParticipants: z.number().int().min(1).max(150).default(150),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  enableLeaderboard: z.boolean().default(true),
  enableAntiCheat: z.boolean().default(true),
  enableFullscreen: z.boolean().default(true),
});

router.get("/", async (req, res, next) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { adminId: req.admin.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true, participants: true } } },
    });
    res.json(quizzes);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    res.json(quiz);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = quizSchema.parse(req.body);
    data.title = xss(data.title);
    if (data.description) data.description = xss(data.description);

    const quiz = await prisma.quiz.create({
      data: { ...data, adminId: req.admin.id },
    });
    res.status(201).json(quiz);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = quizSchema.partial().parse(req.body);
    if (data.title) data.title = xss(data.title);
    if (data.description) data.description = xss(data.description);

    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    if (quiz.status !== "DRAFT") {
      return res.status(400).json({ error: "Only draft quizzes can be edited" });
    }

    const updated = await prisma.quiz.update({ where: { id: quiz.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    await prisma.quiz.delete({ where: { id: quiz.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Publish: generates the PIN and moves DRAFT -> PUBLISHED (ready for participants to join lobby)
router.post("/:id/publish", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
      include: { questions: true },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    if (quiz.questions.length === 0) {
      return res.status(400).json({ error: "Add at least one question before publishing" });
    }
    if (quiz.status !== "DRAFT") {
      return res.status(400).json({ error: "Quiz already published" });
    }

    const pin = await generateUniquePin();
    const updated = await prisma.quiz.update({
      where: { id: quiz.id },
      data: { pin, status: "PUBLISHED" },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/results", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const participants = await prisma.participant.findMany({
      where: { quizId: quiz.id },
      include: { answers: true },
      orderBy: { score: "desc" },
    });

    const results = participants.map((p, ix) => {
      const attempted = p.answers.filter((a) => a.status !== "NOT_ATTEMPTED");
      const correct = p.answers.filter((a) => a.status === "CORRECT");
      const accuracy = attempted.length ? Math.round((correct.length / attempted.length) * 100) : 0;
      const avgTimeMs = attempted.length
        ? Math.round(attempted.reduce((s, a) => s + a.timeTakenMs, 0) / attempted.length)
        : 0;
      return {
        rank: ix + 1,
        name: p.name,
        score: p.score,
        accuracy,
        avgTimeMs,
        warnings: p.warnings,
        disqualified: p.disqualified,
      };
    });

    res.json({ quiz: { id: quiz.id, title: quiz.title }, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
