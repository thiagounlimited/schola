// Tensa — sub-jogo de elásticos. Mapa de fases, HUD, vitória e Ateliê livre.
import { LEVELS, WORLDS, FREE } from './levels.js';
import { Board } from './engine.js';
import { icons } from '../../js/icons.js';

const CSS_ID = 'tensa-css';
const WIN_TITLES = ['Harmonia!', 'Que leveza!', 'Lindo!', 'Fluiu!', 'Em sintonia!'];

const ART = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="tz-pin" cx="35%" cy="30%"><stop offset="0" stop-color="#7a72ff"/><stop offset="1" stop-color="#1a1550"/></radialGradient>
    <radialGradient id="tz-seed"><stop offset="0" stop-color="#FFD23F" stop-opacity=".7"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
  </defs>
  <path d="M50 18 L82 72 L18 72 Z" fill="rgba(255,107,94,.18)"/>
  <circle cx="50" cy="54" r="15" fill="url(#tz-seed)"/>
  ${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="${50 + Math.cos((a * Math.PI) / 180) * 6}" cy="${54 + Math.sin((a * Math.PI) / 180) * 6}" rx="5" ry="2.8" transform="rotate(${a} ${50 + Math.cos((a * Math.PI) / 180) * 6} ${54 + Math.sin((a * Math.PI) / 180) * 6})" fill="#FFD23F"/>`).join('')}
  <circle cx="50" cy="54" r="3.4" fill="#FFF8E8"/>
  <path d="M50 18 L82 72 L18 72 Z" fill="none" stroke="#FF6B5E" stroke-width="7" stroke-opacity=".25" stroke-linejoin="round"/>
  <path d="M50 18 L82 72 Q50 80 18 72 Z" fill="none" stroke="#FF6B5E" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 34 L40 88" stroke="#3EDBB0" stroke-width="3" stroke-linecap="round"/>
  ${[[50, 18], [82, 72], [18, 72], [18, 34], [40, 88], [84, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.2" fill="url(#tz-pin)" stroke="rgba(255,255,255,.3)"/>`).join('')}
