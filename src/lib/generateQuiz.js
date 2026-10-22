import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { askAI, parseJson, DEFAULT_MODEL } from './ai';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const DESCRIPTIVE_COUNT = 4;
const CHUNK_SIZE = 6000;
const MAX_CHUNKS = 8;
const LETTERS = ['A', 'B', 'C', 'D'];

/* ---------- Read file ---------- */
export async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out += content.items.map((it) => it.str).join(' ') + '\n\n';
    }
    return out.trim();
  }
  if (/\.(txt|md|markdown)$/.test(name)) return (await file.text()).trim();
  throw new Error('Unsupported file. Upload a PDF, .txt or .md file.');
}

/* ---------- Chunking ---------- */
function pickEvenly(arr, k) {
  if (arr.length <= k) return arr;
  const step = arr.length / k;
  return Array.from({ length: k }, (_, i) => arr[Math.floor(i * step)]);
}

function chunkText(text) {
  const chunks = [];
  let rest = text.replace(/\s+\n/g, '\n');
  while (rest.length) {
    if (rest.length <= CHUNK_SIZE) { chunks.push(rest); break; }
    let cut = rest.lastIndexOf('\n', CHUNK_SIZE);
    if (cut < CHUNK_SIZE / 2) cut = rest.lastIndexOf('. ', CHUNK_SIZE);
    if (cut < CHUNK_SIZE / 2) cut = CHUNK_SIZE;
    chunks.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  return pickEvenly(chunks, MAX_CHUNKS);
}

/* ---------- Prompts ---------- */
const mcqPrompt = (chunk, n) => `You are an exam-question writer. Using ONLY the study material below, write ${n} multiple-choice questions.

Rules:
- Exactly 4 options, exactly one correct.
- Test understanding of key concepts, not trivia.
- Wrong options must be plausible. No "all/none of the above".
- "answer" is the letter of the correct option: "A", "B", "C" or "D".
- "explanation" is 1-2 sentences on why it is correct. "topic" is a 2-4 word label.

Respond with ONLY a JSON array, no markdown fences:
[{"question":"...","options":["...","...","...","..."],"answer":"B","explanation":"...","topic":"..."}]

STUDY MATERIAL:
"""
${chunk}
"""`;

const descPrompt = (chunk, n) => `You are an exam-question writer. Using ONLY the study material below, write ${n} descriptive (long-answer) exam question(s).

Rules:
- Each question asks the student to explain, compare, evaluate or discuss, needing a 150-250 word answer.
- "keyPoints": 4-6 short phrases a full-marks answer must cover.
- "modelAnswer": a model answer of 120-200 words.
- "topic" is a 2-4 word label.

Respond with ONLY a JSON array, no markdown fences:
[{"question":"...","keyPoints":["..."],"modelAnswer":"...","topic":"..."}]

STUDY MATERIAL:
"""
${chunk}
"""`;

/* ---------- Normalisers ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normMcq(q) {
  if (!q || typeof q.question !== 'string') return null;
  if (!Array.isArray(q.options) || q.options.length !== 4) return null;
  const idx = LETTERS.indexOf(String(q.answer).trim().toUpperCase().charAt(0));
  if (idx === -1) return null;
  const tagged = shuffle(q.options.map((t, i) => ({ text: String(t).trim(), correct: i === idx })));
  return {
    type: 'mcq',
    topic: String(q.topic || 'General').trim(),
    question: q.question.trim(),
    options: tagged.map((o, i) => ({ id: LETTERS[i], text: o.text })),
    answer: LETTERS[tagged.findIndex((o) => o.correct)],
    explanation: String(q.explanation || '').trim(),
  };
}

function normDesc(q) {
  if (!q || typeof q.question !== 'string' || typeof q.modelAnswer !== 'string') return null;
  if (!Array.isArray(q.keyPoints) || !q.keyPoints.length) return null;
  return {
    type: 'descriptive',
    topic: String(q.topic || 'General').trim(),
    question: q.question.trim(),
    keyPoints: q.keyPoints.map((k) => String(k).trim()),
    modelAnswer: q.modelAnswer.trim(),
  };
}

/* ---------- Generic AI collector ---------- */
async function collect({ chunks, per, prompt, norm, model, onProgress, label }) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`${label} ${i + 1} of ${chunks.length}…`);
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try { parsed = parseJson(await askAI(prompt(chunks[i], per), model)); }
      catch (e) { if (attempt === 1) console.warn('Skipping chunk', i, e); }
    }
    for (const raw of parsed ?? []) {
      const q = norm(raw);
      const key = q?.question.toLowerCase();
      if (q && !seen.has(key)) { seen.add(key); out.push(q); }
    }
  }
  return out;
}

/* ---------- Public ---------- */
// type: 'mcq' | 'descriptive' | 'both'.  count = number of MCQs (descriptive is always 4)
export async function generateQuiz({ text, fileName, type = 'mcq', count = 10, model = DEFAULT_MODEL, onProgress }) {
  const chunks = chunkText(text);
  let mcq = [];
  let desc = [];

  if (type !== 'descriptive') {
    const per = Math.ceil(count / chunks.length) + 1;
    const all = await collect({ chunks, per, prompt: mcqPrompt, norm: normMcq, model, onProgress, label: 'Writing MCQs' });
    mcq = shuffle(all).slice(0, count);
    if (!mcq.length) throw new Error('The AI returned no usable MCQs. Try again or use a shorter file.');
  }

  if (type !== 'mcq') {
    const picked = pickEvenly(chunks, DESCRIPTIVE_COUNT);
    const per = Math.ceil(DESCRIPTIVE_COUNT / picked.length);
    const all = await collect({ chunks: picked, per, prompt: descPrompt, norm: normDesc, model, onProgress, label: 'Writing descriptive questions' });
    desc = all.slice(0, DESCRIPTIVE_COUNT);
    if (!desc.length) throw new Error('The AI returned no usable descriptive questions. Try again.');
  }

  return {
    schemaVersion: 2,
    title: fileName.replace(/\.[^.]+$/, ''),
    source: { fileName },
    quizType: type,
    model,
    generatedAt: new Date().toISOString(),
    questions: [...mcq, ...desc].map((q, i) => ({ id: `q${i + 1}`, ...q })),
  };
}
