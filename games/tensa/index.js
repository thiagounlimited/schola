// Tensa — estilingue de elástico + bilhar/golfe. Mapa de fases, HUD, Ajuda e vitória.
import { LEVELS, FREE } from './levels.js';
import { Board } from './engine.js';
import { findShot, grabCandidates } from './solver.js';
import { icons } from '../../js/icons.js';
import { SKILLS } from '../../js/catalog.js';
import { rankFor, fmt, MAX_POINTS } from '../../js/scoring.js';

const CSS_ID = 'tensa-css';
const WIN_TITLES = ['Na mosca!', 'Que tacada!', 'Precisão pura!', 'Encaçapou!'];
const skillOf = (id) => SKILLS.find((s) => s.id === id);

export default {
  id: 'tensa',
  title: 'TENSA',
  tagline: 'Estique o elástico, mire e encaçape. Bilhar e golfe movidos a tensão.',
  accent: '#FF4FD8',
  cover: new URL('./cover.webp', import.meta.url).href,
  skills: ['espacial', 'planejamento', 'atencao', 'memoria'],
  mount: (root, api) => new TensaApp(root, api),
};

// Pontos da fase: tudo dentro do par; cada tacada extra tira 20% (mínimo 35%).
function scoreLevel(level, strokes) {
  const extra = Math.max(0, strokes - level.par);
  const f = extra === 0 ? 1 : Math.max(0.35, 1 - 0.2 * extra);
  return { points: Math.round(level.points * f), stars: extra === 0 ? 3 : extra === 1 ? 2 : 1 };
}

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

  _records() { return this.api.progress.levels(); }
  _unlocked(i) { return i === 0 || Boolean(this._records()[LEVELS[i - 1].id]); }

  _stopPlay() {
    this.board?.destroy();
    this.board = null;
    clearInterval(this.freeTimer);
    clearTimeout(this.msgTimer);
  }

  // ---------- Mapa: só o que importa agora ----------
  showMap() {
    const rec = this._records();
    const pts = this.api.progress.points();
    const rank = rankFor(pts);
    const nextIdx = LEVELS.findIndex((_, i) => this._unlocked(i) && !rec[LEVELS[i].id]);
    const visibleUntil = nextIdx < 0 ? LEVELS.length : nextIdx + 2; // concluídas + próxima + 1 espiada
    const shown = LEVELS.slice(0, visibleUntil);
    const hidden = LEVELS.length - shown.length;

    const card = (l, i) => {
      const r = rec[l.id];
      const open = this._unlocked(i);
      const isNext = i === nextIdx;
      const sk = skillOf(l.skill);
      return `
        <button class="tz-level ${isNext ? 'next' : ''} ${open ? '' : 'locked'} ${r ? 'done' : ''}" data-lv="${l.id}" ${open ? '' : 'disabled'} style="--c:${sk.color}">
          <span class="tz-num">${open ? l.id : icons.lock}</span>
          <span class="tz-lv-main">
            <span class="tz-lv-top">${isNext ? '<em>Próxima fase</em>' : ''}<b>${l.name}</b></span>
            <span class="tz-focus">${icons.target}${l.focus}<i>· ${sk.name}</i></span>
            ${open ? `<span class="tz-goal">${l.goal}</span>` : ''}
          </span>
          <span class="tz-lv-pts">${r ? `<b>${fmt(r.points)}</b><small>de ${fmt(l.points)}</small>` : `<small>até</small><b>${fmt(l.points)}</b>`}</span>
        </button>`;
    };

    this.root.innerHTML = `
      <div class="tz-map">
        <header class="tz-top">
          <button class="icon-btn" data-act="home" aria-label="Voltar ao início">${icons.back}</button>
          <h1 class="tz-logo">TENSA</h1>
        </header>
        <section class="tz-score" style="--rc:${rank.color}">
          <div><span>Seus pontos no Tensa</span><b>${fmt(pts)}</b><small>de ${fmt(MAX_POINTS)}</small></div>
          <div class="tz-rank"><span>Faixa</span><b>${rank.name}</b><i><u style="width:${Math.max(3, rank.frac * 100)}%"></u></i></div>
        </section>
        <p class="tz-how">${icons.sparkle} Puxe o elástico para trás, mire e solte. Força demais faz a bola espirrar na borda do buraco.</p>
        <div class="tz-path">${shown.map((l) => card(l, LEVELS.indexOf(l))).join('')}</div>
        ${hidden > 0 ? `<p class="tz-more">${icons.lock} Mais ${hidden} fase${hidden > 1 ? 's' : ''} com desafios novos: desbloqueie avançando.</p>` : ''}
        <button class="tz-free" data-act="free">
          <span class="tz-free-ico">${icons.sparkle}</span>
          <span><b>Treino livre</b><small>Sem pontos: monte elásticos à vontade e brinque com as tabelas.</small></span>
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

  // ---------- Fase ----------
  play(level) {
    const isFree = level.mode === 'free';
    const sk = skillOf(level.skill);
    this.root.innerHTML = `
      <div class="tz-play">
        <header class="tz-hud">
          <button class="icon-btn" data-act="map" aria-label="Voltar ao mapa">${icons.back}</button>
          <div class="tz-hud-title">
            <span class="tz-hud-name">${isFree ? level.name : `${level.id} · ${level.name}`}</span>
            <span class="tz-hud-status" aria-live="polite"></span>
          </div>
          <div class="tz-hud-actions">
            ${isFree ? '' : `<button class="tz-help" data-act="help" aria-label="Ajuda">${icons.help}<span>Ajuda</span></button>`}
            <button class="icon-btn" data-act="restart" aria-label="Recomeçar">${icons.reset}</button>
          </div>
        </header>
        <div class="tz-focusbar" style="--c:${sk.color}">${icons.target}<span>Treina: <b>${level.focus}</b></span></div>
        <div class="tz-stage">
          <canvas class="tz-canvas" aria-label="Mesa do Tensa"></canvas>
          <div class="tz-msg" role="status"></div>
        </div>
      </div>`;
    const status = this.root.querySelector('.tz-hud-status');
    const msg = this.root.querySelector('.tz-msg');
    const say = (text, sticky) => {
      msg.textContent = text;
      msg.classList.add('show');
      clearTimeout(this.msgTimer);
      if (!sticky) this.msgTimer = setTimeout(() => msg.classList.remove('show'), 3600);
    };
    this.helped = false;

    this.board = new Board(this.root.querySelector('canvas'), level, {
      audio: this.api.audio,
      haptic: this.api.haptic,
      onMessage: say,
      onStatus: (s) => {
        const parts = [isFree ? `${s.strokes} tacada${s.strokes === 1 ? '' : 's'}` : `Tacadas ${s.strokes} · par ${s.par}`];
        if (s.bandsLeft != null && !isFree) parts.push(`${s.bandsLeft} elástico${s.bandsLeft === 1 ? '' : 's'} livre${s.bandsLeft === 1 ? '' : 's'}`);
        status.textContent = parts.join(' · ');
      },
      onWin: (r) => this._win(level, r),
    });
    say(level.goal);

    if (isFree) this.freeTimer = setInterval(() => this.api.progress.addFreeMinute(), 60000);

    this.root.onclick = async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act || !this.board) return;
      if (act === 'map') { this.api.audio.tick(); this.api.go(''); }
      if (act === 'restart') { this.board.restart(); say(level.goal); }
      if (act === 'help') this._help(level, say);
    };
  }

  async _help(level, say) {
    if (!this.helped) {
      const ok = await this.api.requestHelp({ level: level.id });
      if (!ok || !this.board) return;
      this.helped = true;
    }
    const board = this.board;
    if (level.holes.some((h) => h.m)) {
      board.enableHelp(null);
      say('Mira completa ligada: a trajetória já considera o movimento do alvo.');
      return;
    }
    if (!grabCandidates(board.world).length) {
      board.enableHelp(null);
      say('Mira completa ligada. Monte um elástico passando pela bola para ver a trajetória.');
      return;
    }
    say('Calculando a melhor tacada…', true);
    const best = await findShot(board.world, { angleStep: 2, pullStep: 0.009 });
    if (this.board !== board) return;
    board.enableHelp(best?.shot);
    say(best ? 'Siga o fantasma: puxe até o círculo e solte.' : 'Daqui não há tacada certa. Recomece a fase. A mira completa fica ligada.');
  }

  _win(level, r) {
    clearTimeout(this.msgTimer);
    this.root.querySelector('.tz-msg')?.classList.remove('show');
    if (level.mode === 'free') return;
    const { points, stars } = scoreLevel(level, r.strokes);
    const saved = this.api.progress.saveLevel(level.id, { points, stars, skill: level.skill });
    const total = this.api.progress.points();
    const rank = rankFor(total);
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    const sk = skillOf(level.skill);
    const overlay = document.createElement('div');
    overlay.className = 'tz-win';
    overlay.innerHTML = `
      <div class="tz-win-card">
        <h2>${WIN_TITLES[Math.floor(Math.random() * WIN_TITLES.length)]}</h2>
        <div class="tz-win-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="--d:${k * 0.16}s">${icons.star}</i>`).join('')}</div>
        <p class="tz-win-pts"><b>+${fmt(points)}</b> pts</p>
        <ul>
          <li>${r.strokes} tacada${r.strokes > 1 ? 's' : ''} · par ${level.par}</li>
          <li style="color:${sk.color}">Treinou: ${level.focus}</li>
          ${saved.gained > 0 && saved.prev > 0 ? `<li>Novo recorde: +${fmt(saved.gained)} sobre a melhor marca</li>` : ''}
          ${saved.gained === 0 ? `<li>Sua melhor marca continua ${fmt(saved.best)}</li>` : ''}
          ${r.helpUsed ? '<li>Com ajuda: lembre de cumprir sua boa ação 💜</li>' : ''}
        </ul>
        <p class="tz-win-total">Tensa: ${fmt(total)} pts · <b style="color:${rank.color}">${rank.name}</b></p>
        <div class="tz-win-actions">
          <button class="icon-btn" data-w="map" aria-label="Mapa">${icons.map}</button>
          <button class="icon-btn" data-w="again" aria-label="Jogar de novo">${icons.reset}</button>
          ${next ? `<button class="cta" data-w="next">Próxima ${icons.next}</button>` : '<button class="cta" data-w="map">Concluído!</button>'}
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
