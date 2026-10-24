// Turns the words read from a photo into flashcards, without AI.
// Each word arrives with `frac`: how much of it is covered by highlighter (0–1).
// Runs of highlighted words become answers; the sentence around them becomes the question.

const HL_ON = 0.4;       // a word counts as highlighted above this coverage
const HL_BRIDGE = 0.15;  // a lightly covered word between two highlighted ones still counts
const CONTEXT = 18;      // max words of the sentence kept either side of the answer

const SMALL_WORD = /^(the|of|and|a|an|in|on|to|for|or|&|-|–)$/i;
const ABBREVIATION = /^(e\.g|i\.e|etc|vs|dr|mr|mrs|ms|st|no|fig|approx|ca|cf)\.$/i;
const DETERMINER = /^(The|A|An|This|These|That|Those|Its|Their|Our|Your|His|Her|My|Each|Every|Most|Many|Some|All)\b/;

const join = ws => ws.map(w => w.text).join(' ');
const lc = s => s.toLowerCase();
const ask = text => ({ text, kind: 'q' });
const isName = a => /^[A-Z][a-z'’-]+(\s[A-Z][a-z'’-]+){1,2}$/.test(a);
const lead = subject => (DETERMINER.test(subject) ? subject[0].toLowerCase() + subject.slice(1) : subject);

function tidy(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .trim();
}

// "photo-" at the end of one line + "synthesis" on the next => "photosynthesis"
function mergeHyphens(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], next = words[i + 1];
    if (next && /[A-Za-z]-$/.test(w.text) && next.line !== w.line && next.para === w.para) {
      out.push({ ...w, text: w.text.slice(0, -1) + next.text, frac: Math.max(w.frac, next.frac), boxes: [...w.boxes, ...next.boxes] });
      i++;
    } else {
      out.push(w);
    }
  }
  return out;
}

function endsSentence(t) {
  return /[.!?]["'”’)\]]*$/.test(t) && !ABBREVIATION.test(t) && !/^[A-Z]\.$/.test(t);
}

function splitSentences(words) {
  const sentences = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && w.para !== cur[cur.length - 1].para) { sentences.push(cur); cur = []; }
    cur.push(w);
    if (endsSentence(w.text)) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  return sentences;
}

function buildCards(words) {
  const cards = [], seen = new Set();
  for (const s of splitSentences(mergeHyphens(words))) {
    const hl = s.map(w => w.frac >= HL_ON);
    for (let i = 1; i < s.length - 1; i++) {
      if (!hl[i] && hl[i - 1] && hl[i + 1] && (s[i].frac >= HL_BRIDGE || SMALL_WORD.test(s[i].text))) hl[i] = true;
    }
    for (let i = 0; i < s.length; i++) {
      if (!hl[i]) continue;
      let j = i;
      while (j + 1 < s.length && hl[j + 1]) j++;
      const card = makeCard(s, i, j);
      const key = card && lc(card.q + '|' + card.a);
      if (card && !seen.has(key)) { seen.add(key); cards.push(card); }
      i = j;
    }
  }
  return cards;
}

function makeCard(s, i, j) {
  // Punctuation stuck to the highlighted words belongs to the sentence, not the answer
  const [, head, core, tail] = join(s.slice(i, j + 1)).match(/^([\s"'“‘(\[•*·–—-]*)([\s\S]*?)([\s"'”’)\].,;:!?*·–—-]*)$/);
  const answer = tidy(core);
  if (answer.length < 2 || !/[A-Za-z0-9]/.test(answer)) return null;

  const from = Math.max(0, i - CONTEXT), to = Math.min(s.length, j + 1 + CONTEXT);
  const before = tidy(join(s.slice(from, i)) + ' ' + head);
  const after = tidy(tail + ' ' + join(s.slice(j + 1, to)));
  const q = makeQuestion(before, answer, after, from > 0, to < s.length);
  return q && { q: q.text, a: answer, kind: q.kind };
}

function makeQuestion(before, answer, after, cutBefore, cutAfter) {
  const b = before, a = after.replace(/[.!?]+$/, '').trim();
  let m;

  // Answer starts the sentence: "Mitochondria are the powerhouse of the cell."
  if (!b && !cutBefore && a) {
    if ((m = a.match(/^[:=–—-]\s*(.{4,})$/))) return ask(`What's the term for: ${m[1]}?`);
    if ((m = a.match(/^(is|are|was|were)\s+(called|known as|defined as)\s+(.{4,})$/i))) return ask(`What ${lc(m[1])} ${lc(m[2])} ${m[3]}?`);
    if ((m = a.match(/^(is|are|was|were)\s+(.{6,})$/i))) return ask(`${isName(answer) ? 'Who' : 'What'} ${lc(m[1])} ${m[2]}?`);
    if ((m = a.match(/^(means|refers to|describes|stands for)\s+(.{4,})$/i))) return ask(`Which term ${lc(m[1])} ${m[2]}?`);
  }

  // Answer ends the sentence: "The powerhouse of the cell is the mitochondria."
  if (!a && !cutAfter && b && !cutBefore) {
    if ((m = b.match(/^(.{4,}?)\s+(is|are|was|were)\s+(called|known as|named|termed)$/i))) return ask(`What ${lc(m[2])} ${lead(m[1])} ${lc(m[3])}?`);
    if (/\d/.test(answer) && (m = b.match(/^(.{4,}?)\s+(is|are|was|were)\s+(?:in|on)$/i))) return ask(`When ${lc(m[2])} ${lead(m[1])}?`);
    if ((m = b.match(/^(.{4,}?)\s+(is|are|was|were)$/i))) return ask(`${isName(answer) ? 'Who' : 'What'} ${lc(m[2])} ${lead(m[1])}?`);
    if ((m = b.match(/^(.{3,}?)\s*[:=–—-]$/))) return ask(m[1].split(' ').length <= 4 ? `What is ${m[1]}?` : `${m[1]}?`);
  }

  // The whole sentence is highlighted: prompt with its opening words
  if (!b && !a) {
    const ws = answer.split(' ');
    return ws.length > 4 ? { text: `Finish this: “${ws.slice(0, 3).join(' ')}…”`, kind: 'recall' } : null;
  }

  // Anything else: fill in the blank
  return { text: tidy(`${cutBefore ? '…' : ''}${b} _____ ${after}${cutAfter ? ' …' : ''}`), kind: 'cloze' };
}

if (typeof module !== 'undefined') module.exports = { buildCards, makeQuestion };
