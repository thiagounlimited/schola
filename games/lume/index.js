// Lume: atenção, economia cognitiva, monotasking e resíduo de atenção.
// Mapa de fases, HUD, Ajuda e telas de vitória e de "quase".
import { LEVELS, FREE } from './levels.js';
import { Board } from './engine.js';
import { icons } from '../../js/icons.js';
import { SKILLS } from '../../js/catalog.js';
import { rankFor, fmt, MAX_POINTS } from '../../js/scoring.js';
import { L } from '../../js/i18n.js';

const CSS_ID = 'lume-css';
const WIN_TITLES = L(['Luz inteira!', 'Foco limpo!', 'Uma coisa de cada vez!', 'Que presença!'], ['Fully lit!', 'Clean focus!', 'One thing at a time!', 'Such presence!']);
const skillOf = (id) => SKILLS.find((s) => s.id === id);

export default {
  id: 'lume',
  title: 'LUME',
  tagline: L('Uma luz de foco, muitas chamas. Feche uma de cada vez e não deixe fios soltos.', 'One beam of focus, many flames. Close them one at a time and leave no loose threads.'),
  levels: LEVELS,
  free: { name: FREE.name, skill: FREE.skill, focus: FREE.focus, path: 'respiro' },
  accent: '#FFB547',
  cover: new URL('./cover.webp', import.meta.url).href,
  skills: ['atencao', 'planejamento', 'memoria'],
  mount: (root, api) => new LumeApp(root, api),
};

// Pontos da fase: 60% por concluir, até 25% pela calma (interrupções além do par custam
// 25% cada) e até 15% pelo tempo em Fluxo. Bolhas tocadas somam seus pontinhos.
export function scoreLevel(level, r) {
  const extra = Math.max(0, r.interruptions - level.par);
  const calm = Math.max(0, 1 - 0.25 * extra);
  const base = level.points * (0.6 + 0.25 * calm + 0.15 * Math.min(1, r.flowShare));
  const points = Math.min(level.points, Math.round(base / 100) * 100 + r.baitPts);
  const stars = extra === 0 ? 3 : extra <= 2 ? 2 : 1;
  return { points, stars, calmCost: Math.round(level.points * 0.25 * (1 - calm)) };
}

