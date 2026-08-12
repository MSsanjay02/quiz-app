const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../lib/prisma");

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
    );

    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (err) {
    next(err);
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

// Open registration is disabled by default for production safety.
// Flip ALLOW_ADMIN_SIGNUP=true in env to enable during setup, then turn it back off.
router.post("/register", async (req, res, next) => {
  try {
    if (process.env.ALLOW_ADMIN_SIGNUP !== "true") {
      return res.status(403).json({ error: "Admin signup is disabled" });
    }
    const { email, password, name } = registerSchema.parse(req.body);
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({ data: { email, passwordHash, name } });
    res.status(201).json({ id: admin.id, email: admin.email });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
