/* ScrollRx — Scroll smarter. Vanilla JS, no backend. Study material only, not clinical advice. */
(() => {
'use strict';
const KEY = 'scrollrx.v1', GOAL = 20;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } kids.flat().forEach(c => c != null && n.append(c)); return n; };
const md = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const today = () => new Date().toLocaleDateString('en-CA');
const TYPE_LABEL = { read: '📖 Read', listen: '🎧 Listen', speak: '🎤 Say it', quiz: '❓ Quiz', demo: '🧭 Step by step', scenario: '🎬 Real scenario', flip: '🔄 Flashcard' };

let S = load();
function load() { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return fresh(); } }
function fresh() { return { xp: 0, streak: 0, last: null, day: today(), done: 0, saved: [], liked: [], srs: {}, tick: 0, topics: {}, modes: {}, autoplay: false, answered: 0, correct: 0 }; }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
if (S.day !== today()) { S.day = today(); S.done = 0; save(); }

let DATA, CARDS = [], filter = 'all', queue = [], lastType = null;
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
function toast(t) { const n = $('#toast'); n.textContent = t; n.classList.add('on'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('on'), 1400); }

/* ---------- progress ---------- */
function award(xp, card, right) {
  S.xp += xp; S.done++; S.tick++;
  const t = today();
  if (S.last !== t) { const y = new Date(Date.now() - 864e5).toLocaleDateString('en-CA'); S.streak = S.last === y ? S.streak + 1 : 1; S.last = t; if (S.streak > 1) toast(`🔥 ${S.streak}-day streak!`); }
  if (card) {
    S.modes[card.type] = (S.modes[card.type] || 0) + 1;
    if (right !== undefined) {
      const ts = S.topics[card.topic] ||= { right: 0, wrong: 0 }; right ? ts.right++ : ts.wrong++;
      S.answered++; if (right) S.correct++;
      const r = S.srs[card.id] ||= { box: 0, due: 0 };
      if (right) { r.box = Math.min(r.box + 1, 5); r.due = S.tick + 8 * 2 ** r.box; } else { r.box = 0; r.due = S.tick + 4; }
    }
  }
  if (S.done === GOAL) { toast('🎯 Daily goal hit!'); buzz([30, 40, 30]); }
  save(); hud();
}
function hud() {
  $('#xp').textContent = `⚡ ${S.xp}`; $('#streak').textContent = `🔥 ${S.streak}`;
  $('#ringfg').style.strokeDashoffset = 94.2 * (1 - Math.min(S.done / GOAL, 1));
}

/* ---------- feed algorithm: due misses first, weak topics weighted, no repeat types ---------- */
function pool() { return CARDS.filter(c => filter === 'all' || c.topic === filter); }
function weight(c) {
  const ts = S.topics[c.topic]; const acc = ts && ts.right + ts.wrong ? ts.right / (ts.right + ts.wrong) : .7;
  let w = 1 + (1 - acc) * 2;                         // weaker topic → more cards
  if (c.type === 'flip') w *= .45;                     // keep the mix varied, not just flashcards
  const r = S.srs[c.id]; if (r && r.due > S.tick) w *= .05; // recently correct → rest it
  if (c.type === lastType) w *= .05;
  return w;
}
function nextCard() {
  const p = pool(); if (!p.length) return null;
  const due = p.filter(c => S.srs[c.id] && S.srs[c.id].box === 0 && S.srs[c.id].due <= S.tick && !queue.includes(c.id) && c.type !== lastType);
  let c;
  if (due.length) { c = due[0]; c._again = true; }
  else { let tot = 0; const ws = p.map(x => (tot += weight(x))); const r = Math.random() * tot; c = p[ws.findIndex(x => x >= r)] || p[0]; c._again = false; }
  queue.push(c.id); if (queue.length > 12) queue.shift(); lastType = c.type; return c;
}
function fill(n = 6) { const feed = $('#feed'); for (let i = 0; i < n; i++) { const c = nextCard(); if (c) feed.append(slide(c)); } }
function resetFeed(firstType) {
  const feed = $('#feed'); feed.innerHTML = ''; queue = []; lastType = null;
  if (firstType) { const c = pool().find(x => x.type === firstType); if (c) { lastType = c.type; feed.append(slide(c)); } }
  fill(6); feed.scrollTop = 0; observe();
}

