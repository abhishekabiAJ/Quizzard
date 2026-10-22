// All Puter.js access lives here.
export const DEFAULT_MODEL = 'gpt-4o-mini';

export async function askAI(prompt, model = DEFAULT_MODEL) {
  if (!window.puter) throw new Error('Puter.js did not load. Check the <script> tag in index.html.');
  const res = await window.puter.ai.chat(prompt, { model });
  const c = res?.message?.content ?? res;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => p.text ?? '').join('');
  return String(c);
}

// parseJson(raw) for arrays, parseJson(raw, '{', '}') for objects
export function parseJson(raw, open = '[', close = ']') {
  const clean = raw.replace(/```json|```/gi, '');
  const s = clean.indexOf(open);
  const e = clean.lastIndexOf(close);
  if (s === -1 || e <= s) throw new Error('No JSON in AI reply');
  return JSON.parse(clean.slice(s, e + 1));
}
