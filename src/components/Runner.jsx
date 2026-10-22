import { useEffect, useState } from 'react';
import { evaluate, MCQ_MARKS } from '../lib/scoring';
import { downloadScorecard } from '../lib/scorecardPdf';

const typeLabel = (t) => (t === 'mcq' ? 'Multiple choice' : 'Descriptive · 30 marks');

export default function Runner({ quiz, onExit }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [phase, setPhase] = useState('answering'); // answering | grading | done
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState(null);

  const qs = quiz.questions;
  const q = qs[index];
  const answered = (id) => Boolean(answers[id]?.trim());
  const answeredCount = qs.filter((x) => answered(x.id)).length;
  const set = (v) => setAnswers((a) => ({ ...a, [q.id]: v }));

  // Keyboard: press A-D to pick an option on MCQ questions
  useEffect(() => {
    if (phase !== 'answering' || q.type !== 'mcq') return;
    const onKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      const o = q.options.find((x) => x.id === e.key.toUpperCase());
      if (o) set(o.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function submit() {
    const missing = qs.length - answeredCount;
    if (missing && !window.confirm(`${missing} question(s) are unanswered and will score 0. Submit anyway?`)) return;
    setPhase('grading');
    setReport(await evaluate(quiz, answers, setProgress));
    setPhase('done');
  }

  function retake() { setAnswers({}); setIndex(0); setReport(null); setPhase('answering'); }

  if (phase === 'grading') {
    return <section className="panel"><h2>Scoring your quiz</h2><p className="why">{progress || 'Working…'}</p></section>;
  }

  if (phase === 'done') {
    const { sections, percent } = report;
    const failed = report.results.filter((r) => !r.passed);
    const tone = percent >= 70 ? '' : percent >= 40 ? 'mid' : 'low';
    return (
      <>
        <section className="panel">
          <div className="hero">
            <div className={`ring ${tone}`} style={{ '--pct': percent }}><b>{percent}%</b></div>
            <div style={{ display: 'grid', gap: 10 }}>
              <p className="total">{report.total}<span> / {report.max} marks</span></p>
              <div className="row">
                {sections.mcq && <span className="chip mcq">MCQ {sections.mcq.score}/{sections.mcq.max}</span>}
                {sections.descriptive && <span className="chip descriptive">Descriptive {sections.descriptive.score}/{sections.descriptive.max}</span>}
                <span className="chip">{qs.length - failed.length} of {qs.length} passed</span>
              </div>
            </div>
          </div>
          <div className="row">
            <button onClick={() => downloadScorecard(quiz, report)}>Download scorecard</button>
            <button className="ghost" onClick={retake}>Retake</button>
            <button className="ghost" onClick={onExit}>New quiz</button>
          </div>
        </section>

        {failed.length ? <h2>Review {failed.length} question{failed.length > 1 ? 's' : ''}</h2> : <h2 className="passed">Every question passed. Well done!</h2>}
        <ol className="review">
          {failed.map((r) => {
            const i = qs.findIndex((x) => x.id === r.id);
            const item = qs[i];
            const text = (id) => item.options?.find((o) => o.id === id)?.text;
            return (
              <li key={r.id} className="rcard">
                <div className="meta">
                  <span className={`chip ${item.type}`}>{typeLabel(item.type)}</span>
                  <span className="pos">Q{i + 1}</span>
                </div>
                <p className="q">{item.question}</p>
                {item.type === 'mcq' ? (
                  <>
                    <p className="line wrong">Your answer: {r.given ? `${r.given}. ${text(r.given)}` : 'Not answered'}</p>
                    <p className="line right">Correct answer: {item.answer}. {text(item.answer)}</p>
                    {item.explanation && <p className="why">{item.explanation}</p>}
                  </>
                ) : (
                  <>
                    <p className="line wrong">Scored {r.score} / {r.max}</p>
                    <p className="why">{r.feedback}</p>
                    {r.missed?.length > 0 && <p className="why">Missed: {r.missed.join('; ')}</p>}
                    <details><summary>Model answer</summary><p className="why" style={{ marginTop: 8 }}>{item.modelAnswer}</p></details>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  return (
    <div className="runner">
      <section className="card">
        <div className="meta">
          <span className={`chip ${q.type}`}>{typeLabel(q.type)}</span>
          <span className="chip topic">{q.topic}</span>
          <span className="pos">{index + 1} / {qs.length}</span>
        </div>

        <h2 className="q">{q.question}</h2>

        {q.type === 'mcq' ? (
          <div className="options" role="radiogroup" aria-label="Answer options">
            {q.options.map((o) => (
              <label key={o.id} className={answers[q.id] === o.id ? 'opt picked' : 'opt'}>
                <input type="radio" name={q.id} checked={answers[q.id] === o.id} onChange={() => set(o.id)} />
                <kbd>{o.id}</kbd> <span>{o.text}</span>
              </label>
            ))}
          </div>
        ) : (
          <>
            <textarea className="long" placeholder="Write your answer here…" value={answers[q.id] ?? ''} onChange={(e) => set(e.target.value)} />
            <p className="count">{(answers[q.id] ?? '').trim().split(/\s+/).filter(Boolean).length} words</p>
          </>
        )}

        <div className="nav">
          <button className="ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>Previous</button>
          <button className="ghost" onClick={() => setIndex(index + 1)} disabled={index === qs.length - 1}>Next</button>
        </div>
      </section>

      <aside className="side">
        <div style={{ display: 'grid', gap: 8 }}>
          <h3>{answeredCount} of {qs.length} answered</h3>
          <div className="progress"><i style={{ width: `${(answeredCount / qs.length) * 100}%` }} /></div>
        </div>
        <div className="palette" aria-label="Jump to question">
          {qs.map((x, i) => (
            <button key={x.id} className={`dot ${x.type}${answered(x.id) ? ' done' : ''}${i === index ? ' here' : ''}`} onClick={() => setIndex(i)} aria-label={`Question ${i + 1}${answered(x.id) ? ', answered' : ''}`}>{i + 1}</button>
          ))}
        </div>
        <button onClick={submit}>Submit quiz</button>
        {q.type === 'mcq' && <p className="why">Tip: press A–D to pick an option.</p>}
      </aside>
    </div>
  );
}