/* ---------- slide shell (rail with like/save/listen) ---------- */
function slide(c) {
  const card = el('article', { class: 'card', 'data-type': c.type, 'data-id': c.id, tabindex: '0', 'aria-label': TYPE_LABEL[c.type] + ' card' });
  const topic = DATA.topics[c.topic] || { label: c.topic, emoji: '📚' };
  card.append(el('div', { class: 'tag' }, `${topic.emoji} ${topic.label} · ${TYPE_LABEL[c.type]}`, c._again ? el('span', { class: 'pill', style: 'margin-left:8px' }, '🔁 again') : null));
  (R[c.type] || R.read)(card, c);
  if (c.source) card.append(el('div', { class: 'src' }, '✔ Verify: ' + c.source));
  const liked = S.liked.includes(c.id), saved = S.saved.includes(c.id);
  const likeB = el('button', { class: liked ? 'on' : '', 'aria-label': 'Like', 'aria-pressed': String(liked), onclick: () => like(c, wrap, likeB) }, '❤️');
  const saveB = el('button', { class: saved ? 'on' : '', 'aria-label': 'Save', 'aria-pressed': String(saved), onclick: () => toggleSave(c, saveB) }, '🔖');
  const sayB = el('button', { 'aria-label': 'Read aloud', onclick: () => speak(cardText(c)) }, '🔊');
  const wrap = el('section', { class: 'slide' }, card, el('div', { class: 'rail' }, likeB, saveB, sayB));
  let lastTap = 0;
  card.addEventListener('pointerup', e => { if (e.target.closest('button,input,.flip')) return; const n = Date.now(); if (n - lastTap < 320) like(c, wrap, likeB, true); lastTap = n; });
  return wrap;
}
function like(c, wrap, b, dbl) {
  const i = S.liked.indexOf(c.id);
  if (i < 0 || dbl) { if (i < 0) S.liked.push(c.id); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); const h = el('div', { class: 'heart' }, '❤️'); wrap.append(h); setTimeout(() => h.remove(), 800); buzz(15); }
  else { S.liked.splice(i, 1); b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
  save();
}
function toggleSave(c, b) {
  const i = S.saved.indexOf(c.id);
  if (i < 0) { S.saved.push(c.id); toast('🔖 Saved'); } else { S.saved.splice(i, 1); toast('Removed'); }
  b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0)); buzz(10); save();
}
function cardText(c) {
  const f = { read: () => `${c.title}. ${c.body}`, listen: () => c.text, flip: () => `${c.front}. ${c.back}`, quiz: () => `${c.question} ${c.choices.map((x, i) => `Option ${i + 1}: ${x}.`).join(' ')}`, speak: () => c.prompt, demo: () => `${c.title}. ${c.steps.join('. ')}`, scenario: () => c.setup }[c.type];
  return (f ? f() : c.title || '').replace(/\*\*/g, '');
}
/* ---------- speech ---------- */
function speak(text, onend, lang) {
  if (!('speechSynthesis' in window)) { toast('🔇 Voice not supported here'); return false; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = .95; u.lang = lang || 'en-US'; if (onend) u.onend = onend; speechSynthesis.speak(u); return true;
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function grade(said, c) { const norm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); const s = norm(said); if (s === norm(c.answer)) return true; if (c.match === 'any') return c.keywords.some(k => s.includes(norm(k))); const hit = c.keywords.filter(k => s.includes(norm(k))).length; return hit >= Math.max(1, Math.ceil(c.keywords.length * .6)) || (c.keywords.length > 2 && hit >= c.keywords.length - 1); }

/* ---------- renderers ---------- */
const R = {
  read(card, c) { card.append(el('h2', {}, c.title), el('div', { class: 'body', html: md(c.body) })); doneBtn(card, c, 'Got it 👍', 5); },
  flip(card, c) {
    const f = el('div', { class: 'flip', role: 'button', tabindex: '0', 'aria-label': 'Flip card' },
      el('div', { class: 'flip-in' }, el('div', { class: 'face' }, el('div', { class: 'big' }, c.front), el('div', { class: 'mut' }, 'tap to flip')),
        el('div', { class: 'face back' }, el('div', { class: 'big', style: 'font-size:28px' }, c.back), c.note ? el('div', { class: 'mut' }, c.note) : null)));
    const flip = () => { f.classList.toggle('on'); buzz(8); if (!rate.isConnected) card.append(rate); };
    f.onclick = flip; f.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip());
    const rate = el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => { award(2, c, false); rate.replaceWith(el('div', { class: 'mut' }, '🔁 Coming back soon')); } }, '😬 Missed it'),
      el('button', { class: 'btn primary', onclick: () => { award(5, c, true); rate.replaceWith(el('div', { class: 'mut' }, '✅ +5 XP')); } }, '😎 Knew it'));
    card.append(el('h2', {}, c.title), f);
  },
  listen(card, c) {
    const txt = el('div', { class: 'body blur' }, c.text);
    const play = el('button', { class: 'btn primary', 'data-act': 'play', onclick: () => { const ok = speak(c.text, () => play.textContent = '▶️ Play again', c.lang); play.textContent = ok ? '🔊 Playing…' : '▶️ Play'; if (!card._done) { card._done = 1; award(4, c); } } }, '▶️ Play');
    card.append(el('h2', {}, c.title), el('div', { class: 'mut' }, 'Listen first, then reveal the text.'), play, txt,
      el('button', { class: 'btn', onclick: e => { txt.classList.add('on'); e.target.remove(); } }, '👀 Show text'));
    card._autoplay = () => play.click();
  },
  speak(card, c) {
    const out = el('div'); const input = el('input', { class: 'input', placeholder: 'Or type your answer…', 'aria-label': 'Type your answer' });
    const check = said => { if (card._done) return; card._done = 1; const ok = grade(said, c); award(ok ? 10 : 2, c, ok); buzz(ok ? 20 : [40, 30, 40]);
      out.replaceChildren(el('div', { class: 'explain' }, el('b', {}, ok ? '✅ Nailed it! ' : '❌ Not quite. '), `You said: “${said}”. `, el('br'), 'Answer: ' + c.answer)); };
    const mic = el('button', { class: 'btn primary', 'data-act': 'mic' }, SR ? '🎤 Tap & say it' : '🎤 Mic not supported — type below');
    if (SR) mic.onclick = () => { const r = new SR(); r.lang = c.lang || 'en-US'; r.interimResults = false; mic.textContent = '🔴 Listening…';
      r.onresult = e => check(e.results[0][0].transcript); r.onerror = e => { mic.textContent = '🎤 Try again (' + e.error + ')'; }; r.onend = () => { if (!card._done) mic.textContent = '🎤 Tap & say it'; }; try { r.start(); } catch { mic.textContent = '🎤 Mic unavailable'; } };
    else mic.disabled = true;
    card.append(el('h2', {}, c.prompt), mic, el('div', { class: 'row' }, input, el('button', { class: 'btn', onclick: () => input.value.trim() && check(input.value.trim()) }, 'Check')), out);
    input.onkeydown = e => e.key === 'Enter' && input.value.trim() && check(input.value.trim());
  },
  quiz(card, c) {
    const box = el('div', { class: 'choices' });
    c.choices.forEach((ch, i) => box.append(el('button', { class: 'btn', 'data-i': i, onclick: e => {
      if (card._done) return; card._done = 1; const ok = i === c.answer; award(ok ? 10 : 2, c, ok); buzz(ok ? 20 : [40, 30, 40]);
      e.currentTarget.classList.add(ok ? 'ok' : 'bad'); box.children[c.answer].classList.add('ok');
      card.append(el('div', { class: 'explain' }, el('b', {}, ok ? '✅ Correct! +10 XP ' : '❌ Not quite — it\'ll come back soon. '), c.explain || ''));
    } }, ch)));
    card.append(el('h2', {}, c.question), box);
  },
  demo(card, c) {
    const ol = el('ol', { class: 'steps' }, c.steps.map(s => el('li', {}, s))); let i = 0;
    const nxt = el('button', { class: 'btn primary', 'data-act': 'next' }, '▶ Start');
    nxt.onclick = () => { if (i < c.steps.length) { [...ol.children].forEach(l => l.classList.remove('cur')); ol.children[i].classList.add('on', 'cur'); i++; buzz(6); nxt.textContent = i < c.steps.length ? `Next step (${i}/${c.steps.length})` : '✅ Done'; if (i === c.steps.length) { award(8, c); nxt.disabled = true; } } };
    card.append(el('h2', {}, c.title), ol, nxt);
  },
  scenario(card, c) {
    const box = el('div', { class: 'choices' });
    c.choices.forEach(ch => box.append(el('button', { class: 'btn', onclick: e => {
      if (card._done) return; card._done = 1; award(ch.correct ? 12 : 3, c, ch.correct); buzz(ch.correct ? 20 : [40, 30, 40]);
      e.currentTarget.classList.add(ch.correct ? 'ok' : 'bad'); card.append(el('div', { class: 'explain' }, ch.result));
      if (!ch.correct) { const best = c.choices.find(x => x.correct); card.append(el('div', { class: 'mut' }, 'Better move: ' + best.text)); }
    } }, ch.text)));
    card.append(el('h2', {}, c.title), el('div', { class: 'body' }, c.setup), box);
  }
};
function doneBtn(card, c, label, xp) { const b = el('button', { class: 'btn primary', onclick: () => { award(xp, c); b.textContent = `✅ +${xp} XP`; b.disabled = true; } }, label); card.append(b); }

