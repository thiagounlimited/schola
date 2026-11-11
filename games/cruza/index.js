// CRUZA — palavras cruzadas para aprender. Cada palavra acertada abre um card com explicação
// e analogia; cada fase termina com um mini-quiz sobre o que você aprendeu.
import { LEVELS, FREE, scoreLevel } from './levels.js';
import { CATS, catById, words, wordById, loadRemote, normalize } from './bank.js';
import { buildGrid, cellsOf, shuffle, rng } from './generator.js';
import { icons } from '../../js/icons.js';
import { SKILLS } from '../../js/catalog.js';
import { rankFor, fmt, MAX_POINTS } from '../../js/scoring.js';
import { L, lang } from '../../js/i18n.js';

const CSS_ID = 'cruza-css';
const WIN_TITLES = L(['Grade completa!', 'Aprendeu tudo!', 'Cruzou bonito!', 'Mente afiada!'], ['Grid complete!', 'All learned!', 'Beautifully crossed!', 'Sharp mind!']);
const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const skillOf = (id) => SKILLS.find((s) => s.id === id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default {
  id: 'cruza',
  title: 'CRUZA',
  tagline: L('Palavras cruzadas que ensinam: cada acerto vem com uma explicação e uma analogia.', 'Crosswords that teach: every answer comes with an explanation and an analogy.'),
  accent: '#3EDBB0',
  cover: new URL('./cover.webp', import.meta.url).href,
  skills: ['memoria', 'criatividade', 'planejamento', 'atencao'],
  levels: LEVELS,
  free: { name: FREE.name, skill: FREE.skill, focus: FREE.focus, path: 'livre' },
  mount: (root, api) => new CruzaApp(root, api),
};

// A grade de uma fase: mesma semente para todos os jogadores do mesmo idioma.
export function levelGrid(level, lg = lang, pool = null) {
  const list = pool || words(level.cat, lg);
  return buildGrid(list, { count: level.count, size: level.size, seed: `${level.seed}-${lg}` });
}

// Esconde a palavra (e variações sem acento) dentro de um texto, para o quiz.
function mask(text, entry) {
  const target = normalize(entry.word);
  return text.replace(/[\p{L}]+/gu, (w) => (normalize(w).startsWith(target.slice(0, Math.max(4, target.length - 2))) ? '_____' : w));
}

class CruzaApp {
  constructor(root, api) {
    this.root = root;
    this.api = api;
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement('link');
      link.id = CSS_ID;
      link.rel = 'stylesheet';
      link.href = new URL('./cruza.css', import.meta.url).href;
      document.head.appendChild(link);
    }
    this._key = (e) => this.onKey(e);
    window.addEventListener('keydown', this._key);
  }

  async route(path) {
    this._stopPlay();
    const token = (this._token = {});
    const parts = (path || '').split('/');
    if (parts[0] === 'glossario') return this.showGlossary();
    if (parts[0] === 'livre' && !parts[1]) return this.showFreePicker();
    this.root.innerHTML = `<div class="cz-loading">${L('Preparando a grade…', 'Setting up the grid…')}</div>`;
    await loadRemote();
    if (token !== this._token) return;
    if (parts[0] === 'livre') return this.play({ ...FREE, cat: parts[1] === 'todas' ? null : parts[1], seed: Date.now() });
    const lv = parts[0] === 'fase' && LEVELS.find((l) => l.id === parts[1]);
    if (lv && this._unlocked(LEVELS.indexOf(lv))) return this.play(lv);
    this.showMap();
  }

  destroy() {
    this._stopPlay();
    window.removeEventListener('keydown', this._key);
  }

  _records() { return this.api.progress.levels(); }
  _unlocked(i) { return i === 0 || Boolean(this._records()[LEVELS[i - 1].id]); }
  _data() { const d = this.api.progress.data(); d.learned ||= []; return d; }
  _learned() { return new Set(this._data().learned); }

  _stopPlay() {
    clearInterval(this.freeTimer);
    clearTimeout(this.msgTimer);
    this.game = null;
  }

  // ---------- Mapa ----------
  showMap() {
    const rec = this._records();
    const pts = this.api.progress.points();
    const rank = rankFor(pts);
    const nextIdx = LEVELS.findIndex((_, i) => this._unlocked(i) && !rec[LEVELS[i].id]);
    const visibleUntil = nextIdx < 0 ? LEVELS.length : nextIdx + 2;
    const shown = LEVELS.slice(0, visibleUntil);
    const hidden = LEVELS.length - shown.length;
    const learned = this._learned();
    const total = words(null).length;
    const mine = words(null).filter((e) => learned.has(e.id)).length;

    const card = (l, i) => {
      const r = rec[l.id];
      const open = this._unlocked(i);
      const isNext = i === nextIdx;
      const sk = skillOf(l.skill);
      const cat = l.cat ? catById(l.cat) : null;
      return `
        <button class="cz-level ${isNext ? 'next' : ''} ${open ? '' : 'locked'} ${r ? 'done' : ''}" data-lv="${l.id}" ${open ? '' : 'disabled'} style="--c:${sk.color}">
          <span class="cz-num">${open ? l.id : icons.lock}</span>
          <span class="cz-lv-main">
            <span class="cz-lv-top">${isNext ? `<em>${L('Próxima fase', 'Next level')}</em>` : ''}<b>${l.name}</b></span>
            <span class="cz-cat" style="--k:${cat ? cat.color : '#fff'}">${cat ? `${cat.icon} ${cat.name}` : `✨ ${L('Todas as categorias', 'All categories')}`} · ${L(`${l.count} palavras`, `${l.count} words`)}</span>
            <span class="cz-focus">${icons.target}${l.focus}<i>· ${sk.name}</i></span>
          </span>
          <span class="cz-lv-pts">${r ? `<b>${fmt(r.points)}</b><small>${L('de', 'of')} ${fmt(l.points)}</small>` : `<small>${L('até', 'up to')}</small><b>${fmt(l.points)}</b>`}</span>
        </button>`;
    };

    this.root.innerHTML = `
      <div class="cz-map">
        <header class="cz-top">
          <button class="icon-btn" data-act="home" aria-label="${L('Voltar ao início', 'Back to home')}">${icons.back}</button>
          <h1 class="cz-logo">CRUZA</h1>
        </header>
        <section class="cz-score" style="--rc:${rank.color}">
          <div><span>${L('Seus pontos no CRUZA', 'Your CRUZA points')}</span><b>${fmt(pts)}</b><small>${L('de', 'of')} ${fmt(MAX_POINTS)}</small></div>
          <div class="cz-rank"><span>${L('Faixa', 'Rank')}</span><b>${rank.name}</b><i><u style="width:${Math.max(3, rank.frac * 100)}%"></u></i></div>
        </section>
        <button class="cz-gloss-btn" data-act="gloss">
          <span class="cz-gloss-ico">📖</span>
          <span><b>${L('Seu glossário', 'Your glossary')}</b><small>${L(`${mine} de ${total} palavras aprendidas, com explicação e analogia`, `${mine} of ${total} words learned, with explanation and analogy`)}</small></span>
          <span class="cz-gloss-bar"><i style="width:${total ? Math.round((mine / total) * 100) : 0}%"></i></span>
        </button>
        <p class="cz-how">${icons.sparkle}<span>${L('Toque numa casa e digite. Cada palavra certa abre um <b>card</b> com explicação e analogia. No fim, um mini-quiz vale pontos extras.', 'Tap a square and type. Every right word opens a <b>card</b> with an explanation and an analogy. At the end, a mini-quiz earns bonus points.')}</span></p>
        <div class="cz-path">${shown.map((l) => card(l, LEVELS.indexOf(l))).join('')}</div>
        ${hidden > 0 ? `<p class="cz-more">${icons.lock} ${L(`Mais ${hidden} fase${hidden > 1 ? 's' : ''}, com grades maiores: desbloqueie avançando.`, `${hidden} more level${hidden > 1 ? 's' : ''} with bigger grids: unlock them as you go.`)}</p>` : ''}
        <button class="cz-free" data-act="free">
          <span class="cz-free-ico">${icons.sparkle}</span>
          <span><b>${FREE.name}</b><small>${L('Sem pontos: escolha uma categoria e aprenda no seu ritmo. Cada minuto conta para Memória.', 'No points: pick a category and learn at your own pace. Every minute counts toward Memory.')}</small></span>
          <span class="cz-free-go">${icons.play}</span>
        </button>
      </div>`;
    this.root.onclick = (e) => {
      const lv = e.target.closest('[data-lv]');
      if (lv && !lv.disabled) { this.api.audio.tick(); this.api.go(`fase/${lv.dataset.lv}`); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'home') { this.api.audio.tick(); this.api.home(); }
      if (act === 'free') { this.api.audio.tick(); this.api.go('livre'); }
      if (act === 'gloss') { this.api.audio.tick(); this.api.go('glossario'); }
    };
  }

  // ---------- Grade livre: escolha da categoria ----------
  showFreePicker() {
    this.root.innerHTML = `
      <div class="cz-map">
        <header class="cz-top">
          <button class="icon-btn" data-act="map" aria-label="${L('Voltar ao mapa', 'Back to map')}">${icons.back}</button>
          <h1 class="cz-title">${FREE.name}</h1>
        </header>
        <p class="cz-how">${icons.sparkle}<span>${L('Escolha uma categoria. Cada grade é nova, sem pontos e sem pressa.', 'Pick a category. Every grid is new, no points, no rush.')}</span></p>
        <div class="cz-cats">
          ${CATS.map((c) => `<button class="cz-catcard" data-cat="${c.id}" style="--k:${c.color}"><span>${c.icon}</span><b>${c.name}</b><small>${L(`${words(c.id).length} palavras`, `${words(c.id).length} words`)}</small></button>`).join('')}
          <button class="cz-catcard" data-cat="todas" style="--k:#fff"><span>✨</span><b>${L('Todas', 'All')}</b><small>${L('Uma mistura de tudo', 'A mix of everything')}</small></button>
        </div>
      </div>`;
    this.root.onclick = (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { this.api.audio.tick(); this.api.go(`livre/${c.dataset.cat}`); return; }
      if (e.target.closest('[data-act="map"]')) { this.api.audio.tick(); this.api.go(''); }
    };
  }

  // ---------- Glossário ----------
  showGlossary() {
    const learned = this._learned();
    const list = words(null).filter((e) => learned.has(e.id));
    let filter = 'all';
    this.root.innerHTML = `
      <div class="cz-map">
        <header class="cz-top">
          <button class="icon-btn" data-act="map" aria-label="${L('Voltar ao mapa', 'Back to map')}">${icons.back}</button>
          <h1 class="cz-title">📖 ${L('Seu glossário', 'Your glossary')}</h1>
        </header>
        <p class="cz-how">${icons.sparkle}<span>${list.length
          ? L(`Você já aprendeu <b>${list.length}</b> palavras. Toque numa para rever a explicação e a analogia.`, `You have learned <b>${list.length}</b> words so far. Tap one to revisit its explanation and analogy.`)
          : L('Ainda vazio: cada palavra que você acertar nas grades aparece aqui, com explicação e analogia.', 'Still empty: every word you get right in a grid shows up here, with its explanation and analogy.')}</span></p>
        <div class="seg cz-gloss-filter" role="group">
          <button data-f="all" aria-pressed="true">${L('Todas', 'All')}</button>
          ${CATS.map((c) => `<button data-f="${c.id}" aria-pressed="false">${c.icon}</button>`).join('')}
        </div>
        <div class="cz-gloss"></div>
      </div>`;
    const box = this.root.querySelector('.cz-gloss');
    const render = () => {
      const rows = list.filter((e) => filter === 'all' || e.cat === filter).sort((a, b) => a.word.localeCompare(b.word));
      box.innerHTML = rows.length ? rows.map((e) => { const c = catById(e.cat); return `
        <details class="cz-gl" style="--k:${c.color}">
          <summary><b>${esc(e.word)}</b><small>${c.icon} ${c.name}</small></summary>
          <p>${esc(e.explain)}</p>
          <p class="cz-analogy">💡 ${esc(e.analogy)}</p>
        </details>`; }).join('') : `<p class="muted">${L('Nada nesta categoria ainda.', 'Nothing in this category yet.')}</p>`;
    };
    render();
    this.root.onclick = (e) => {
      const f = e.target.closest('[data-f]');
      if (f) {
        filter = f.dataset.f;
        this.root.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
        this.api.audio.tick();
        render();
      }
      if (e.target.closest('[data-act="map"]')) { this.api.audio.tick(); this.api.go(''); }
    };
  }

  // ---------- Fase ----------
  play(level) {
    const isFree = level.mode === 'free';
    const pool = words(level.cat);
    const grid = isFree
      ? buildGrid(pool, { count: level.count, size: level.size, seed: level.seed })
      : levelGrid(level, lang, pool);
    if (!grid) {
      this.root.innerHTML = `<div class="cz-loading">${L('Não deu para montar esta grade agora. Volte ao mapa e tente outra.', 'Could not build this grid right now. Go back to the map and try another one.')}</div>`;
      setTimeout(() => this.api.go(''), 2500);
      return;
    }
    const sk = skillOf(level.skill);
    const cat = level.cat ? catById(level.cat) : null;
    const g = (this.game = {
      level, grid, isFree,
      fill: grid.cells.map((row) => row.map(() => '')),
      solved: new Set(), lastTry: new Map(), hinted: new Set(),
      wrongs: 0, helped: false, cards: [], cur: null, dir: 'a',
    });
    g.at = new Map();
    grid.words.forEach((p, i) => cellsOf(p).forEach(([r, c]) => { const k = `${r},${c}`; const v = g.at.get(k) || {}; v[p.dir] = i; g.at.set(k, v); }));

    this.root.innerHTML = `
      <div class="cz-play" style="--k:${cat ? cat.color : '#3EDBB0'}">
        <header class="cz-hud cz-hud">
          <button class="icon-btn" data-act="map" aria-label="${L('Voltar ao mapa', 'Back to map')}">${icons.back}</button>
          <div class="cz-hud-title">
            <span class="cz-hud-name">${isFree ? `${level.name}${cat ? ` · ${cat.icon}` : ''}` : `${level.id} · ${level.name}`}</span>
            <span class="cz-hud-status" aria-live="polite"></span>
          </div>
          <div class="cz-hud-actions">
            <button class="cz-help" data-act="help" aria-label="${L('Ajuda', 'Help')}">${icons.help}<span>${L('Ajuda', 'Help')}</span></button>
          </div>
        </header>
        <div class="cz-focusbar" style="--c:${sk.color}">${icons.target}<span>${cat ? `${cat.icon} ${cat.name}` : `✨ ${L('Todas as categorias', 'All categories')}`} · ${L('Treina', 'Trains')}: <b>${level.focus}</b></span></div>
        <div class="cz-body">
          <div class="cz-board-wrap">
            <div class="cz-board" style="--w:${grid.w};--h:${grid.h}">
              ${grid.cells.map((row, r) => row.map((ch, c) => {
                if (!ch) return '<i class="cz-block"></i>';
                const start = grid.words.find((p) => p.row === r && p.col === c);
                return `<button class="cz-cell" data-r="${r}" data-c="${c}" tabindex="-1">${start ? `<small>${start.num}</small>` : ''}<span></span></button>`;
              }).join('')).join('')}
            </div>
          </div>
          <aside class="cz-clues">
            <h3>${L('Horizontais', 'Across')}</h3><ol data-dir="a"></ol>
            <h3>${L('Verticais', 'Down')}</h3><ol data-dir="d"></ol>
          </aside>
        </div>
        <div class="cz-cluebar">
          <button class="icon-btn" data-act="prev" aria-label="${L('Palavra anterior', 'Previous word')}">${icons.back}</button>
          <button class="cz-clue" data-act="flip"></button>
          <button class="icon-btn" data-act="next" aria-label="${L('Próxima palavra', 'Next word')}">${icons.next}</button>
        </div>
        <div class="cz-kbd" aria-label="${L('Teclado', 'Keyboard')}">
          ${KEYS.map((row, i) => `<div>${[...row].map((k) => `<button data-k="${k}">${k}</button>`).join('')}${i === 2 ? `<button data-k="⌫" class="wide" aria-label="${L('Apagar', 'Delete')}">⌫</button>` : ''}</div>`).join('')}
        </div>
        <div class="cz-msg cz-msg" role="status"></div>
      </div>`;

    this.cellEls = new Map([...this.root.querySelectorAll('.cz-cell')].map((el) => [`${el.dataset.r},${el.dataset.c}`, el]));
    this.root.onclick = (e) => this.onClick(e);
    this.root.querySelector('.cz-kbd').addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-k]');
      if (!k) return;
      e.preventDefault();
      this.api.haptic(5);
      if (k.dataset.k === '⌫') this.erase(); else this.type(k.dataset.k);
    });
    this.selectWord(0);
    this.renderClues();
    this.say(isFree ? L('Grade nova. Sem pontos, só aprendizado.', 'A fresh grid. No points, just learning.') : L(`Complete as ${grid.words.length} palavras. Cada acerto ensina algo novo.`, `Fill in all ${grid.words.length} words. Every answer teaches you something new.`));
    if (isFree) this.freeTimer = setInterval(() => this.api.progress.addFreeMinute('memoria'), 60000);
  }

  say(text, sticky) {
    const msg = this.root.querySelector('.cz-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.classList.add('show');
    clearTimeout(this.msgTimer);
    if (!sticky) this.msgTimer = setTimeout(() => msg.classList.remove('show'), 3800);
  }

  onClick(e) {
    const g = this.game;
    if (!g) return;
    const cell = e.target.closest('.cz-cell');
    if (cell) {
      const r = +cell.dataset.r;
      const c = +cell.dataset.c;
      const v = g.at.get(`${r},${c}`);
      if (g.cur && g.cur[0] === r && g.cur[1] === c && v.a != null && v.d != null) g.dir = g.dir === 'a' ? 'd' : 'a';
      else if (v[g.dir] == null) g.dir = g.dir === 'a' ? 'd' : 'a';
      g.cur = [r, c];
      this.api.audio.tick();
      this.paint();
      return;
    }
    const clue = e.target.closest('[data-word]');
    if (clue) {
      const i = +clue.dataset.word;
      if (e.target.closest('[data-card]')) { this.showCard(g.grid.words[i].entry); return; }
      this.selectWord(i);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'map') { this.api.audio.tick(); this.api.go(this.game.isFree ? 'livre' : ''); }
    if (act === 'prev') this.stepWord(-1);
    if (act === 'next') this.stepWord(1);
    if (act === 'flip') {
      const v = g.at.get(`${g.cur[0]},${g.cur[1]}`);
      if (v.a != null && v.d != null) { g.dir = g.dir === 'a' ? 'd' : 'a'; this.paint(); }
    }
    if (act === 'help') this.help();
  }

  onKey(e) {
    const g = this.game;
    if (!g || this.root.querySelector('.cz-over') || document.querySelector('.sheet-wrap')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[a-zA-ZÀ-ÿ]$/.test(k)) { e.preventDefault(); this.type(normalize(k)); return; }
    if (k === 'Backspace') { e.preventDefault(); this.erase(); return; }
    if (k === 'Tab' || k === 'Enter') { e.preventDefault(); this.stepWord(e.shiftKey ? -1 : 1); return; }
    const arrows = { ArrowRight: [0, 1, 'a'], ArrowLeft: [0, -1, 'a'], ArrowDown: [1, 0, 'd'], ArrowUp: [-1, 0, 'd'] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc, dir] = arrows[k];
      if (g.dir !== dir && g.at.get(`${g.cur[0]},${g.cur[1]}`)[dir] != null) { g.dir = dir; this.paint(); return; }
      let [r, c] = g.cur;
      for (;;) {
        r += dr; c += dc;
        if (r < 0 || c < 0 || r >= g.grid.h || c >= g.grid.w) break;
        if (g.grid.cells[r][c]) {
          g.cur = [r, c];
          if (g.at.get(`${r},${c}`)[g.dir] == null) g.dir = g.dir === 'a' ? 'd' : 'a';
          this.paint();
          break;
        }
      }
    }
  }

  wordIdx() { return this.game.at.get(`${this.game.cur[0]},${this.game.cur[1]}`)[this.game.dir]; }
  locked(r, c) { const v = this.game.at.get(`${r},${c}`); return [v.a, v.d].some((i) => i != null && this.game.solved.has(i)); }

  selectWord(i) {
    const g = this.game;
    const p = g.grid.words[i];
    g.dir = p.dir;
    const cells = cellsOf(p);
    g.cur = cells.find(([r, c]) => !g.fill[r][c]) || cells[0];
    this.paint();
  }

  stepWord(d) {
    const g = this.game;
    const n = g.grid.words.length;
    let i = this.wordIdx();
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!g.solved.has(i)) break;
    }
    this.api.audio.tick();
    this.selectWord(i);
  }

  type(ch) {
    const g = this.game;
    if (!g || !g.cur) return;
    const i = this.wordIdx();
    const cells = cellsOf(g.grid.words[i]);
    let pos = cells.findIndex(([r, c]) => r === g.cur[0] && c === g.cur[1]);
    while (pos < cells.length && this.locked(...cells[pos])) pos++;
    if (pos >= cells.length) { this.stepWord(1); return; }
    const [r, c] = cells[pos];
    g.fill[r][c] = ch;
    this.api.audio.pluck(440 * 2 ** ((ch.charCodeAt(0) % 12) / 24), 0.25, 0, 0.3);
    let next = pos + 1;
    while (next < cells.length && this.locked(...cells[next])) next++;
    if (next < cells.length) g.cur = cells[next];
    this.check(r, c);
    this.paint();
  }

  erase() {
    const g = this.game;
    if (!g || !g.cur) return;
    const cells = cellsOf(g.grid.words[this.wordIdx()]);
    let pos = cells.findIndex(([r, c]) => r === g.cur[0] && c === g.cur[1]);
    if (!g.fill[g.cur[0]][g.cur[1]] || this.locked(...g.cur)) {
      pos--;
      while (pos >= 0 && this.locked(...cells[pos])) pos--;
      if (pos < 0) return;
      g.cur = cells[pos];
    }
    if (!this.locked(...g.cur)) g.fill[g.cur[0]][g.cur[1]] = '';
    this.paint();
  }

  // Confere as palavras que passam pela casa (r, c).
  check(r, c) {
    const g = this.game;
    const v = g.at.get(`${r},${c}`);
    for (const i of [v.a, v.d]) {
      if (i == null || g.solved.has(i)) continue;
      const p = g.grid.words[i];
      const typed = cellsOf(p).map(([rr, cc]) => g.fill[rr][cc]).join('');
      if (typed.length < p.entry.answer.length) continue;
      if (typed === p.entry.answer) this.solve(i);
      else if (g.lastTry.get(i) !== typed) {
        // Cada palavra conta no máximo uma vez como "precisou de outra tentativa".
        if (!g.lastTry.has(i)) g.wrongs++;
        g.lastTry.set(i, typed);
        this.api.audio.nope();
        this.api.haptic(25);
        cellsOf(p).forEach(([rr, cc]) => {
          const el = this.cellEls.get(`${rr},${cc}`);
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
        });
        this.say(L('Quase! Alguma letra não bate. Confira os cruzamentos.', 'Almost! A letter doesn\'t fit. Check the crossings.'));
      }
    }
  }

  solve(i) {
    const g = this.game;
    g.solved.add(i);
    const p = g.grid.words[i];
    const d = this._data();
    if (!d.learned.includes(p.entry.id)) { d.learned.push(p.entry.id); this.api.progress.saveData(); }
    this.api.audio.chime(523 * 2 ** ((g.solved.size % 5) / 12), 0.6);
    this.api.haptic(15);
    cellsOf(p).forEach(([r, c]) => this.cellEls.get(`${r},${c}`).classList.add('pop'));
    g.cards.push(p.entry);
    if (!this.root.querySelector('.cz-over')) setTimeout(() => this.nextCard(), 450);
  }

  nextCard() {
    const g = this.game;
    if (!g) return;
    const entry = g.cards.shift();
    if (entry) { this.showCard(entry, () => this.nextCard()); return; }
    if (g.solved.size === g.grid.words.length) this.finish();
    else {
      const open = g.grid.words.findIndex((_, k) => !g.solved.has(k));
      if (g.solved.has(this.wordIdx())) this.selectWord(open);
    }
  }

  // Card de aprendizado: a palavra, a explicação e a analogia.
  showCard(entry, after) {
    const c = catById(entry.cat);
    const g = this.game;
    this._overlay(`
      <div class="cz-learn" style="--k:${c.color}">
        <p class="cz-learn-cat">${c.icon} ${c.name}</p>
        <h2>${esc(entry.word)}</h2>
        <p class="cz-learn-clue">“${esc(entry.clue)}”</p>
        <h4>${L('O que é', 'What it is')}</h4>
        <p>${esc(entry.explain)}</p>
        <div class="cz-analogy"><span>💡</span><p><b>${L('Analogia', 'Analogy')}:</b> ${esc(entry.analogy)}</p></div>
        <p class="cz-learn-count">${g ? L(`${g.solved.size} de ${g.grid.words.length} palavras`, `${g.solved.size} of ${g.grid.words.length} words`) : ''}</p>
        <div class="cz-actions"><button class="cta" data-w="ok">${L('Entendi', 'Got it')} ${icons.next}</button></div>
      </div>`, () => { this._closeOverlay(); after?.(); });
  }

  // Mini-quiz: 3 perguntas sobre as palavras da grade (explicação ou analogia sem a palavra).
  finish() {
    const g = this.game;
    const rand = rng(`${g.level.seed}-quiz-${g.wrongs}`);
    const entries = g.grid.words.map((p) => p.entry);
    const qs = shuffle(entries, rand).slice(0, 3).map((e, k) => ({
      e,
      text: mask(k % 2 ? e.analogy : e.explain, e),
      kind: k % 2 ? L('analogia', 'analogy') : L('explicação', 'explanation'),
      options: shuffle([e, ...shuffle(entries.filter((x) => x !== e), rand).slice(0, 2)], rand),
    }));
    let k = 0;
    let right = 0;
    const ask = () => {
      const q = qs[k];
      this._overlay(`
        <div class="cz-quiz">
          <p class="cz-learn-cat">${L('Mini-quiz', 'Mini-quiz')} · ${k + 1}/3</p>
          <h3>${L(`Qual palavra combina com esta ${q.kind}?`, `Which word matches this ${q.kind}?`)}</h3>
          <blockquote>${esc(q.text)}</blockquote>
          <div class="cz-opts">${q.options.map((o, j) => `<button data-w="opt" data-j="${j}">${esc(o.word)}</button>`).join('')}</div>
          <p class="cz-quiz-fb" aria-live="polite"></p>
          <div class="cz-actions"><button class="cta" data-w="go" hidden>${k < 2 ? L('Próxima', 'Next') : L('Ver resultado', 'See results')} ${icons.next}</button></div>
        </div>`, (w, el) => {
        if (w === 'opt') {
          const box = this.root.querySelector('.cz-quiz');
          if (box.dataset.done) return;
          box.dataset.done = '1';
          const pick = q.options[+el.dataset.j];
          const ok = pick === q.e;
          if (ok) right++;
          box.querySelectorAll('[data-j]').forEach((b) => {
            const o = q.options[+b.dataset.j];
            b.classList.toggle('right', o === q.e);
            b.classList.toggle('wrong', b === el && !ok);
            b.disabled = true;
          });
          box.querySelector('.cz-quiz-fb').textContent = ok ? L('Isso! Você lembrou.', 'Yes! You remembered.') : L(`Era ${q.e.word}. Agora você não esquece mais.`, `It was ${q.e.word}. Now it will stick.`);
          if (ok) this.api.audio.chime(784, 0.5); else this.api.audio.nope();
          box.querySelector('[data-w="go"]').hidden = false;
        }
        if (w === 'go') { k++; if (k < 3) ask(); else this.win(right); }
      });
    };
    if (entries.length < 3) { this.win(0); return; }
    ask();
  }

  win(quiz) {
    const g = this.game;
    const level = g.level;
    this.api.audio.arpeggio(5);
    const learnedList = g.grid.words.map((p) => p.entry.word);
    if (g.isFree) {
      this._overlay(`
        <h2>${WIN_TITLES[0]}</h2>
        <p class="cz-pts"><b>${g.grid.words.length}</b> ${L('palavras aprendidas', 'words learned')}</p>
        <p class="cz-words">${learnedList.map(esc).join(' · ')}</p>
        <p class="cz-tip"><b>${L('Quiz', 'Quiz')}:</b> ${quiz}/3 · ${L('Seus minutos aqui contam para Memória.', 'Your minutes here count toward Memory.')}</p>
        <div class="cz-actions">
          <button class="icon-btn" data-w="gloss" aria-label="${L('Glossário', 'Glossary')}">📖</button>
          <button class="cta" data-w="again">${icons.reset} ${L('Nova grade', 'New grid')}</button>
        </div>`, (w) => {
        if (w === 'gloss') this.api.go('glossario');
        if (w === 'again') this.route(`livre/${level.cat || 'todas'}`);
      });
      return;
    }
    const { points, stars } = scoreLevel(level, { wrongs: g.wrongs, quiz });
    const saved = this.api.progress.saveLevel(level.id, { points, stars, skill: level.skill });
    const total = this.api.progress.points();
    const rank = rankFor(total);
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    const sk = skillOf(level.skill);
    this._overlay(`
      <h2>${WIN_TITLES[Math.floor(Math.random() * WIN_TITLES.length)]}</h2>
      <div class="cz-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="--d:${k * 0.16}s">${icons.star}</i>`).join('')}</div>
      <p class="cz-pts"><b>+${fmt(points)}</b> pts</p>
      <ul>
        <li>${L(`${g.grid.words.length} palavras aprendidas`, `${g.grid.words.length} words learned`)}</li>
        <li>${L('Mini-quiz', 'Mini-quiz')}: ${quiz}/3 ${L('certas', 'right')}</li>
        <li>${L('Palavras que pediram outra tentativa', 'Words that needed another try')}: ${g.wrongs}</li>
        <li style="color:${sk.color}">${L('Treinou', 'Trained')}: ${level.focus}</li>
        ${saved.gained > 0 && saved.prev > 0 ? `<li>${L('Novo recorde', 'New record')}: +${fmt(saved.gained)} ${L('sobre a melhor marca', 'over your best')}</li>` : ''}
        ${saved.gained === 0 ? `<li>${L('Sua melhor marca continua', 'Your best is still')} ${fmt(saved.best)}</li>` : ''}
        ${g.helped ? `<li>${L('Com ajuda: lembre de cumprir sua boa ação 💜', 'With help: remember to do your good deed 💜')}</li>` : ''}
      </ul>
      <p class="cz-words">${learnedList.map(esc).join(' · ')}</p>
      <p class="cz-total">CRUZA: ${fmt(total)} pts · <b style="color:${rank.color}">${rank.name}</b></p>
      <div class="cz-actions">
        <button class="icon-btn" data-w="map" aria-label="${L('Mapa', 'Map')}">${icons.map}</button>
        <button class="icon-btn" data-w="gloss" aria-label="${L('Glossário', 'Glossary')}">📖</button>
        ${next ? `<button class="cta" data-w="next">${L('Próxima', 'Next')} ${icons.next}</button>` : `<button class="cta" data-w="map">${L('Concluído!', 'All done!')}</button>`}
      </div>`, (w) => {
      if (w === 'map') this.api.go('');
      if (w === 'gloss') this.api.go('glossario');
      if (w === 'next') this.api.go(`fase/${next.id}`);
    });
  }

  // Ajuda por uma boa ação: dica extra + primeira letra da palavra atual.
  async help() {
    const g = this.game;
    if (!g.helped) {
      const ok = await this.api.requestHelp({ level: g.level.id });
      if (!ok || this.game !== g) return;
      g.helped = true;
    }
    const i = this.wordIdx();
    if (g.solved.has(i)) { this.say(L('Esta já está certa. Escolha outra palavra e toque em Ajuda.', 'This one is already right. Pick another word and tap Help.')); return; }
    const p = g.grid.words[i];
    g.hinted.add(i);
    const [r, c] = cellsOf(p)[0];
    if (!this.locked(r, c)) { g.fill[r][c] = p.entry.answer[0]; this.check(r, c); }
    this.api.audio.chime(660, 0.4);
    this.say(L(`Dica extra liberada e primeira letra revelada: ${p.entry.answer[0]}`, `Extra hint unlocked and first letter revealed: ${p.entry.answer[0]}`));
    this.paint();
  }

  // ---------- Desenho ----------
  paint() {
    const g = this.game;
    if (!g) return;
    const i = this.wordIdx();
    const p = g.grid.words[i];
    const mine = new Set(cellsOf(p).map(([r, c]) => `${r},${c}`));
    for (const [k, el] of this.cellEls) {
      const [r, c] = k.split(',').map(Number);
      el.querySelector('span').textContent = g.fill[r][c];
      el.classList.toggle('in-word', mine.has(k));
      el.classList.toggle('cursor', g.cur[0] === r && g.cur[1] === c);
      el.classList.toggle('ok', this.locked(r, c));
    }
    const arrow = p.dir === 'a' ? '→' : '↓';
    const clue = this.root.querySelector('.cz-clue');
    clue.innerHTML = `<b>${p.num} ${arrow}</b><span>${esc(p.entry.clue)}${g.hinted.has(i) && p.entry.clue2 ? `<em>💡 ${esc(p.entry.clue2)}</em>` : ''}</span><small>${L(`${p.entry.answer.length} letras`, `${p.entry.answer.length} letters`)}</small>`;
    this.root.querySelector('.cz-hud-status').textContent = L(`Palavras ${g.solved.size}/${g.grid.words.length}`, `Words ${g.solved.size}/${g.grid.words.length}`);
    this.root.querySelectorAll('.cz-clues li').forEach((li) => {
      const k = +li.dataset.word;
      li.classList.toggle('cur', k === i);
      li.classList.toggle('done', g.solved.has(k));
    });
  }

  renderClues() {
    const g = this.game;
    for (const dir of ['a', 'd']) {
      this.root.querySelector(`.cz-clues ol[data-dir="${dir}"]`).innerHTML = g.grid.words
        .map((p, i) => (p.dir === dir ? `<li data-word="${i}"><b>${p.num}</b><span>${esc(p.entry.clue)}</span><button data-card aria-label="${L('Ver explicação', 'See explanation')}">💡</button></li>` : ''))
        .join('');
    }
    this.paint();
  }

  _closeOverlay() { this.root.querySelector('.cz-over')?.remove(); }

  _overlay(html, onAct) {
    this._closeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'cz-over';
    overlay.innerHTML = `<div class="cz-card cz-card">${html}</div>`;
    (this.root.querySelector('.cz-play') || this.root).appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    overlay.onclick = (e) => {
      const el = e.target.closest('[data-w]');
      if (!el) return;
      e.stopPropagation();
      this.api.audio.tick();
      onAct(el.dataset.w, el);
    };
  }
}
