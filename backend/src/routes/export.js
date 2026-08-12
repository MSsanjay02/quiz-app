const express = require("express");
const { stringify } = require("csv-stringify/sync");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const prisma = require("../lib/prisma");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

const COLUMNS = ["Rank", "Name", "Score", "Accuracy", "Average Time (s)", "Warnings"];

async function getResultRows(quizId, adminId) {
  const quiz = await prisma.quiz.findFirst({ where: { id: quizId, adminId } });
  if (!quiz) {
    const err = new Error("Quiz not found");
    err.status = 404;
    throw err;
  }
  const participants = await prisma.participant.findMany({
    where: { quizId },
    include: { answers: true },
    orderBy: { score: "desc" },
  });

  const rows = participants.map((p, ix) => {
    const attempted = p.answers.filter((a) => a.status !== "NOT_ATTEMPTED");
    const correct = p.answers.filter((a) => a.status === "CORRECT");
    const accuracy = attempted.length ? Math.round((correct.length / attempted.length) * 100) : 0;
    const avgTimeS = attempted.length
      ? (attempted.reduce((s, a) => s + a.timeTakenMs, 0) / attempted.length / 1000).toFixed(1)
      : "0.0";
    return [ix + 1, p.name, p.score, `${accuracy}%`, avgTimeS, p.warnings];
  });

  return { quiz, rows };
}

router.get("/:quizId/csv", async (req, res, next) => {
  try {
    const { quiz, rows } = await getResultRows(req.params.quizId, req.admin.id);
    const csv = stringify([COLUMNS, ...rows]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quiz.title.replace(/[^a-z0-9]/gi, "_")}_results.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/:quizId/xlsx", async (req, res, next) => {
  try {
    const { quiz, rows } = await getResultRows(req.params.quizId, req.admin.id);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Results");
    sheet.addRow(COLUMNS).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((col) => (col.width = 18));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quiz.title.replace(/[^a-z0-9]/gi, "_")}_results.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

router.get("/:quizId/pdf", async (req, res, next) => {
  try {
    const { quiz, rows } = await getResultRows(req.params.quizId, req.admin.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quiz.title.replace(/[^a-z0-9]/gi, "_")}_results.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    doc.fontSize(18).text(`${quiz.title} — Results`, { align: "center" });
    doc.moveDown();

    const colWidths = [40, 140, 60, 70, 90, 70];
    let y = doc.y;
    doc.fontSize(10).font("Helvetica-Bold");
    COLUMNS.forEach((c, ix) => {
      doc.text(c, 40 + colWidths.slice(0, ix).reduce((a, b) => a + b, 0), y, {
        width: colWidths[ix],
      });
    });
    doc.font("Helvetica");
    y += 18;

    rows.forEach((row) => {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      row.forEach((cell, ix) => {
        doc.text(String(cell), 40 + colWidths.slice(0, ix).reduce((a, b) => a + b, 0), y, {
          width: colWidths[ix],
        });
      });
      y += 16;
    });

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
