# QuizBlast

Real-time, anti-cheating quiz platform for college events (Kahoot-style).

## Stack
- Frontend: React + TypeScript, Tailwind, Framer Motion, Socket.io client, React Query (Vite)
- Backend: Node.js, Express, Socket.io, Redis
- DB: PostgreSQL + Prisma

## Local setup

1. Start infra:
   ```
   docker compose up -d
   ```
2. Backend:
   ```
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev --name init
   npm run seed   # creates a demo admin: admin@quizblast.dev / password123
   npm run dev
   ```
3. Frontend:
   ```
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```

Backend runs on http://localhost:4000, frontend on http://localhost:5173.

## Notes on this build
- Participants NEVER receive the full leaderboard over the socket — only top 5 + their own rank, server-side, so there's no client-side spoofing.
- Per your latest note: a participant who submits before time runs out is advanced immediately (a "Next" prompt appears) rather than being forced to wait for the timer; the timer only auto-advances participants who haven't answered yet. The round as a whole still ends when either everyone has answered or the timer expires, whichever comes first — that's what keeps per-participant shuffled order and server-side timing intact for scoring.
- Multiple Select, Team Mode, media questions, QR join, AI generation/difficulty are stubbed as clean extension points (see `backend/src/lib/questionTypes.js` and `EXTENSIONS.md`) but not implemented, per spec.
