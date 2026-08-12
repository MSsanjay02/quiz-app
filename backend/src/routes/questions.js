const express = require("express");
const { z } = require("zod");
const xss = require("xss");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../middleware/auth");
const { validateQuestion } = require("../lib/questionTypes");

const router = express.Router();
router.use(requireAdmin);

const questionSchema = z.object({
  type: z.enum(["MCQ", "TRUE_FALSE"]).default("MCQ"),
  question: z.string().min(1).max(1000),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().optional(),
  optionD: z.string().optional(),
  correctAnswer: z.string().min(1),
  timerSeconds: z.number().int().min(5).max(120).default(20),
});

async function assertOwnedQuiz(quizId, adminId) {
  const quiz = await prisma.quiz.findFirst({ where: { id: quizId, adminId } });
  if (!quiz) {
    const err = new Error("Quiz not found");
    err.status = 404;
    throw err;
  }
  if (quiz.status !== "DRAFT") {
    const err = new Error("Questions can only be edited while the quiz is a draft");
    err.status = 400;
    throw err;
  }
  return quiz;
}

router.post("/quiz/:quizId", async (req, res, next) => {
  try {
    const quiz = await assertOwnedQuiz(req.params.quizId, req.admin.id);
    const data = questionSchema.parse(req.body);

    if (data.type === "TRUE_FALSE") {
      data.optionA = "True";
      data.optionB = "False";
      data.optionC = undefined;
      data.optionD = undefined;
    }
    if (!validateQuestion(data.type, data)) {
      return res.status(400).json({ error: "Invalid question payload for type" });
    }

    data.question = xss(data.question);

    const count = await prisma.question.count({ where: { quizId: quiz.id } });
    const created = await prisma.question.create({
      data: { ...data, quizId: quiz.id, order: count },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: { quiz: true },
    });
    if (!existing || existing.quiz.adminId !== req.admin.id) {
      return res.status(404).json({ error: "Question not found" });
    }
    await assertOwnedQuiz(existing.quizId, req.admin.id);

    const data = questionSchema.partial().parse(req.body);
    if (data.question) data.question = xss(data.question);

    const updated = await prisma.question.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: { quiz: true },
    });
    if (!existing || existing.quiz.adminId !== req.admin.id) {
      return res.status(404).json({ error: "Question not found" });
    }
    await assertOwnedQuiz(existing.quizId, req.admin.id);

    await prisma.question.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/quiz/:quizId/reorder", async (req, res, next) => {
  try {
    const quiz = await assertOwnedQuiz(req.params.quizId, req.admin.id);
    const orderSchema = z.object({ orderedIds: z.array(z.string()) });
    const { orderedIds } = orderSchema.parse(req.body);

    await prisma.$transaction(
      orderedIds.map((id, ix) =>
        prisma.question.update({ where: { id }, data: { order: ix } })
      )
    );
    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      orderBy: { order: "asc" },
    });
    res.json(questions);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