</svg>`;

export default {
  id: 'tensa',
  title: 'Tensa',
  tagline: 'Estique, prenda, ouça.',
  accent: '#FF6B5E',
  art: ART,
  totalStars: LEVELS.length * 3,
  mount: (root, api) => new TensaApp(root, api),
};

class TensaApp {
  constructor(root, api) {
    this.root = root;
    this.api = api;
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement('link');
      link.id = CSS_ID;
      link.rel = 'stylesheet';
      link.href = new URL('./tensa.css', import.meta.url).href;
      document.head.appendChild(link);
    }
  }

  route(path) {
    this._stopPlay();
    if (path === 'livre') return this.play(FREE);
    const m = /^fase\/(.+)$/.exec(path || '');
    const lv = m && LEVELS.find((l) => l.id === m[1]);
    if (lv && this._unlocked(LEVELS.indexOf(lv))) return this.play(lv);
    this.showMap();
  }

  destroy() { this._stopPlay(); }

  _stars() { return this.api.progress.stars(); }
  _unlocked(i) { return i === 0 || (this._stars()[LEVELS[i - 1].id] || 0) > 0; }

  _stopPlay() {
    this.board?.destroy();
    this.board = null;
    clearInterval(this.freeTimer);
    clearTimeout(this.msgTimer);
  }

  // ---------- Mapa ----------
  showMap() {
    const stars = this._stars();
    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    const starRow = (n) => `<span class="lv-stars">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">${icons.star}</i>`).join('')}</span>`;
    this.root.innerHTML = `
      <div class="tz-map">
        <header class="tz-top">
          <button class="icon-btn" data-act="home" aria-label="Voltar ao início">${icons.back}</button>
          <h1 class="tz-logo">TENSA</h1>
          <span class="tz-total">${icons.star}<b>${total}</b>/${LEVELS.length * 3}</span>
        </header>
        <p class="tz-intro">Estique elásticos entre os pinos, envolva as sementes e deixe tudo florescer. Cada elástico é uma corda: toque e ouça.</p>
        ${WORLDS.map((w, wi) => `
          <section class="tz-world" style="--wc:${['#FF6B5E', '#FFD23F', '#3EDBB0', '#A78BFA'][wi]}">
            <div class="tz-world-head">
              <h2>${w.name}</h2>
              <p>${w.blurb}</p>
            </div>
            <div class="tz-levels">
              ${LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.world === wi).map(({ l, i }) => {
                const open = this._unlocked(i);
                const n = stars[l.id] || 0;
                return `
                <button class="lv ${open ? '' : 'locked'} ${n ? 'done' : ''}" data-lv="${l.id}" ${open ? '' : 'disabled'} aria-label="Fase ${l.id}: ${l.name}">
                  <span class="lv-num">${open ? l.id : icons.lock}</span>
                  <span class="lv-name">${l.name}</span>
                  ${open ? starRow(n) : ''}
                </button>`;
              }).join('')}
            </div>
          </section>`).join('')}
        <button class="tz-free" data-act="free">
          <span class="tz-free-ico">${icons.sparkle}</span>
          <span><b>Ateliê livre</b><small>Sem regras: um instrumento de elásticos para criar e relaxar.</small></span>
          <span class="tz-free-go">${icons.play}</span>
        </button>
      </div>`;
    this.root.onclick = (e) => {
      const lv = e.target.closest('[data-lv]');
      if (lv && !lv.disabled) { this.api.audio.tick(); this.api.go(`fase/${lv.dataset.lv}`); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'home') { this.api.audio.tick(); this.api.home(); }
      if (act === 'free') { this.api.audio.tick(); this.api.go('livre'); }
    };
  }

  // ---------- Jogo ----------
  play(level) {
    const isFree = level.mode === 'free';
    const isEcho = level.mode === 'echo';
    this.root.innerHTML = `
      <div class="tz-play">
        <header class="tz-hud">
          <button class="icon-btn" data-act="map" aria-label="Voltar ao mapa">${icons.back}</button>
          <div class="tz-hud-title">
            <span class="tz-hud-name">${isFree ? level.name : `${level.id} · ${level.name}`}</span>
            <span class="tz-hud-status" aria-live="polite"></span>
          </div>
          <div class="tz-hud-actions">
            ${level.mode ? '' : `<button class="icon-btn" data-act="hint" aria-label="Dica">${icons.bulb}</button>`}
            ${isEcho ? '' : `<button class="icon-btn" data-act="undo" aria-label="Desfazer">${icons.undo}</button>
            <button class="icon-btn" data-act="clear" aria-label="Recomeçar">${icons.reset}</button>`}
          </div>
        </header>
        <div class="tz-stage">
          <canvas class="tz-canvas" aria-label="Tabuleiro de elásticos"></canvas>
          <div class="tz-msg" role="status"></div>
        </div>
        <p class="tz-foot">${isEcho ? 'Toque nas cordas para tocar.' : 'Toque duas vezes num elástico para tirá-lo.'}</p>
      </div>`;
    const status = this.root.querySelector('.tz-hud-status');
    const msg = this.root.querySelector('.tz-msg');
    const say = (text, sticky) => {
      msg.textContent = text;
      msg.classList.add('show');
      clearTimeout(this.msgTimer);
      if (!sticky) this.msgTimer = setTimeout(() => msg.classList.remove('show'), 3200);
    };

    this.board = new Board(this.root.querySelector('canvas'), level, {
      audio: this.api.audio,
      haptic: this.api.haptic,
      onMessage: say,
      onStatus: (s) => {
        if (s.flash) { status.classList.remove('flash'); void status.offsetWidth; status.classList.add('flash'); return; }
        if (s.echo) { status.textContent = `Rodada ${s.echo.round}/${s.echo.total} · ${s.echo.step}/${s.echo.len}`; return; }
        if (s.bands != null) status.textContent = s.max ? `Elásticos ${s.bands}/${s.max}` : `${s.bands} elástico${s.bands === 1 ? '' : 's'}`;
      },
      onWin: (r) => this._win(level, r),
    });
    if (level.tip && !level.tutorial) say(level.tip);

    if (isFree) this.freeTimer = setInterval(() => this.api.progress.addXP('criatividade', 1), 60000);

    this.root.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act || !this.board) return;
      if (act === 'map') { this.api.audio.tick(); this.api.go(''); }
      if (act === 'undo') this.board.undo();
      if (act === 'clear') this.board.clear();
      if (act === 'hint' && this.board.showHint()) say('Siga o contorno pontilhado.');
    };
  }

  _win(level, r) {
    clearTimeout(this.msgTimer);
    this.root.querySelector('.tz-msg')?.classList.remove('show');
    let stars;
    const notes = [];
    if (level.mode === 'echo') {
      stars = r.mistakes === 0 ? 3 : r.mistakes <= 2 ? 2 : 1;
      notes.push(r.mistakes === 0 ? 'Melodias perfeitas, sem nenhum erro' : `${r.mistakes} tropeço${r.mistakes > 1 ? 's' : ''} no caminho`);
    } else {
      const par = level.solution.length;
      const lean = r.bands <= par;
      stars = 1 + (lean ? 1 : 0) + (r.hintUsed ? 0 : 1);
      notes.push(lean ? `Com ${r.bands} elástico${r.bands > 1 ? 's' : ''}, na medida certa` : `Dá para fazer com ${par} elástico${par > 1 ? 's' : ''}`);
      notes.push(r.hintUsed ? 'Usou dica' : 'Sem dicas');
    }
    const skills = WORLDS[level.world].skills;
    const { prev } = this.api.progress.saveLevel(level.id, stars, skills);
    const idx = LEVELS.indexOf(level);
    const next = LEVELS[idx + 1];
    const title = WIN_TITLES[Math.floor(Math.random() * WIN_TITLES.length)];
    const overlay = document.createElement('div');
    overlay.className = 'tz-win';
    overlay.innerHTML = `
      <div class="tz-win-card">
        <h2>${title}</h2>
        <div class="tz-win-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="--d:${k * 0.18}s">${icons.star}</i>`).join('')}</div>
        <ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        ${stars > prev ? `<p class="tz-win-xp">+${stars - prev} em ${skills.map((s) => ({ espacial: 'Espacial', planejamento: 'Planejamento', atencao: 'Atenção', memoria: 'Memória' })[s]).join(' e ')}</p>` : ''}
        <div class="tz-win-actions">
          <button class="icon-btn" data-w="map" aria-label="Mapa">${icons.map}</button>
          <button class="icon-btn" data-w="again" aria-label="Jogar de novo">${icons.reset}</button>
          ${next ? `<button class="cta" data-w="next">Próxima ${icons.next}</button>` : `<button class="cta" data-w="map">Concluído!</button>`}
        </div>
      </div>`;
    this.root.querySelector('.tz-play').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    overlay.onclick = (e) => {
      const w = e.target.closest('[data-w]')?.dataset.w;
      if (!w) return;
      e.stopPropagation();
      this.api.audio.tick();
      if (w === 'map') this.api.go('');
      if (w === 'again') this.route(`fase/${level.id}`);
      if (w === 'next') this.api.go(`fase/${next.id}`);
    };
  }
}
