const BASE_SCORE = 100;
const SPEED_BONUS_PER_SECOND = 2;

/**
 * Score = 100 (correct) + remainingSeconds * 2. Wrong / unanswered = 0.
 */
function computeScore({ isCorrect, remainingSeconds }) {
  if (!isCorrect) return 0;
  const bonus = Math.max(0, Math.round(remainingSeconds)) * SPEED_BONUS_PER_SECOND;
  return BASE_SCORE + bonus;
}

module.exports = { computeScore, BASE_SCORE, SPEED_BONUS_PER_SECOND };