class LumeApp {
  constructor(root, api) {
    this.root = root;
    this.api = api;
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement('link');
      link.id = CSS_ID;
      link.rel = 'stylesheet';
      link.href = new URL('./lume.css', import.meta.url).href;
      document.head.appendChild(link);
    }
  }

  route(path) {
    this._stopPlay();
    if (path === 'respiro') return this.play(FREE);
    const m = /^fase\/(.+)$/.exec(path || '');
    const lv = m && LEVELS.find((l) => l.id === m[1]);
    if (lv && this._unlocked(LEVELS.indexOf(lv))) return this.play(lv);
    this.showMap();
  }

  destroy() { this._stopPlay(); }

  _records() { return this.api.progress.levels(); }
  _unlocked(i) { return i === 0 || Boolean(this._records()[LEVELS[i - 1].id]); }

  _stopPlay() {
    this.board?.destroy();
    this.board = null;
    clearTimeout(this.msgTimer);
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

    const card = (l, i) => {
      const r = rec[l.id];
      const open = this._unlocked(i);
      const isNext = i === nextIdx;
      const sk = skillOf(l.skill);
      return `
        <button class="lm-level ${isNext ? 'next' : ''} ${open ? '' : 'locked'} ${r ? 'done' : ''}" data-lv="${l.id}" ${open ? '' : 'disabled'} style="--c:${sk.color}">
          <span class="lm-num">${open ? l.id : icons.lock}</span>
          <span class="lm-lv-main">
            <span class="lm-lv-top">${isNext ? `<em>${L('Próxima fase', 'Next level')}</em>` : ''}<b>${l.name}</b></span>
            <span class="lm-focus">${icons.target}${l.focus}<i>· ${sk.name}</i></span>
            ${open ? `<span class="lm-goal">${l.goal}</span>` : ''}
          </span>
          <span class="lm-lv-pts">${r ? `<b>${fmt(r.points)}</b><small>${L('de', 'of')} ${fmt(l.points)}</small>` : `<small>${L('até', 'up to')}</small><b>${fmt(l.points)}</b>`}</span>
        </button>`;
    };

    this.root.innerHTML = `
      <div class="lm-map">
        <header class="lm-top">
          <button class="icon-btn" data-act="home" aria-label="${L('Voltar ao início', 'Back to home')}">${icons.back}</button>
          <h1 class="lm-logo">LUME</h1>
        </header>
        <section class="lm-score" style="--rc:${rank.color}">
          <div><span>${L('Seus pontos no Lume', 'Your Lume points')}</span><b>${fmt(pts)}</b><small>${L('de', 'of')} ${fmt(MAX_POINTS)}</small></div>
          <div class="lm-rank"><span>${L('Faixa', 'Rank')}</span><b>${rank.name}</b><i><u style="width:${Math.max(3, rank.frac * 100)}%"></u></i></div>
        </section>
        <p class="lm-how">${icons.sparkle}<span>${L('Segure o dedo sobre uma chama até ela se acender. Trocar de chama no meio deixa um <b>fio</b> que deixa sua luz mais lenta. Bolhas são distrações.', 'Hold your finger on a flame until it lights up. Switching flames halfway leaves a <b>thread</b> that slows your light. Bubbles are distractions.')}</span></p>
        <div class="lm-path">${shown.map((l) => card(l, LEVELS.indexOf(l))).join('')}</div>
        ${hidden > 0 ? `<p class="lm-more">${icons.lock} ${L(`Mais ${hidden} fase${hidden > 1 ? 's' : ''} com desafios novos: desbloqueie avançando.`, `${hidden} more level${hidden > 1 ? 's' : ''} with new challenges: unlock them as you go.`)}</p>` : ''}
        <button class="lm-free" data-act="free">
          <span class="lm-free-ico">${icons.heart}</span>
          <span><b>${FREE.name}</b><small>${L('Sem pontos: acompanhe uma chama que respira. Cada minuto de foco conta para Atenção.', 'No points: follow a breathing flame. Every minute of focus counts toward Attention.')}</small></span>
          <span class="lm-free-go">${icons.play}</span>
        </button>
      </div>`;
    this.root.onclick = (e) => {
      const lv = e.target.closest('[data-lv]');
      if (lv && !lv.disabled) { this.api.audio.tick(); this.api.go(`fase/${lv.dataset.lv}`); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'home') { this.api.audio.tick(); this.api.home(); }
      if (act === 'free') { this.api.audio.tick(); this.api.go('respiro'); }
    };
  }

  // ---------- Fase ----------
  play(level) {
    const isFree = level.mode === 'free';
    const sk = skillOf(level.skill);
    this.root.innerHTML = `
      <div class="lm-play">
        <header class="lm-hud">
          <button class="icon-btn" data-act="map" aria-label="${L('Voltar ao mapa', 'Back to map')}">${icons.back}</button>
          <div class="lm-hud-title">
            <span class="lm-hud-name">${isFree ? level.name : `${level.id} · ${level.name}`}</span>
            <span class="lm-hud-status" aria-live="polite"></span>
          </div>
          <div class="lm-hud-actions">
            ${isFree ? '' : `<button class="lm-help" data-act="help" aria-label="${L('Ajuda', 'Help')}">${icons.help}<span>${L('Ajuda', 'Help')}</span></button>`}
            <button class="icon-btn" data-act="restart" aria-label="${L('Recomeçar', 'Restart')}">${icons.reset}</button>
          </div>
        </header>
        <div class="lm-focusbar" style="--c:${sk.color}">${icons.target}<span>${L('Treina', 'Trains')}: <b>${level.focus}</b></span></div>
        <div class="lm-stage">
          <canvas class="lm-canvas" aria-label="${L('Palco do Lume', 'Lume stage')}"></canvas>
          <div class="lm-msg" role="status"></div>
        </div>
      </div>`;
    const status = this.root.querySelector('.lm-hud-status');
    const msg = this.root.querySelector('.lm-msg');
    const say = (text, sticky) => {
      msg.textContent = text;
      msg.classList.add('show');
      clearTimeout(this.msgTimer);
      if (!sticky) this.msgTimer = setTimeout(() => msg.classList.remove('show'), 4200);
    };
    this.helped = false;

    this.board = new Board(this.root.querySelector('canvas'), level, {
      audio: this.api.audio,
      haptic: this.api.haptic,
      onMessage: say,
      onStatus: (s) => {
        if (isFree) { status.textContent = `${L('Foco', 'Focus')}: ${Math.floor(s.seconds / 60)} min ${String(s.seconds % 60).padStart(2, '0')} s`; return; }
        const goal = s.goalLux ? `${L('Brilho', 'Glow')} ${s.lux}/${s.goalLux}` : `${L('Chamas', 'Flames')} ${s.done}/${s.total}`;
        status.textContent = `${goal} · ${L('Interrupções', 'Interruptions')} ${s.interruptions}`;
      },
      onFocusMinute: () => this.api.progress.addFreeMinute('atencao'),
      onWin: (r) => this._win(level, r),
      onLose: (reason) => this._lose(level, reason),
    });
    say(level.goal);
    if (new URLSearchParams(location.search).has('local')) window.__lume = this.board; // testes locais

    this.root.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act || !this.board) return;
      if (act === 'map') { this.api.audio.tick(); this.api.go(''); }
      if (act === 'restart') { this._closeOverlay(); this.board.restart(); say(level.goal); }
      if (act === 'help') this._help(level, say);
    };
  }

  async _help(level, say) {
    if (!this.helped) {
      const board = this.board;
      board.pause(true);
      const ok = await this.api.requestHelp({ level: level.id });
      board.pause(false);
      if (!ok || this.board !== board) return;
      this.helped = true;
    }
    this.board.enableHelp();
    const hints = [L('O anel tracejado mostra a chama certa agora.', 'The dashed ring shows the right flame right now.')];
    if (level.bubbles) hints.push(L('Bolhas riscadas são ruído.', 'Crossed-out bubbles are noise.'));
    if (level.park) hints.push(L('Antes de atender um sinal, levante o dedo e toque na âncora ⚓.', 'Before answering a signal, lift your finger and tap the anchor ⚓.'));
    if (level.hidden) hints.push(L('Fios e progresso agora aparecem.', 'Threads and progress are now visible.'));
    say(hints.join(' '));
  }

  _closeOverlay() { this.root.querySelector('.lm-over')?.remove(); }

  _overlay(html, onAct) {
    this._closeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'lm-over';
    overlay.innerHTML = `<div class="lm-card">${html}</div>`;
    this.root.querySelector('.lm-play').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    overlay.onclick = (e) => {
      const w = e.target.closest('[data-w]')?.dataset.w;
      if (!w) return;
      e.stopPropagation();
      this.api.audio.tick();
      onAct(w);
    };
  }

  _win(level, r) {
    clearTimeout(this.msgTimer);
    this.root.querySelector('.lm-msg')?.classList.remove('show');
    if (level.mode === 'free') return;
    const { points, stars, calmCost } = scoreLevel(level, r);
    const saved = this.api.progress.saveLevel(level.id, { points, stars, skill: level.skill });
    const total = this.api.progress.points();
    const rank = rankFor(total);
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    const sk = skillOf(level.skill);
    const pct = (v) => `${Math.round(v * 100)}%`;
    const lines = [
      level.goalLux ? L(`Brilho ${r.lux} de ${level.goalLux}`, `Glow ${r.lux} of ${level.goalLux}`) : L(`${r.done} chama${r.done > 1 ? 's' : ''} fechada${r.done > 1 ? 's' : ''}`, `${r.done} flame${r.done > 1 ? 's' : ''} closed`),
      L(`Interrupções: ${r.interruptions}${level.par ? ` (aceitas: ${level.par})` : ''}${r.residue ? ` · fios deixados: ${r.residue}` : ''}`, `Interruptions: ${r.interruptions}${level.par ? ` (allowed: ${level.par})` : ''}${r.residue ? ` · threads left: ${r.residue}` : ''}`),
      r.bubbles ? L(`Distrações resistidas: ${r.resisted} de ${r.resisted + r.bait}`, `Distractions resisted: ${r.resisted} of ${r.resisted + r.bait}`) : '',
      r.bait ? L(`Bolhas tocadas: +${fmt(r.baitPts)} pts, mas as interrupções custaram −${fmt(calmCost)}`, `Bubbles tapped: +${fmt(r.baitPts)} pts, but the interruptions cost −${fmt(calmCost)}`) : '',
      r.parked ? L(`Estacionou ${r.parked} vez${r.parked > 1 ? 'es' : ''}: zero resíduo`, `Parked ${r.parked} time${r.parked > 1 ? 's' : ''}: zero residue`) : '',
      `${L('Tempo em Fluxo', 'Time in Flow')}: ${pct(r.flowShare)}`,
    ].filter(Boolean);
    this._overlay(`
      <h2>${WIN_TITLES[Math.floor(Math.random() * WIN_TITLES.length)]}</h2>
      <div class="lm-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="--d:${k * 0.16}s">${icons.star}</i>`).join('')}</div>
      <p class="lm-pts"><b>+${fmt(points)}</b> pts</p>
      <ul>
        ${lines.map((l) => `<li>${l}</li>`).join('')}
        <li style="color:${sk.color}">${L('Treinou', 'Trained')}: ${level.focus}</li>
        ${saved.gained > 0 && saved.prev > 0 ? `<li>${L('Novo recorde', 'New record')}: +${fmt(saved.gained)} ${L('sobre a melhor marca', 'over your best')}</li>` : ''}
        ${saved.gained === 0 ? `<li>${L('Sua melhor marca continua', 'Your best is still')} ${fmt(saved.best)}</li>` : ''}
        ${r.helpUsed ? `<li>${L('Com ajuda: lembre de cumprir sua boa ação 💜', 'With help: remember to do your good deed 💜')}</li>` : ''}
      </ul>
      <p class="lm-tip"><b>${L('Para a vida', 'For real life')}:</b> ${level.tip}</p>
      <p class="lm-total">Lume: ${fmt(total)} pts · <b style="color:${rank.color}">${rank.name}</b></p>
      <div class="lm-actions">
        <button class="icon-btn" data-w="map" aria-label="${L('Mapa', 'Map')}">${icons.map}</button>
        <button class="icon-btn" data-w="again" aria-label="${L('Jogar de novo', 'Play again')}">${icons.reset}</button>
        ${next ? `<button class="cta" data-w="next">${L('Próxima', 'Next')} ${icons.next}</button>` : `<button class="cta" data-w="map">${L('Concluído!', 'All done!')}</button>`}
      </div>`, (w) => {
      if (w === 'map') this.api.go('');
      if (w === 'again') this.route(`fase/${level.id}`);
      if (w === 'next') this.api.go(`fase/${next.id}`);
    });
  }

  _lose(level, reason) {
    clearTimeout(this.msgTimer);
    this.root.querySelector('.lm-msg')?.classList.remove('show');
    this._overlay(`
      <h2>${L('Quase!', 'Almost!')}</h2>
      <p class="lm-reason">${reason}</p>
      <p class="lm-tip"><b>${L('Dica', 'Tip')}:</b> ${level.goal}</p>
      <div class="lm-actions">
        <button class="icon-btn" data-w="map" aria-label="${L('Mapa', 'Map')}">${icons.map}</button>
        <button class="cta" data-w="again">${icons.reset} ${L('Tentar de novo', 'Try again')}</button>
      </div>`, (w) => {
      if (w === 'map') this.api.go('');
      if (w === 'again') this.route(`fase/${level.id}`);
    });
  }
}