/* ---------- autoplay on visible listen cards ---------- */
let io;
function observe() {
  io && io.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; const card = e.target.querySelector('.card');
    if (S.autoplay && card._autoplay && !card._auto) { card._auto = 1; card._autoplay(); }
    const all = [...$('#feed').children]; if (all.indexOf(e.target) > all.length - 4) { fill(5); observe(); }
  }), { root: $('#feed'), threshold: .6 });
  [...$('#feed').children].forEach(s => io.observe(s));
}

/* ---------- tabs ---------- */
function tab(name) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('#saved').hidden = name !== 'saved'; $('#filters').hidden = name !== 'feed'; $('#profile').hidden = name !== 'profile';
  if (name === 'saved') renderSaved(); if (name === 'profile') renderProfile();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function renderSaved() {
  const list = $('#savedlist'); list.innerHTML = '';
  const items = S.saved.map(id => CARDS.find(c => c.id === id)).filter(Boolean);
  if (!items.length) list.append(el('p', { class: 'mut' }, 'Nothing saved yet. Tap 🔖 on any card.'));
  items.forEach(c => list.append(el('div', { class: 'tile' }, el('div', { class: 'tag' }, TYPE_LABEL[c.type]), el('b', {}, c.title || ''), el('div', {}, (cardText(c) || '').slice(0, 160)))));
}
function renderProfile() {
  const p = $('#profile'); const acc = S.answered ? Math.round(100 * S.correct / S.answered) : 0;
  p.replaceChildren(el('h2', {}, 'Your progress'),
    el('div', { class: 'grid' }, el('div', { class: 'tile' }, el('b', {}, String(S.xp)), 'XP'), el('div', { class: 'tile' }, el('b', {}, String(S.streak)), 'day streak'), el('div', { class: 'tile' }, el('b', {}, acc + '%'), 'accuracy')),
    el('div', { class: 'tile' }, el('b', {}, `Today: ${S.done}/${GOAL} cards`), el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, 100 * S.done / GOAL)}%` }))),
    el('h3', {}, 'By topic'), ...Object.entries(DATA.topics).map(([k, t]) => { const s = S.topics[k] || { right: 0, wrong: 0 }; const n = s.right + s.wrong; const a = n ? Math.round(100 * s.right / n) : 0;
      return el('div', { class: 'tile' }, `${t.emoji} ${t.label} — ${n ? a + '% of ' + n : 'not started'}`, el('div', { class: 'bar' }, el('i', { style: `width:${a}%` }))); }),
    el('h3', {}, 'Learning modes used'), el('div', { class: 'tile' }, Object.entries(TYPE_LABEL).map(([k, v]) => `${v}: ${S.modes[k] || 0}`).join(' · ')),
    el('h3', {}, 'Settings'),
    el('label', { class: 'tile switch' }, 'Auto-play listen cards', (() => { const i = el('input', { type: 'checkbox', id: 'autoplay' }); i.checked = S.autoplay; i.onchange = () => { S.autoplay = i.checked; save(); }; return i; })()),
    el('button', { class: 'btn', style: 'width:100%', onclick: () => { if (confirm('Reset all progress?')) { localStorage.removeItem(KEY); location.reload(); } } }, '↺ Reset progress'),
    el('p', { class: 'disclaimer' }, `⚠️ ScrollRx is study material, not clinical, legal or billing advice. Always verify with official sources (PTCB, NHA, HHS, CMS, DEA, DailyMed) and your instructors. ${CARDS.length} cards · content v${DATA.version}.`),
    el('p', { class: 'disclaimer' }, 'Install: on Android Chrome use ⋮ → “Add to Home screen”; on iPhone Safari use Share → “Add to Home Screen”. Works offline after first load.'));
}

/* ---------- boot ---------- */
async function boot() {
  DATA = window.SCROLLRX_CONTENT || await (await fetch('content/cards.json')).json();
  CARDS = DATA.cards;
  const f = $('#filters'); const mk = (k, label) => el('button', { role: 'tab', 'data-f': k, class: k === filter ? 'on' : '', onclick: e => { filter = k; f.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); resetFeed(); } }, label);
  f.append(mk('all', '✨ For You'), ...Object.entries(DATA.topics).map(([k, t]) => mk(k, `${t.emoji} ${t.label}`)));
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
  hud(); resetFeed((location.hash.match(/type=(\w+)/) || [])[1]);
  document.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const feed = $('#feed'); if (e.key === 'ArrowDown' || e.key === 'j') { feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' }); e.preventDefault(); } if (e.key === 'ArrowUp' || e.key === 'k') { feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' }); e.preventDefault(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__srx = { get state() { return S; }, cards: CARDS, nextCard, resetFeed, grade };
}
boot();
})();
