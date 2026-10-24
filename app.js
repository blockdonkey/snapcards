'use strict';

const MAX_SIDE = 2200; // photos are shrunk to this many pixels on the long side before reading

const COLORS = {
  yellow: { name: 'Yellow', hue: 55, swatch: '#ffe14d', accent: '#f2c200' },
  green: { name: 'Green', hue: 105, swatch: '#8af27a', accent: '#34c25e' },
  pink: { name: 'Pink', hue: 325, swatch: '#ff85cc', accent: '#f2479d' },
  blue: { name: 'Blue', hue: 195, swatch: '#7fd8ff', accent: '#1aa7e6' },
  orange: { name: 'Orange', hue: 30, swatch: '#ffb061', accent: '#ff8a1f' },
  purple: { name: 'Purple', hue: 275, swatch: '#c9a6ff', accent: '#9466ff' },
  any: { name: 'Any colour', hue: null, swatch: 'conic-gradient(#ffe14d, #8af27a, #7fd8ff, #c9a6ff, #ff85cc, #ffb061, #ffe14d)', accent: '#6f7bf7' },
};

const KIND_LABEL = { q: 'Question', cloze: 'Fill the blank', recall: 'Finish it' };

const ICON_PATHS = {
  camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  cards: '<rect x="2" y="7" width="14" height="15" rx="2"/><path d="M7 3h13a2 2 0 0 1 2 2v13"/>',
};
const I = Object.fromEntries(Object.entries(ICON_PATHS).map(([k, p]) => [k,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`]));

/* ---------- storage ---------- */

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
};

let settings = store.get('snapcards.settings', null);
if (settings && !COLORS[settings.color]) settings = null;
let decks = store.get('snapcards.decks', []);
let view = settings ? { name: 'home' } : { name: 'welcome', first: true, picked: null };

const app = document.getElementById('app');
const camInput = document.getElementById('cam');
const libInput = document.getElementById('lib');
const docInput = document.getElementById('doc');
let photoTarget = null; // deck the next photos or documents are added to (null = make a new deck)

/* ---------- helpers ---------- */

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const findDeck = id => decks.find(d => d.id === id);
const cardText = t => esc(t).replace(/_{3,}/g, '<span class="blank"></span>');

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function applyTheme(key) {
  const c = COLORS[key] || COLORS.yellow;
  const root = document.documentElement.style;
  root.setProperty('--accent', c.accent);
  root.setProperty('--accent-soft', hexToRgba(c.accent, 0.16));
  root.setProperty('--accent-mark', hexToRgba(c.accent, 0.45));
  document.querySelector('meta[name=theme-color]').setAttribute('content', c.accent);
}

function saveDecks() {
  if (!store.set('snapcards.decks', decks)) toast("Couldn't save. Your browser may be blocking storage.");
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function go(next) {
  view = next;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const views = { welcome: welcomeView, home: homeView, deck: deckView, processing: processingView, review: reviewView, setup: setupView, study: studyView, results: resultsView };
  app.innerHTML = (views[view.name] || homeView)();
}

/* ---------- views ---------- */

function welcomeView() {
  const { picked, first } = view;
  return `
  <section class="welcome">
    ${first ? '' : `<button class="icon-btn back" data-action="home" aria-label="Back">${I.back}</button>`}
    <div class="brand"><div class="brand-mark">${I.cards}</div><h1>Snap Cards</h1></div>
    <p class="lede">Take a photo of your notes. Everything you've <mark>highlighted</mark> turns into flashcards.</p>
    <h2 class="label">Which highlighter do you use?</h2>
    <div class="swatches">
      ${Object.entries(COLORS).map(([key, c]) => `
        <button class="swatch ${picked === key ? 'on' : ''}" data-action="pick-color" data-color="${key}">
          <span class="chip" style="background:${c.swatch}"></span>${c.name}
        </button>`).join('')}
    </div>
    <p class="hint">Pick "Any colour" if you use more than one highlighter.</p>
    <button class="btn primary block big" data-action="save-color" ${picked ? '' : 'disabled'}>${first ? "Let's go" : 'Save'}</button>
  </section>`;
}

function homeView() {
  const c = COLORS[settings.color];
  return `
  <header class="top">
    <div class="brand"><div class="brand-mark">${I.cards}</div><span>Snap Cards</span></div>
    <button class="pill" data-action="change-color" aria-label="Change highlighter colour"><span class="chip sm" style="background:${c.swatch}"></span>${c.name}</button>
  </header>

  <section class="hero-card">
    <h1>Turn your notes into <mark>flashcards</mark></h1>
    <p>Snap a page you've highlighted. Highlights become the answers.</p>
    <div class="row">
      <button class="btn primary grow" data-action="camera">${I.camera} Take photo</button>
      <button class="btn grow" data-action="upload">${I.image} Upload</button>
    </div>
    <button class="btn block doc-btn" data-action="doc">${I.doc} Upload a Word / Google Doc</button>
  </section>

  <h2 class="section-title">Your decks</h2>
  ${decks.length
    ? `<div class="deck-list">${decks.map(deckRow).join('')}</div>`
    : `<div class="empty">No decks yet.<br>Snap a page of highlighted notes to make your first one.</div>`}

  <details class="tips">
    <summary>Tips for good photos</summary>
    <ul>
      <li>Lay the page flat in good light, with no shadows.</li>
      <li>Fill the photo with one page, held straight.</li>
      <li>Printed text and neat handwriting work best.</li>
      <li>You can fix any mistakes before saving.</li>
    </ul>
  </details>
  <details class="tips">
    <summary>Notes from Google Classroom</summary>
    <ul>
      <li>Open your teacher's notes in Google Docs or Word.</li>
      <li>Highlight the key bits with the highlighter tool (not coloured text).</li>
      <li>In Google Docs: File → Download → Microsoft Word (.docx).</li>
      <li>Tap "Upload a Word / Google Doc" above and pick that file.</li>
      <li>Got a PDF? Open it in Google Docs or Word first, or screenshot the pages and upload those.</li>
      <li>Tables work too: highlight the answer in a row, and the first column becomes the question.</li>
    </ul>
  </details>`;
}

function deckRow(d) {
  const date = new Date(d.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `
  <button class="deck" data-action="open-deck" data-id="${d.id}">
    <span class="deck-icon">${d.cards.length}</span>
    <span class="deck-info"><span class="deck-name">${esc(d.name)}</span><span class="deck-meta">${plural(d.cards.length, 'card')} · ${date}</span></span>
    ${I.chevron}
  </button>`;
}

function deckView() {
  const d = findDeck(view.id);
  if (!d) { view = { name: 'home' }; return homeView(); }
  return `
  <header class="top">
    <button class="icon-btn" data-action="home" aria-label="Back">${I.back}</button>
    <input class="title-input" data-field="deck-name" value="${esc(d.name)}" aria-label="Deck name">
  </header>

  <div class="deck-actions">
    <button class="btn primary block big" data-action="study" data-id="${d.id}" ${d.cards.length ? '' : 'disabled'}>${I.play} Study ${plural(d.cards.length, 'card')}</button>
    <div class="row">
      <button class="btn grow" data-action="camera" data-deck="${d.id}">${I.camera} Add photo</button>
      <button class="btn grow" data-action="upload" data-deck="${d.id}">${I.image} Upload</button>
    </div>
    <button class="btn block" data-action="doc" data-deck="${d.id}">${I.doc} Add from a Word / Google Doc</button>
  </div>

  <div class="section-head">
    <h2>Cards</h2>
    <button class="link" data-action="add-card">${I.plus} Add card</button>
  </div>
  <div class="card-list">
    ${d.cards.length ? d.cards.map(c => (view.editing === c.id ? editRow(c) : cardRow(c))).join('') : '<div class="empty">No cards in this deck yet.</div>'}
  </div>

  <button class="btn danger-ghost block" data-action="delete-deck">Delete deck</button>`;
}

function cardRow(c) {
  return `
  <div class="qa">
    <div class="q">${cardText(c.q)}</div>
    <div class="a"><mark>${esc(c.a)}</mark></div>
    <div class="qa-tools">
      <button class="icon-btn plain" data-action="edit-card" data-id="${c.id}" aria-label="Edit card">${I.edit}</button>
      <button class="icon-btn plain" data-action="delete-card" data-id="${c.id}" aria-label="Delete card">${I.trash}</button>
    </div>
  </div>`;
}

function editRow(c) {
  return `
  <div class="qa editing">
    <label class="mini" for="eq">Question</label>
    <textarea class="input" id="eq" rows="3">${esc(c.q)}</textarea>
    <label class="mini" for="ea">Answer</label>
    <textarea class="input" id="ea" rows="2">${esc(c.a)}</textarea>
    <div class="edit-buttons">
      <button class="btn" data-action="cancel-edit">Cancel</button>
      <button class="btn primary" data-action="save-card">Save</button>
    </div>
  </div>`;
}

function processingView() {
  return `
  <section class="center-panel">
    <div class="spinner"></div>
    <h1>Making your flashcards</h1>
    <p class="muted" id="proc-note">This takes a few seconds per photo.</p>
    <div class="proc-list">
      ${view.items.map((it, i) => `
        <div class="proc-item ${it.state || ''}" id="proc-${i}">
          <div class="proc-row"><span>${esc(it.label)}</span><span class="proc-status">${esc(it.status)}</span></div>
          <div class="bar"><div style="width:${it.progress * 100}%"></div></div>
        </div>`).join('')}
    </div>
  </section>`;
}

function reviewView() {
  const { cards, previews, deckId } = view;
  const target = deckId ? findDeck(deckId) : null;
  return `
  <header class="top">
    <button class="icon-btn" data-action="cancel-review" aria-label="Discard">${I.x}</button>
    <span class="top-title">Check your cards</span>
    <span class="spacer"></span>
  </header>

  <p class="lede">${cards.length
    ? `Found <b>${plural(cards.length, 'flashcard')}</b>. Fix anything the camera misread, and untick any you don't want.`
    : "I couldn't find any highlighted text in what you uploaded."}</p>

  ${previews.length ? `<div class="previews">${previews.map(p => `<img src="${p}" alt="Your photo with the highlights it found marked">`).join('')}</div>` : ''}

  ${cards.length ? '' : `
  <div class="notice">
    <b>Things to try:</b>
    <ul>
      <li>Check your highlighter colour is set to <b>${COLORS[settings.color].name}</b>, or switch to "Any colour".</li>
      <li>Take the photo in brighter light, straight on, with the page filling the frame.</li>
      <li>For Word or Google Docs, use the highlighter tool, not coloured text.</li>
      <li>Or add cards yourself below.</li>
    </ul>
  </div>`}

  ${target
    ? `<p class="muted" style="margin-bottom:16px">Adding to <b>${esc(target.name)}</b></p>`
    : `<label class="field"><span class="mini">Deck name</span><input class="input" data-field="review-name" value="${esc(view.deckName)}"></label>`}

  <div class="review-list">${cards.map(reviewRow).join('')}</div>
  <button class="btn block ghost" data-action="review-add">${I.plus} Add a card</button>

  <div class="sticky-bar">
    <button class="btn primary block big" data-action="review-save">${saveLabel()}</button>
  </div>`;
}

function reviewRow(c, i) {
  return `
  <div class="review-card ${c.keep ? '' : 'off'}">
    <div class="rc-top">
      <span class="tag">${KIND_LABEL[c.kind] || 'Question'}</span>
      <label class="toggle"><input type="checkbox" data-field="keep" data-i="${i}" ${c.keep ? 'checked' : ''}>Keep</label>
    </div>
    <label class="mini">Question</label>
    <textarea class="input" data-field="rq" data-i="${i}" rows="2">${esc(c.q)}</textarea>
    <label class="mini">Answer</label>
    <textarea class="input" data-field="ra" data-i="${i}" rows="1">${esc(c.a)}</textarea>
  </div>`;
}

function saveLabel() {
  const n = view.cards.filter(c => c.keep).length;
  return n ? `Save ${plural(n, 'card')}` : 'Nothing to save';
}

function setupView() {
  const d = findDeck(view.id);
  const n = d.cards.length;
  const options = [5, 10, 20, 30, 50].filter(x => x < n);
  return `
  <header class="top">
    <button class="icon-btn" data-action="open-deck" data-id="${d.id}" aria-label="Back">${I.back}</button>
    <span class="top-title">${esc(d.name)}</span>
    <span class="spacer"></span>
  </header>
  <section class="center-panel">
    <h1>How many cards?</h1>
    <p class="muted">This deck has ${plural(n, 'card')}.</p>
    <div class="count-grid">
      ${options.map(x => `<button class="count" data-action="start-study" data-count="${x}">${x}</button>`).join('')}
      <button class="count all" data-action="start-study" data-count="${n}">All ${n}</button>
    </div>
    <label class="toggle"><input type="checkbox" data-field="shuffle" ${view.shuffle ? 'checked' : ''}>Shuffle the order</label>
  </section>`;
}

function studyView() {
  const d = findDeck(view.deckId);
  const card = d.cards.find(c => c.id === view.queue[0]);
  const long = Math.max(card.q.length, card.a.length) > 140 ? 'long' : '';
  return `
  <header class="top">
    <button class="icon-btn" data-action="end-study" aria-label="Stop studying">${I.x}</button>
    <div class="progress"><div style="width:${(view.done / view.total) * 100}%"></div></div>
    <span class="count-label">${view.done}/${view.total}</span>
  </header>

  <div class="flash-wrap">
    <button class="flash" data-action="flip" aria-label="Flip card">
      <div class="face front ${long}">
        <span class="tag">${KIND_LABEL[card.kind] || 'Question'}</span>
        <p>${cardText(card.q)}</p>
        <span class="tap">Tap to see the answer</span>
      </div>
      <div class="face back ${long}">
        <span class="tag">Answer</span>
        <p>${esc(card.a)}</p>
      </div>
    </button>
  </div>

  <div class="grade">
    <button class="btn again" data-action="again">${I.x} Again</button>
    <button class="btn got" data-action="got">${I.check} Got it</button>
  </div>
  <p class="keys">Space to flip · 1 = Again · 2 = Got it</p>`;
}

function resultsView() {
  const { total, missed, deckId } = view;
  const firstTry = total - missed.length;
  const pct = Math.round((firstTry / total) * 100);
  const msg = pct === 100 ? 'Perfect round!' : pct >= 70 ? 'Nice work!' : 'Keep going, it sticks with practice.';
  return `
  <section class="center-panel results">
    <div class="brand-mark" style="width:64px;height:64px;border-radius:20px;margin:0 auto">${I.check}</div>
    <div class="score">${firstTry}/${total}</div>
    <h1>${msg}</h1>
    <p class="muted" style="margin-bottom:20px">You got ${plural(firstTry, 'card')} right first time.</p>
    <button class="btn primary block big" data-action="study" data-id="${deckId}">Study again</button>
    <button class="btn block" data-action="open-deck" data-id="${deckId}">Back to deck</button>
  </section>`;
}

/* ---------- actions ---------- */

const actions = {
  'pick-color'(el) {
    view.picked = el.dataset.color;
    applyTheme(view.picked);
    render();
  },
  'save-color'() {
    settings = { color: view.picked };
    store.set('snapcards.settings', settings);
    go({ name: 'home' });
  },
  'change-color'() { go({ name: 'welcome', first: false, picked: settings.color }); },
  home() {
    applyTheme(settings.color);
    go({ name: 'home' });
  },

  camera(el) { photoTarget = el.dataset.deck || null; camInput.click(); },
  upload(el) { photoTarget = el.dataset.deck || null; libInput.click(); },
  doc(el) { photoTarget = el.dataset.deck || null; docInput.click(); },

  'open-deck'(el) { go({ name: 'deck', id: el.dataset.id }); },
  'delete-deck'() {
    const d = findDeck(view.id);
    if (!confirm(`Delete "${d.name}" and all its cards?`)) return;
    decks = decks.filter(x => x !== d);
    saveDecks();
    go({ name: 'home' });
  },
  'add-card'() {
    const d = findDeck(view.id);
    const card = { id: uid(), q: '', a: '', kind: 'q' };
    d.cards.unshift(card);
    view.editing = card.id;
    render();
    document.getElementById('eq').focus();
  },
  'edit-card'(el) {
    cleanUpBlankCard(findDeck(view.id).cards.find(x => x.id === view.editing));
    view.editing = el.dataset.id;
    render();
    document.getElementById('eq').focus();
  },
  'save-card'() {
    const d = findDeck(view.id);
    const c = d.cards.find(x => x.id === view.editing);
    c.q = document.getElementById('eq').value.trim();
    c.a = document.getElementById('ea').value.trim();
    if (c.kind === 'cloze' && !/_{3,}/.test(c.q)) c.kind = 'q';
    view.editing = null;
    cleanUpBlankCard(c);
    saveDecks();
    render();
  },
  'cancel-edit'() {
    cleanUpBlankCard(findDeck(view.id).cards.find(x => x.id === view.editing));
    view.editing = null;
    render();
  },
  'delete-card'(el) {
    const d = findDeck(view.id);
    d.cards = d.cards.filter(c => c.id !== el.dataset.id);
    saveDecks();
    render();
  },

  'review-add'() {
    view.cards.push({ q: '', a: '', kind: 'q', keep: true });
    render();
    const fields = app.querySelectorAll('[data-field="rq"]');
    fields[fields.length - 1].focus();
  },
  'review-save'() {
    const cards = view.cards
      .filter(c => c.keep && (c.q.trim() || c.a.trim()))
      .map(c => ({ id: uid(), q: c.q.trim(), a: c.a.trim(), kind: c.kind === 'cloze' && !/_{3,}/.test(c.q) ? 'q' : c.kind }));
    if (!cards.length) return toast('Tick at least one card to save.');
    let deck = view.deckId && findDeck(view.deckId);
    if (deck) {
      deck.cards.push(...cards);
    } else {
      deck = { id: uid(), name: view.deckName.trim() || 'My notes', created: Date.now(), cards };
      decks.unshift(deck);
    }
    saveDecks();
    toast(`Saved ${plural(cards.length, 'card')}`);
    go({ name: 'deck', id: deck.id });
  },
  'cancel-review'() {
    if (view.cards.length && !confirm('Throw away these cards?')) return;
    go(view.deckId ? { name: 'deck', id: view.deckId } : { name: 'home' });
  },

  study(el) { go({ name: 'setup', id: el.dataset.id, shuffle: view.shuffle !== false }); },
  'start-study'(el) {
    const d = findDeck(view.id);
    let ids = d.cards.map(c => c.id);
    if (view.shuffle) ids = shuffle(ids);
    const total = Number(el.dataset.count);
    go({ name: 'study', deckId: d.id, queue: ids.slice(0, total), total, done: 0, missed: [], flipped: false, shuffle: view.shuffle });
  },
  flip() {
    view.flipped = app.querySelector('.flash').classList.toggle('flipped');
    app.querySelector('.grade').classList.toggle('show', view.flipped);
  },
  got() {
    if (!view.flipped) return;
    view.queue.shift();
    view.done++;
    nextCard();
  },
  again() {
    if (!view.flipped) return;
    const id = view.queue.shift();
    if (!view.missed.includes(id)) view.missed.push(id);
    // Bring it back a few cards later rather than straight away
    view.queue.splice(Math.min(3, view.queue.length), 0, id);
    nextCard();
  },
  'end-study'() { go({ name: 'deck', id: view.deckId }); },
};

function nextCard() {
  if (!view.queue.length) {
    go({ name: 'results', deckId: view.deckId, total: view.total, missed: view.missed, shuffle: view.shuffle });
    return;
  }
  view.flipped = false;
  render();
}

// A brand-new card left empty shouldn't hang around in the deck
function cleanUpBlankCard(card) {
  const d = findDeck(view.id);
  if (!d) return;
  d.cards = d.cards.filter(c => c !== card || c.q || c.a);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- reading photos ---------- */

let workerPromise = null;
let onOcrProgress = () => {};

function getWorker() {
  if (!window.Tesseract) return Promise.reject(new Error('Text reader failed to load'));
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, { logger: m => onOcrProgress(m) })
      .catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open image')); };
    img.src = url;
  });
}

function hueOf(r, g, b, max, min) {
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function percentile(hist, total, p) {
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= total * p) return v;
  }
  return 255;
}

// Works out which pixels are highlighter, and makes a clean black-on-white copy for the text reader.
function preparePage(img, hue) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);

  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;

  // Estimate the paper colour so warm or dim lighting doesn't look like highlighter
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < px.length; i += 4 * 7) {
    if (Math.max(px[i], px[i + 1], px[i + 2]) < 100) continue;
    hr[px[i]]++; hg[px[i + 1]]++; hb[px[i + 2]]++; n++;
  }
  const kr = 255 / Math.max(80, percentile(hr, n, 0.7));
  const kg = 255 / Math.max(80, percentile(hg, n, 0.7));
  const kb = 255 / Math.max(80, percentile(hb, n, 0.7));

  const mask = new Uint8Array(w * h); // 0 = paper, 1 = highlighter, 2 = ink
  const ocr = document.createElement('canvas');
  ocr.width = w; ocr.height = h;
  const octx = ocr.getContext('2d');
  const out = octx.createImageData(w, h);
  const o = out.data;

  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = Math.min(255, px[i] * kr), g = Math.min(255, px[i + 1] * kg), b = Math.min(255, px[i + 2] * kb);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let grey = 0.299 * r + 0.587 * g + 0.114 * b;
    let isHl = max >= 150 && min >= 50 && (max - min) / max >= 0.2;
    if (isHl && hue != null) {
      const d = Math.abs(hueOf(r, g, b, max, min) - hue);
      isHl = Math.min(d, 360 - d) <= 28;
    }
    if (isHl) { mask[p] = 1; grey = 255; }
    else if ((max + min) / 2 < 120) mask[p] = 2;
    o[i] = o[i + 1] = o[i + 2] = grey;
    o[i + 3] = 255;
  }
  octx.putImageData(out, 0, 0);
  return { w, h, mask, src, ocr };
}

function highlightFraction(page, box) {
  const padY = Math.round((box.y1 - box.y0) * 0.15);
  const x0 = Math.max(0, box.x0), x1 = Math.min(page.w, box.x1);
  const y0 = Math.max(0, box.y0 - padY), y1 = Math.min(page.h, box.y1 + padY);
  let hl = 0, paper = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const m = page.mask[y * page.w + x];
      if (m === 1) hl++;
      else if (m === 0) paper++;
    }
  }
  return hl + paper ? hl / (hl + paper) : 0;
}

function extractWords(data, page) {
  const words = [];
  let para = 0, line = 0;
  const add = w => {
    const text = (w.text || '').trim();
    if (!text || (w.confidence < 35 && !/[A-Za-z0-9]{2}/.test(text))) return;
    words.push({ text, para, line, frac: highlightFraction(page, w.bbox), boxes: [w.bbox] });
  };
  if (data.blocks && data.blocks.length) {
    for (const block of data.blocks)
      for (const p of block.paragraphs || []) {
        para++;
        for (const l of p.lines || []) { line++; (l.words || []).forEach(add); }
      }
  } else {
    (data.words || []).forEach(add);
  }
  return words;
}

// A small copy of the photo with the highlights it found boxed, so you can see what it picked up
function makePreview(page, words) {
  const accent = COLORS[settings.color].accent;
  const width = 520, k = width / page.w;
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.round(page.h * k);
  const x = c.getContext('2d');
  x.drawImage(page.src, 0, 0, c.width, c.height);
  x.fillStyle = hexToRgba(accent, 0.35);
  x.strokeStyle = accent;
  x.lineWidth = 2;
  for (const w of words) {
    if (w.frac < HL_ON) continue;
    for (const b of w.boxes) {
      const rect = [b.x0 * k - 2, b.y0 * k - 2, (b.x1 - b.x0) * k + 4, (b.y1 - b.y0) * k + 4];
      x.fillRect(...rect);
      x.strokeRect(...rect);
    }
  }
  return c.toDataURL('image/jpeg', 0.75);
}

function setItem(i, status, progress, state) {
  const it = view.items && view.items[i];
  if (!it) return;
  Object.assign(it, { status, progress, state });
  const el = document.getElementById('proc-' + i);
  if (!el) return;
  el.className = 'proc-item ' + (state || '');
  el.querySelector('.proc-status').textContent = status;
  el.querySelector('.bar div').style.width = progress * 100 + '%';
}

async function processFiles(files, deckId) {
  go({
    name: 'processing',
    items: files.map((f, i) => ({ label: isDocx(f) ? f.name : files.length > 1 ? `Photo ${i + 1}` : 'Your photo', status: 'Waiting…', progress: 0 })),
  });

  let current = 0;
  onOcrProgress = m => {
    if (m.status === 'recognizing text') setItem(current, 'Reading text…', 0.15 + 0.85 * m.progress);
    else {
      const note = document.getElementById('proc-note');
      if (note) note.textContent = 'Getting the text reader ready. The first time takes a little longer.';
    }
  };

  const cards = [], previews = [];
  for (let i = 0; i < files.length; i++) {
    current = i;
    const file = files[i];
    try {
      let words;
      if (isDocx(file)) {
        setItem(i, 'Reading document…', 0.3);
        words = await readDocxWords(file);
      } else if (/\.(doc|pdf|pages|odt)$/i.test(file.name)) {
        throw Object.assign(new Error('Unsupported file'), { userMessage: 'Save it as a .docx first' });
      } else {
        setItem(i, 'Finding highlights…', 0.05);
        const worker = await getWorker().catch(err => {
          throw Object.assign(err, { userMessage: "Text reader didn't load. Check your internet." });
        });
        const note = document.getElementById('proc-note');
        if (note) note.textContent = 'This takes a few seconds per photo.';
        const page = preparePage(await loadImage(file), COLORS[settings.color].hue);
        setItem(i, 'Reading text…', 0.15);
        const { data } = await worker.recognize(page.ocr, {}, { blocks: true, text: true });
        words = extractWords(data, page);
        previews.push(makePreview(page, words));
      }
      const found = buildCards(words);
      cards.push(...found);
      setItem(i, found.length ? `Found ${plural(found.length, 'card')}` : 'No highlights found', 1, found.length ? 'done' : 'warn');
    } catch (err) {
      console.error(err);
      setItem(i, err.userMessage || "Couldn't read this file", 1, 'error');
    }
  }

  // Name the deck after the document if there was one, otherwise after today's date
  const doc = files.find(isDocx);
  const deckName = doc ? doc.name.replace(/\.docx$/i, '') : 'Notes ' + new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  go({ name: 'review', deckId, deckName, previews, cards: cards.map(c => ({ ...c, keep: true })) });
}

/* ---------- events ---------- */

app.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

app.addEventListener('input', e => {
  const el = e.target, field = el.dataset.field, i = Number(el.dataset.i);
  if (field === 'rq') view.cards[i].q = el.value;
  else if (field === 'ra') view.cards[i].a = el.value;
  else if (field === 'review-name') view.deckName = el.value;
});

app.addEventListener('change', e => {
  const el = e.target, field = el.dataset.field;
  if (field === 'keep') {
    view.cards[Number(el.dataset.i)].keep = el.checked;
    el.closest('.review-card').classList.toggle('off', !el.checked);
    app.querySelector('[data-action="review-save"]').textContent = saveLabel();
  } else if (field === 'shuffle') {
    view.shuffle = el.checked;
  } else if (field === 'deck-name') {
    findDeck(view.id).name = el.value.trim() || 'My notes';
    saveDecks();
  }
});

[camInput, libInput, docInput].forEach(input => input.addEventListener('change', () => {
  const files = [...input.files];
  input.value = '';
  if (files.length) processFiles(files, photoTarget);
}));

document.addEventListener('keydown', e => {
  if (view.name !== 'study' || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); actions.flip(); }
  else if (e.key === '1' || e.key === 'ArrowLeft') actions.again();
  else if (e.key === '2' || e.key === 'ArrowRight') actions.got();
});

applyTheme(settings ? settings.color : 'yellow');
render();
