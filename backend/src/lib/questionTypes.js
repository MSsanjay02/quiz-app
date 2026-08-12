// Extension point for future question types.
// v1 supports MCQ and TRUE_FALSE only (see PRD section 10 — out of scope for v1).
// To add MULTIPLE_SELECT later:
//   1. Add MULTIPLE_SELECT to the QuestionType enum in prisma/schema.prisma + migrate.
//   2. Add a validator below and wire scoring rules into lib/scoring.js.
//   3. Extend the frontend QuestionEditor + QuestionCard components for the new shape.

const VALIDATORS = {
  MCQ: (q) =>
    typeof q.optionA === "string" &&
    typeof q.optionB === "string" &&
    typeof q.correctAnswer === "string",
  TRUE_FALSE: (q) => ["True", "False"].includes(q.correctAnswer),
};

function validateQuestion(type, payload) {
  const fn = VALIDATORS[type];
  if (!fn) throw new Error(`Unsupported question type: ${type}`);
  return fn(payload);
}

module.exports = { validateQuestion, SUPPORTED_TYPES: Object.keys(VALIDATORS) };
