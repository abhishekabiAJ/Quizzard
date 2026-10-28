// jsPDF's built-in font only covers Latin-1, so tidy typographic characters first.
const clean = (s = "") =>
  String(s)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export async function downloadScorecard(quiz, report) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48,
    maxW = 595 - M * 2;
  let y = M;

  const line = (text, { size = 11, bold = false, gap = 6 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(clean(text), maxW)) {
      if (y > 800) {
        doc.addPage();
        y = M;
      }
      doc.text(l, M, y);
      y += size * 1.4;
    }
    y += gap;
  };

  line("Quizzard Scorecard", { size: 20, bold: true });
  line(`${quiz.title}  |  ${new Date().toLocaleString()}`, { gap: 14 });
  line(`Total: ${report.total} / ${report.max}  (${report.percent}%)`, {
    size: 15,
    bold: true,
  });
  const { mcq, descriptive } = report.sections;
  if (mcq) line(`Multiple choice: ${mcq.score} / ${mcq.max}`);
  if (descriptive)
    line(`Descriptive: ${descriptive.score} / ${descriptive.max}`, { gap: 14 });

  const failed = report.results.filter((r) => !r.passed);
  line(
    failed.length ? "Questions to review" : "All questions passed. Well done!",
    { size: 14, bold: true, gap: 8 },
  );

  for (const r of report.results) {
    const idx = quiz.questions.findIndex((q) => q.id === r.id);
    const q = quiz.questions[idx];
    line(`Q${idx + 1}. ${q.question}`, { bold: true, gap: 3 });
    if (q.type === "mcq") {
      const text = (id) => q.options.find((o) => o.id === id)?.text;
      line(
        `Your answer: ${r.given ? `${r.given}. ${text(r.given)}` : "Not answered"}`,
        { gap: 2 },
      );
      if (r.given != q.answer) {
        line(`Correct answer: ${q.answer}. ${text(q.answer)}`, { gap: 2 });
      }
      if (q.explanation) line(`Why: ${q.explanation}`, { gap: 12 });
    } else {
      line(`Score: ${r.score} / ${r.max}`, { gap: 2 });
      line(`Feedback: ${r.feedback}`, { gap: 2 });
      if (r.missed?.length) line(`Missed: ${r.missed.join("; ")}`, { gap: 2 });
      line(`Model answer: ${q.modelAnswer}`, { gap: 12 });
    }
  }
  doc.save(`${quiz.title}-scorecard.pdf`);
}
