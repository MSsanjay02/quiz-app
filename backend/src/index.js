require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const { apiLimiter } = require("./middleware/rateLimit");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { initSocket } = require("./socket/engine");

const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quizzes");
const questionRoutes = require("./routes/questions");
const participantRoutes = require("./routes/participants");
const exportRoutes = require("./routes/export");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(apiLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/participants", participantRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
  pingTimeout: 20000,
});
initSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`QuizBlast API + sockets listening on :${PORT}`));
