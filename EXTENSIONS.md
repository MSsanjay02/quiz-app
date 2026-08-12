# Extension Points (v2+)

These were explicitly out of scope for v1 (PRD §10) but the codebase leaves clean seams for
each. Nothing below needs a rewrite — each is additive.

## Multiple Select questions
- `backend/prisma/schema.prisma`: add `MULTIPLE_SELECT` to the `QuestionType` enum, run
  `npx prisma migrate dev --name multi_select`. Consider a `correctAnswers String[]` field
  (Postgres array) alongside the existing single `correctAnswer` so MCQ/TRUE_FALSE rows are
  untouched.
- `backend/src/lib/questionTypes.js`: add a `MULTIPLE_SELECT` entry to `VALIDATORS`.
- `backend/src/lib/scoring.js`: decide partial-credit rules (e.g. all-or-nothing vs. per-option).
- `backend/src/socket/engine.js`: `answer:submit` currently expects a single `answer` string —
  accept an array when `question.type === "MULTIPLE_SELECT"`.
- Frontend: extend `QuizEditor.tsx`'s question form and `QuizPlayPage.tsx`'s option renderer
  (currently single-select buttons) to allow multi-toggle before submit.

## Team Mode
- Add a `Team` model (`id, quizId, name`) and a `teamId` FK on `Participant`.
- Scoring: decide whether team score = sum or average of members; leaderboard queries in
  `socket/engine.js` (`computeLeaderboard`) would group by `teamId`.
- Join flow (`routes/participants.js`) would need a team-select step before/after PIN entry.

## Image / Video / Voice questions
- Add `mediaUrl` + `mediaType` (`IMAGE | VIDEO | AUDIO`) to `Question`.
- Needs object storage (S3/Cloudinary) wired into `routes/questions.js` for upload, and a
  `<QuestionMedia>` component on both `QuizEditor.tsx` (admin preview) and `QuizPlayPage.tsx`
  (participant render) before the option grid.

## QR-code join
- Purely additive: generate a QR (e.g. `qrcode` npm package) client-side in
  `AdminDashboard.tsx` / `QuizEditor.tsx` encoding `${CLIENT_ORIGIN}/join?pin=<pin>`.
  `JoinPage.tsx` already reads `?pin=` if present — no backend change needed.

## AI Question Generator / AI Difficulty Analyzer
- New route e.g. `routes/ai.js` calling an LLM with quiz `category`/`title` as context,
  returning draft `Question` rows for the admin to edit before saving (never auto-published).
- Difficulty Analyzer would read `Answer` aggregates already computed in `routes/analytics.js`
  (`hardest/easiest question` there is the seam — extend it into a per-question difficulty
  score instead of just min/max accuracy).

## Multi-instance scaling (Socket.io)
Notes already live at the bottom of `backend/src/socket/engine.js`: swap the in-memory
`liveQuizzes` Map for Redis-backed state and attach `@socket.io/redis-adapter` so rooms and
broadcasts work across multiple Railway instances; move `setTimeout` round timers to a
Redis-backed scheduler so only one instance advances each round.
