// Reads highlighted text straight out of a Word document (.docx), so no photo is needed.
// Works for anything highlighted in Word, or in Google Docs then saved with File > Download > Microsoft Word.
// Produces the same word list as a photo does, with frac = 1 for highlighted words, so cards.js handles both.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

const isDocx = file => /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isW = (node, name) => node.namespaceURI === W_NS && node.localName === name;

function closestW(node, name) {
  for (let n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) if (isW(n, name)) return n;
  return null;
}

// Text boxes are stored twice (new + fallback copy); skip the fallback so nothing is read twice
function insideFallback(node) {
  for (let n = node.parentNode; n && n.nodeType === 1; n = n.parentNode) {
    if (n.namespaceURI === MC_NS && n.localName === 'Fallback') return true;
  }
  return false;
}

// Word uses <w:highlight>; Google Docs exports odd colours as cell-style shading <w:shd w:fill="...">
function runIsHighlighted(run) {
  const rPr = [...run.childNodes].find(n => isW(n, 'rPr'));
  if (!rPr) return false;
  for (const n of rPr.childNodes) {
    if (isW(n, 'highlight')) {
      const v = n.getAttributeNS(W_NS, 'val');
      if (v && v !== 'none') return true;
    }
    if (isW(n, 'shd')) {
      const fill = (n.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
      if (fill && fill !== 'auto' && fill !== 'ffffff') return true;
    }
  }
  return false;
}

function paragraphText(p) {
  return [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent).join('');
}

// In a worksheet table like "Term | Definition", the first cell of the row is the question
function rowLabel(p) {
  const cell = closestW(p, 'tc');
  if (!cell) return '';
  const cells = [...cell.parentNode.childNodes].filter(n => isW(n, 'tc'));
  if (cells[0] === cell) return '';
  const label = [...cells[0].getElementsByTagNameNS(W_NS, 'p')].map(paragraphText).join(' ').replace(/\s+/g, ' ').trim();
  return label.split(' ').length <= 12 ? label.replace(/[:.\s]+$/, '') : '';
}

async function readDocxWords(file) {
  if (!window.JSZip) throw Object.assign(new Error('JSZip missing'), { userMessage: "Document reader didn't load. Check your internet." });
  let xmlText;
  try {
    const zip = await JSZip.loadAsync(file);
    xmlText = await zip.file('word/document.xml').async('string');
  } catch (err) {
    throw Object.assign(err, { userMessage: "That doesn't look like a Word document" });
  }
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

  const words = [];
  let para = 0;
  for (const p of xml.getElementsByTagNameNS(W_NS, 'p')) {
    if (insideFallback(p)) continue;
    para++;

    // Highlighting is per run of text, and one word can be split across runs, so go letter by letter
    const chars = [];
    for (const run of p.getElementsByTagNameNS(W_NS, 'r')) {
      if (closestW(run, 'p') !== p) continue;
      const hl = runIsHighlighted(run);
      for (const n of run.childNodes) {
        const text = isW(n, 't') ? n.textContent
          : isW(n, 'tab') || isW(n, 'br') || isW(n, 'cr') ? ' '
          : isW(n, 'noBreakHyphen') ? '-' : '';
        for (const ch of text) chars.push([ch, hl]);
      }
    }

    const paraWords = [];
    let text = '', hlCount = 0;
    const flush = () => {
      if (text) paraWords.push({ text, para, line: para, frac: hlCount / text.length, boxes: [] });
      text = ''; hlCount = 0;
    };
    for (const [ch, hl] of chars) {
      if (/\s/.test(ch)) flush();
      else { text += ch; if (hl) hlCount++; }
    }
    flush();

    // A fully highlighted table cell: put the row's first cell in front as "Term:" so it becomes the question
    const label = paraWords.length && paraWords.every(w => w.frac >= HL_ON) ? rowLabel(p) : '';
    if (label) {
      const labelWords = label.split(' ').map(t => ({ text: t, para, line: para, frac: 0, boxes: [] }));
      labelWords[labelWords.length - 1].text += ':';
      paraWords.unshift(...labelWords);
    }
    words.push(...paraWords);
  }
  return words;
}
