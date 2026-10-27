// Shell do SCHOLA: abertura, hub de jogos, perfil de habilidades e ajustes.
// Cada sub-jogo é um módulo com { id, title, tagline, skills, mount(root, api) }.
import tensa from '../games/tensa/index.js';
import { SoundEngine } from './audio.js';
import { Progress } from './progress.js';
import { icons } from './icons.js';

const GAMES = [tensa];

export const SKILLS = [
  { id: 'espacial', name: 'Espacial', hint: 'formas e espaço', color: '#FF6B5E' },
  { id: 'planejamento', name: 'Planejamento', hint: 'pensar antes de agir', color: '#FFD23F' },
  { id: 'atencao', name: 'Atenção', hint: 'foco e antecipação', color: '#3EDBB0' },
  { id: 'memoria', name: 'Memória', hint: 'guardar e repetir', color: '#A78BFA' },
  { id: 'criatividade', name: 'Criatividade', hint: 'criar livremente', color: '#38BDF8' },
];

const COMING_SOON = [
  { title: 'Em breve', tagline: 'Um novo desafio de memória', hue: '#A78BFA' },
  { title: 'Em breve', tagline: 'Um novo desafio de lógica', hue: '#3EDBB0' },
];

const app = document.getElementById('app');
const progress = new Progress();
const audio = new SoundEngine();
audio.soundOn = progress.settings.sound;
audio.musicOn = progress.settings.music;

let started = false;
let current = null; // { id, inst, el }

const haptic = (ms = 10) => {
  if (progress.settings.haptics && navigator.vibrate) navigator.vibrate(ms);
};

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

function show(el) {
  app.querySelectorAll('.screen').forEach((s) => s !== el && s.remove());
  if (!el.isConnected) app.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
}

// ---------- Abertura ----------
function splash() {
  const el = h(`
    <section class="screen splash" aria-label="Abertura">
      <div class="splash-emblem"><img src="brand/schola-emblem.png" alt=""></div>
      <img class="splash-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <p class="splash-sub">Brinque com a mente. Estique o pensamento.</p>
      <button class="cta pulse" type="button">Toque para começar</button>
    </section>`);
  const start = () => {
    audio.init();
    audio.arpeggio(5);
    haptic(15);
    started = true;
    el.classList.add('out');
    setTimeout(route, 420);
  };
  el.addEventListener('click', start, { once: true });
  show(el);
}

// ---------- Hub ----------
function stars(game) {
  const got = Object.values(progress.game(game.id).stars).reduce((a, b) => a + b, 0);
  return { got, total: game.totalStars };
}

function hub() {
  unmountGame();
  const first = Object.keys(progress.data.xp).length === 0;
  const el = h(`
    <section class="screen hub">
      <header class="hub-top">
        <img class="hub-word" src="brand/schola-wordmark.png" alt="SCHOLA">
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${icons.gear}</button>
      </header>
      <p class="hub-hello">${first ? 'Olá! Pronto para esticar a mente?' : 'Que bom te ver de novo. Respira… e bora brincar.'}</p>

      <h2 class="sec-title">Sua mente</h2>
      <div class="skills">
        ${SKILLS.map((s) => {
          const k = progress.skill(s.id);
          return `
          <div class="skill" style="--c:${s.color}">
            <div class="skill-head"><span class="skill-name">${s.name}</span><span class="skill-lv">Nv ${k.level}</span></div>
            <div class="skill-bar"><i style="width:${Math.max(4, k.frac * 100)}%"></i></div>
            <span class="skill-hint">${s.hint}</span>
          </div>`;
        }).join('')}
      </div>

      <h2 class="sec-title">Jogos</h2>
      <div class="games">
        ${GAMES.map((g) => {
          const st = stars(g);
          return `
          <button class="game-card" data-game="${g.id}" style="--accent:${g.accent}">
            <div class="game-art">${g.art}</div>
            <div class="game-info">
              <span class="game-title">${g.title}</span>
              <span class="game-tag">${g.tagline}</span>
              <span class="game-stars">${icons.star}<b>${st.got}</b>/${st.total}</span>
            </div>
            <span class="game-play">${icons.play}</span>
          </button>`;
        }).join('')}
        ${COMING_SOON.map((c) => `
          <div class="game-card soon" style="--accent:${c.hue}" aria-disabled="true">
            <div class="game-art soon-art">${icons.lock}</div>
            <div class="game-info">
              <span class="game-title">${c.title}</span>
              <span class="game-tag">${c.tagline}</span>
            </div>
          </div>`).join('')}
      </div>
      <footer class="hub-foot">SCHOLA · desenvolvimento cognitivo pelo brincar</footer>
    </section>`);

  el.addEventListener('click', (e) => {
    const card = e.target.closest('[data-game]');
    if (card) { audio.tick(); haptic(8); location.hash = `#/${card.dataset.game}`; return; }
    if (e.target.closest('[data-act="settings"]')) { audio.tick(); settings(); }
  });
  show(el);
}

// ---------- Ajustes ----------
function settings() {
  const s = progress.settings;
  const row = (key, icon, label) => `
    <label class="set-row">
      <span class="set-ico">${icon}</span><span class="set-label">${label}</span>
      <input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''}><span class="switch"></span>
    </label>`;
  const el = h(`
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="Ajustes">
      <div class="sheet">
        <header class="sheet-head"><h2>Ajustes</h2><button class="icon-btn" data-act="close" aria-label="Fechar">${icons.close}</button></header>
        ${row('sound', icons.sound, 'Sons')}
        ${row('music', icons.music, 'Música ambiente')}
        ${row('haptics', icons.vibrate, 'Vibração')}
        <button class="danger" data-act="reset">Apagar progresso</button>
      </div>
    </div>`);
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    progress.setSetting(k, e.target.checked);
    if (k === 'sound') audio.setSound(e.target.checked);
    if (k === 'music') audio.setMusic(e.target.checked);
    audio.tick();
  });
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-act="close"]')) close();
    if (e.target.closest('[data-act="reset"]') && confirm('Apagar todas as estrelas e o progresso das habilidades?')) {
      progress.reset();
      close();
      hub();
    }
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
}

// ---------- Jogos ----------
function unmountGame() {
  if (!current) return;
  current.inst.destroy?.();
  current = null;
}

function openGame(game, sub) {
  if (!current || current.id !== game.id) {
    unmountGame();
    const el = h(`<section class="screen game-screen" data-game="${game.id}"></section>`);
    const api = {
      audio,
      haptic,
      go: (path) => { location.hash = `#/${game.id}${path ? '/' + path : ''}`; },
      home: () => { location.hash = ''; },
      progress: {
        stars: () => progress.game(game.id).stars,
        saveLevel: (levelId, n, skills) => progress.saveLevel(game.id, levelId, n, skills),
        addXP: (skill, n) => progress.addXP(skill, n),
      },
    };
    show(el);
    current = { id: game.id, el, inst: game.mount(el, api) };
  }
  current.inst.route(sub);
}

function route() {
  if (!started) return;
  const [, id, ...rest] = location.hash.replace(/^#/, '').split('/');
  const game = GAMES.find((g) => g.id === id);
  if (game) openGame(game, rest.join('/'));
  else hub();
}

window.addEventListener('hashchange', route);
// Evita o menu de contexto e o zoom por toque duplo durante o jogo.
document.addEventListener('contextmenu', (e) => e.target.closest('canvas') && e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

splash();
