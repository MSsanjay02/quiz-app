const express = require("express");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

// Per-participant anti-cheat audit trail
router.get("/:quizId/audit", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId, adminId: req.admin.id },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const participants = await prisma.participant.findMany({
      where: { quizId: quiz.id },
      include: { auditEvents: { orderBy: { createdAt: "asc" } } },
      orderBy: { name: "asc" },
    });

    res.json(
      participants.map((p) => ({
        participantId: p.id,
        name: p.name,
        warnings: p.warnings,
        disqualified: p.disqualified,
        connected: p.connected,
        events: p.auditEvents.map((e) => ({ type: e.type, meta: e.meta, at: e.createdAt })),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Question-level analytics: hardest/easiest question, avg time per question
router.get("/:quizId/questions", async (req, res, next) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId, adminId: req.admin.id },
      include: { questions: { include: { answers: true }, orderBy: { order: "asc" } } },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const stats = quiz.questions.map((q) => {
      const attempted = q.answers.filter((a) => a.status !== "NOT_ATTEMPTED");
      const correct = q.answers.filter((a) => a.status === "CORRECT");
      const accuracy = attempted.length ? correct.length / attempted.length : 0;
      const avgTimeMs = attempted.length
        ? Math.round(attempted.reduce((s, a) => s + a.timeTakenMs, 0) / attempted.length)
        : 0;
      return { questionId: q.id, question: q.question, accuracy, avgTimeMs, attempts: attempted.length };
    });

    const ranked = [...stats].sort((a, b) => a.accuracy - b.accuracy);
    res.json({
      questions: stats,
      hardest: ranked[0] || null,
      easiest: ranked[ranked.length - 1] || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
