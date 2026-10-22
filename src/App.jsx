import { useState } from "react";
import {
  extractText,
  generateQuiz,
  DESCRIPTIVE_COUNT,
} from "./lib/generateQuiz";
import { MCQ_MARKS, DESC_MARKS } from "./lib/scoring";
import Runner from "./components/Runner";
import "./index.css";

function Topbar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">T</span>Rev Mate for kunjmani
      </div>
    </header>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [type, setType] = useState("mcq");
  const [count, setCount] = useState(10);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [running, setRunning] = useState(false);
  const busy = Boolean(status);

  async function handleGenerate() {
    setError("");
    setQuiz(null);
    try {
      setStatus("Reading your file…");
      const text = await extractText(file);
      if (text.length < 200)
        throw new Error(
          "Not enough readable text. Scanned PDFs need OCR first.",
        );
      setQuiz(
        await generateQuiz({
          text,
          fileName: file.name,
          type,
          count,
          onProgress: setStatus,
        }),
      );
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setStatus("");
    }
  }

  async function loadSaved(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.questions) || !data.questions.length)
        throw new Error();
      setError("");
      setQuiz(data);
    } catch {
      setError("That file is not a TuteMate quiz JSON.");
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json" }),
    );
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${quiz.title}.quiz.json`,
    }).click();
    URL.revokeObjectURL(url);
  }

  if (running) {
    return (
      <>
        <Topbar />
        <main className="page">
          <Runner
            quiz={quiz}
            onExit={() => {
              setRunning(false);
              setQuiz(null);
            }}
          />
        </main>
      </>
    );
  }

  const nMcq = quiz?.questions.filter((q) => q.type === "mcq").length ?? 0;
  const nDesc = (quiz?.questions.length ?? 0) - nMcq;

  return (
    <>
      <Topbar />
      <main className="page">
        <section className="panel">
          <header>
            <h2>New quiz</h2>
            <span className="chip">PDF · TXT · MD</span>
          </header>
          <label className="field">
            <span>Study material</span>
            <input
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              onChange={(e) => setFile(e.target.files[0] ?? null)}
            />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Question type</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="mcq">Multiple choice</option>
                <option value="descriptive">
                  Descriptive ({DESCRIPTIVE_COUNT} questions, 30 marks each)
                </option>
                <option value="both">Both</option>
              </select>
            </label>
            {type !== "descriptive" && (
              <label className="field">
                <span>
                  {type === "both"
                    ? `MCQs (plus ${DESCRIPTIVE_COUNT} descriptive)`
                    : "Number of questions"}
                </span>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[5, 10, 15, 20, 30].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="row">
            <button onClick={handleGenerate} disabled={!file || busy}>
              {busy ? status : "Generate quiz"}
            </button>
          </div>
          <label className="field">
            <span>Or load a saved quiz (JSON)</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={loadSaved}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>

        {quiz && (
          <section className="panel">
            <span className="chip ai">Quiz ready</span>
            <header>              
              <span>{quiz.title}</span>
            </header>            

            <div className="tiles">
              <div className="tile" style={{ "--c": "var(--cyan)" }}>
                <b>{nMcq}</b>
                <span>multiple choice</span>
              </div>
              <div className="tile" style={{ "--c": "var(--violet)" }}>
                <b>{nDesc}</b>
                <span>descriptive</span>
              </div>
              <div className="tile" style={{ "--c": "var(--amber)" }}>
                <b>{nMcq * MCQ_MARKS + nDesc * DESC_MARKS}</b>
                <span>total marks</span>
              </div>
            </div>
            <div className="row">
              <button onClick={() => setRunning(true)}>Start quiz</button>
              <button className="ghost" onClick={download}>
                Download quiz JSON
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
