// Shell do SCHOLA: cadastro/entrada com avatar-órgão, hub (pontos, trilhas, jogos,
// Boas Ações Cognitivas), página de cada trilha e o sistema de Ajuda compartilhado.
// Carregado por main.js depois da escolha de idioma.
// Cada sub-jogo é um módulo com { id, title, tagline, accent, cover, skills, levels, free, mount(root, api) }.
import tensa from '../games/tensa/index.js';
import lume from '../games/lume/index.js';
import { Store } from './store.js';
import { icons } from './icons.js';
import { SKILLS, AVATARS, DEEDS, BADGES, avatarById, deedById, skillById } from './catalog.js';
import { RANKS, MAX_POINTS, rankFor, fmt } from './scoring.js';
import { L, lang, setLang, locale } from './i18n.js';

const GAMES = [tensa, lume];
const COMING_SOON = [
  { title: L('Em breve', 'Coming soon'), tagline: L('Um desafio de memória de trabalho', 'A working-memory challenge'), color: '#A78BFA' },
  { title: L('Em breve', 'Coming soon'), tagline: L('Um desafio de lógica e padrões', 'A logic and patterns challenge'), color: '#3EDBB0' },
];

const app = document.getElementById('app');
const store = new Store();
let audio = null;
let started = false;
let current = null; // jogo montado: { id, inst, el }

const haptic = (ms = 10) => {
  if (store.settings.haptics && navigator.vibrate) navigator.vibrate(ms);
};

// Conteúdo vindo de outros jogadores sempre passa por aqui antes de virar HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

function show(el) {
  app.querySelectorAll('.screen').forEach((s) => s !== el && s.remove());
  if (!el.isConnected) app.appendChild(el);
  app.scrollTop = 0;
  requestAnimationFrame(() => el.classList.add('in'));
}

function sheet(inner, { label = '', wide = false } = {}) {
  const el = h(`
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet ${wide ? 'wide' : ''}">${inner}</div>
    </div>`);
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) { audio.tick(); close(); }
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return { el, close };
}

function toast(msg) {
  const el = h(`<div class="toast" role="status">${esc(msg)}</div>`);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 2600);
}

const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return L('agora', 'just now');
  if (s < 3600) return L(`há ${Math.floor(s / 60)} min`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return L(`há ${Math.floor(s / 3600)} h`, `${Math.floor(s / 3600)} h ago`);
  return L(`há ${Math.floor(s / 86400)} d`, `${Math.floor(s / 86400)} d ago`);
};

const closeIcon = `<button class="icon-btn" data-close aria-label="${L('Fechar', 'Close')}">${icons.close}</button>`;
const deedTitle = (row) => deedById(row.deed_id || row.deedId)?.title || row.title;
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

// Anel de progresso (0–1).
const ring = (frac, color) => {
  const c = 2 * Math.PI * 19;
  return `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" class="ring-bg"/><circle cx="22" cy="22" r="19" class="ring-fg" style="stroke:${color};stroke-dasharray:${(Math.max(0.02, Math.min(1, frac)) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
};

// ---------- Progresso por jogo e por trilha ----------
const recordsOf = (g) => store.user?.games[g.id]?.levels || {};
const unlocked = (g, i) => i === 0 || Boolean(recordsOf(g)[g.levels[i - 1].id]);

function gameProgress(g) {
  const rec = recordsOf(g);
  const done = g.levels.filter((l) => rec[l.id]).length;
  const stars = g.levels.reduce((a, l) => a + (rec[l.id]?.stars || 0), 0);
  const nextIdx = g.levels.findIndex((l, i) => unlocked(g, i) && !rec[l.id]);
  return { done, total: g.levels.length, stars, next: nextIdx >= 0 ? g.levels[nextIdx] : null, rec };
}

// Todas as fases (de todos os jogos) que treinam uma trilha.
function trailLevels(skillId) {
  const rows = [];
  for (const g of GAMES) {
    const rec = recordsOf(g);
    g.levels.forEach((l, i) => {
      if (l.skill !== skillId) return;
      rows.push({ game: g, level: l, rec: rec[l.id] || null, open: unlocked(g, i), order: rows.length });
    });
  }
  return rows;
}

const trailMax = (skillId) => trailLevels(skillId).reduce((a, r) => a + r.level.points, 0);

// ---------- Cadastro / entrada ----------
function welcome() {
  unmountGame();
  const locals = store.localUsers();
  const el = h(`
    <section class="screen onboard">
      <img class="onboard-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <h1>${L('Quem está jogando?', 'Who is playing?')}</h1>
      <div class="onboard-choices">
        <button class="choice" data-act="new">
          <span class="choice-ico">${icons.sparkle}</span>
          <b>${L('Sou novo por aqui', 'I am new here')}</b><small>${L('Crie seu jogador e escolha seu avatar.', 'Create your player and pick your avatar.')}</small>
        </button>
        <button class="choice" data-act="existing">
          <span class="choice-ico">${icons.user}</span>
          <b>${L('Usuário existente', 'Returning player')}</b><small>${L('Entre com o seu apelido.', 'Sign in with your nickname.')}</small>
        </button>
      </div>
      ${locals.length ? `
        <p class="onboard-label">${L('Neste aparelho', 'On this device')}</p>
        <div class="local-users">
          ${locals.map((u) => `<button class="user-pill" data-nick="${esc(u.nickname)}"><img src="${avatarById(u.avatar).img}" alt=""><span>${esc(u.nickname)}</span></button>`).join('')}
        </div>` : ''}
    </section>`);
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const pill = e.target.closest('[data-nick]');
    if (act === 'new') { audio.tick(); signup(); }
    if (act === 'existing') { audio.tick(); login(); }
    if (pill) {
      audio.tick();
      const r = await store.login(pill.dataset.nick);
      if (r.ok) enter(); else toast(r.error);
    }
  });
  show(el);
}

function login() {
  const el = h(`
    <section class="screen onboard">
      <button class="icon-btn back" data-act="back" aria-label="${L('Voltar', 'Back')}">${icons.back}</button>
      <h1>${L('Bem-vindo de volta', 'Welcome back')}</h1>
      <form class="form" novalidate>
        <label>${L('Seu apelido', 'Your nickname')}<input name="nick" autocomplete="nickname" maxlength="24" required autofocus></label>
        <p class="form-error" aria-live="polite"></p>
        <button class="cta" type="submit">${L('Entrar', 'Sign in')}</button>
      </form>
    </section>`);
  const err = el.querySelector('.form-error');
  el.querySelector('[data-act="back"]').onclick = () => { audio.tick(); welcome(); };
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const nick = e.target.nick.value;
    if (!nick.trim()) { err.textContent = L('Digite seu apelido.', 'Type your nickname.'); return; }
    const r = await store.login(nick);
    if (r.ok) enter(); else err.textContent = r.error;
  };
  show(el);
}

function signup() {
  const draft = { nickname: '', city: '', avatar: null };
  const stepInfo = () => {
    const el = h(`
      <section class="screen onboard">
        <button class="icon-btn back" data-act="back" aria-label="${L('Voltar', 'Back')}">${icons.back}</button>
        <p class="step">${L('Passo 1 de 2', 'Step 1 of 2')}</p>
        <h1>${L('Crie seu jogador', 'Create your player')}</h1>
        <form class="form" novalidate>
          <label>${L('Apelido', 'Nickname')}<input name="nick" maxlength="24" autocomplete="nickname" required value="${esc(draft.nickname)}"></label>
          <label>${L('Sua cidade', 'Your city')}<input name="city" maxlength="40" autocomplete="address-level2" placeholder="${L('Ex.: Recife', 'E.g. Lisbon')}" value="${esc(draft.city)}"></label>
          <p class="form-hint">${L('A cidade aparece no mapa de impacto das Boas Ações Cognitivas.', 'Your city shows up on the Cognitive Good Deeds impact map.')}</p>
          <p class="form-error" aria-live="polite"></p>
          <button class="cta" type="submit">${L('Escolher avatar', 'Choose avatar')} ${icons.next}</button>
        </form>
      </section>`);
    el.querySelector('[data-act="back"]').onclick = () => { audio.tick(); welcome(); };
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      draft.nickname = e.target.nick.value.trim();
      draft.city = e.target.city.value.trim();
      const err = el.querySelector('.form-error');
      if (draft.nickname.length < 2) { err.textContent = L('O apelido precisa ter pelo menos 2 letras.', 'Your nickname needs at least 2 letters.'); return; }
      if (!draft.city) { err.textContent = L('Conte qual é a sua cidade.', 'Tell us your city.'); return; }
      audio.tick();
      stepAvatar();
    };
    show(el);
  };

  const stepAvatar = () => {
    const el = h(`
      <section class="screen onboard wide">
        <button class="icon-btn back" data-act="back" aria-label="${L('Voltar', 'Back')}">${icons.back}</button>
        <p class="step">${L('Passo 2 de 2', 'Step 2 of 2')}</p>
        <h1>${L('Escolha seu avatar', 'Choose your avatar')}</h1>
        <p class="onboard-lead">${L('Cada avatar é um órgão do corpo. O <b>índice de ligação</b> mostra o quanto ele está conectado ao cérebro, a ferramenta principal de todos os jogos.', 'Each avatar is an organ of the body. The <b>link index</b> shows how closely it is wired to the brain, the main tool in every game.')}</p>
        <div class="avatar-grid">
          ${AVATARS.map((a) => `
            <button class="avatar-card" data-av="${a.id}" aria-pressed="false">
              <img src="${a.img}" alt="">
              <b>${a.name}</b>
              <span class="link-meter" aria-label="${L('Índice de ligação', 'Link index')} ${a.link}"><i style="width:${a.link}%"></i></span>
              <span class="link-num">${L('Ligação', 'Link')} ${a.link}</span>
              <small>${a.fact}</small>
            </button>`).join('')}
        </div>
        <div class="onboard-foot">
          <p class="form-error" aria-live="polite"></p>
          <button class="cta" data-act="go" disabled>${L('Começar a jogar', 'Start playing')}</button>
        </div>
      </section>`);
    const go = el.querySelector('[data-act="go"]');
    el.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-av]');
      if (card) {
        audio.tick();
        haptic(8);
        draft.avatar = card.dataset.av;
        el.querySelectorAll('[data-av]').forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
        go.disabled = false;
      }
      if (e.target.closest('[data-act="back"]')) { audio.tick(); stepInfo(); }
      if (e.target.closest('[data-act="go"]') && draft.avatar) {
        go.disabled = true;
        const r = await store.register(draft);
        if (r.ok) { audio.arpeggio(7); enter(); } else { el.querySelector('.form-error').textContent = r.error; go.disabled = false; }
      }
    });
    show(el);
  };
  stepInfo();
}

function enter() {
  if (location.hash && location.hash !== '#/') route();
  else hub();
}

// ---------- Hub ----------
function rankLadder(points) {
  const r = rankFor(points);
  return `
    <div class="ladder" aria-label="${L('Faixa atual', 'Current rank')}: ${r.name}">
      ${RANKS.map((k, i) => `<span class="rung ${i < r.index ? 'past' : i === r.index ? 'now' : ''}" style="--rc:${k.color}"><i style="${i === r.index ? `width:${Math.max(3, r.frac * 100)}%` : ''}"></i><em>${k.name}</em></span>`).join('')}
    </div>`;
}

function topBar(back) {
  const u = store.user;
  const av = avatarById(u.avatar);
  const rank = rankFor(store.totalPoints() / GAMES.length);
  return `
    <header class="hub-top">
      ${back ? `<button class="icon-btn" data-act="home" aria-label="${L('Voltar ao início', 'Back to home')}">${icons.back}</button>` : ''}
      <img class="hub-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <button class="me" data-act="me" aria-label="${L('Seu perfil', 'Your profile')}">
        <img src="${av.img}" alt=""><span><b>${esc(u.nickname)}</b><small>${rank.name}</small></span>
      </button>
      <button class="icon-btn" data-act="settings" aria-label="${L('Ajustes', 'Settings')}">${icons.gear}</button>
    </header>`;
}

function trailCard(s) {
  const pts = store.skillPoints(s.id);
  const max = trailMax(s.id);
  const rows = trailLevels(s.id);
  const done = rows.filter((r) => r.rec).length;
  return `
    <a class="trail" href="#/mente/${s.id}" style="--c:${s.color}">
      <div class="trail-img"><img src="${s.img}" alt="" loading="lazy"><h3>${s.name}</h3></div>
      <div class="trail-body">
        <p>${s.pitch}</p>
        <div class="trail-prog"><i style="width:${max ? pct(pts / max) : '0%'}"></i></div>
        <div class="trail-foot">
          <span><b>${fmt(pts)}</b> pts · ${done}/${rows.length} ${L('fases', 'levels')}</span>
          <span class="trail-go">${L('Explorar', 'Explore')} ${icons.next}</span>
        </div>
      </div>
    </a>`;
}

function gameCard(g) {
  const pts = store.gamePoints(g.id);
  const gr = rankFor(pts);
  const m = store.monthStats(g.id);
  const diff = m.thisMonth - m.lastMonth;
  const p = gameProgress(g);
  const status = !p.done ? L('Novo', 'New') : p.next ? L('Em andamento', 'In progress') : L('Completo', 'Complete');
  const go = p.next ? `fase/${p.next.id}` : '';
  const ctaText = !p.done ? `${icons.play} ${L('Começar', 'Start')}` : p.next ? `${icons.play} ${L('Continuar', 'Continue')} · ${p.next.name}` : `${icons.map} ${L('Rever fases', 'Replay levels')}`;
  return `
    <article class="gcard" style="--accent:${g.accent}">
      <button class="gcard-cover" data-game="${g.id}" data-go="" aria-label="${g.title}">
        <img src="${g.cover}" alt="" loading="lazy">
        <span class="gcard-badge">${status}</span>
        <span class="gcard-title"><b>${g.title}</b><small>${g.tagline}</small></span>
      </button>
      <div class="gcard-body">
        <div class="gcard-stats">
          <div class="gcard-ring">${ring(pts / MAX_POINTS, gr.color)}<span><b>${pct(pts / MAX_POINTS)}</b></span></div>
          <div class="gcard-num">
            <b>${fmt(pts)} <small>pts</small></b>
            <span style="color:${gr.color}">${gr.name}</span>
            <small class="${diff >= 0 ? 'up' : 'down'}">${m.lastMonth || m.thisMonth ? L(`${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))} vs mês passado`, `${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))} vs last month`) : L('Seu primeiro mês', 'Your first month')}</small>
          </div>
        </div>
        <div class="gcard-levels">
          <div class="gcard-levels-head"><span>${L('Fases', 'Levels')} <b>${p.done}/${p.total}</b></span><span>★ <b>${p.stars}</b>/${p.total * 3}</span></div>
          <div class="dots">${g.levels.map((l) => { const r = p.rec[l.id]; const sk = skillById(l.skill); return `<i class="${r ? 'done' : l === p.next ? 'next' : ''}" style="--c:${sk.color}" title="${l.id} · ${l.name}"></i>`; }).join('')}</div>
        </div>
        <div class="chips">${g.skills.map((id) => { const s = skillById(id); return `<a class="chip" href="#/mente/${id}" style="--c:${s.color}">${s.name}</a>`; }).join('')}</div>
        <div class="gcard-actions">
          <button class="cta" data-game="${g.id}" data-go="${go}">${ctaText}</button>
          <button class="icon-btn" data-game="${g.id}" data-go="${g.free.path}" aria-label="${g.free.name}" title="${g.free.name}">${icons.sparkle}</button>
        </div>
      </div>
    </article>`;
}

function hub() {
  unmountGame();
  const total = store.totalPoints();
  const overall = total / GAMES.length;
  const rank = rankFor(overall);
  const pending = store.pendingCommitments();

  const el = h(`
    <section class="screen hub">
      ${topBar(false)}

      <section class="hero">
        <div class="hero-main">
          <p class="eyebrow">${L('Sua quilometragem', 'Your mileage')}</p>
          <p class="hero-pts"><b>${fmt(total)}</b><span>/ ${fmt(MAX_POINTS * GAMES.length)} pts</span></p>
          <p class="hero-rank" style="--rc:${rank.color}">${rank.name}${rank.next ? L(` · faltam ${fmt(rank.next.min - overall)} para ${rank.next.name}`, ` · ${fmt(rank.next.min - overall)} to ${rank.next.name}`) : ''}</p>
        </div>
        ${rankLadder(overall)}
      </section>

      ${pending.length ? `
        <a class="mission" href="#boas-acoes" data-act="to-deeds">
          <img src="${deedById(pending[0].deedId)?.img || DEEDS[0].img}" alt="">
          <span><small>${L('Sua missão fora da tela', 'Your off-screen mission')}</small>
          <b>${pending.length === 1 ? deedById(pending[0].deedId)?.title : L(`${pending.length} boas ações esperando por você`, `${pending.length} good deeds waiting for you`)}</b></span>
          <span class="mission-go">${icons.heart}</span>
        </a>` : ''}

      <h2 class="sec-title">${L('Sua Mente', 'Your Mind')}</h2>
      <p class="sec-lead">${L('Cinco trilhas. Cada fase de cada jogo treina uma delas. Toque numa trilha para ver seu progresso e se comparar com a comunidade.', 'Five trails. Every level of every game trains one of them. Tap a trail to see your progress and compare with the community.')}</p>
      <div class="trails">${SKILLS.map(trailCard).join('')}</div>

      <h2 class="sec-title">${L('Jogos', 'Games')}</h2>
      <p class="sec-lead">${L('Cada jogo vale até 1.000.000 de pontos, repartidos entre as fases.', 'Each game is worth up to 1,000,000 points, spread across its levels.')}</p>
      <div class="games">${GAMES.map(gameCard).join('')}</div>
      <div class="soon-row">
        ${COMING_SOON.map((c) => `
          <div class="soon" style="--c:${c.color}" aria-disabled="true">
            <span class="soon-ico">${icons.lock}</span>
            <span><b>${c.title}</b><small>${c.tagline}</small></span>
          </div>`).join('')}
      </div>

      ${deedsSection(pending)}
      <footer class="hub-foot">SCHOLA · ${store.online ? L('mural compartilhado', 'shared wall') : L('modo local: o mural mostra só este aparelho', 'local mode: the wall only shows this device')}</footer>
    </section>`);

  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-game]');
    if (g) { audio.tick(); haptic(8); location.hash = `#/${g.dataset.game}${g.dataset.go ? '/' + g.dataset.go : ''}`; return; }
    if (e.target.closest('a[href^="#/"]')) { audio.tick(); return; }
    if (e.target.closest('[data-act="to-deeds"]')) {
      e.preventDefault(); audio.tick();
      el.querySelector('#boas-acoes')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    handleCommon(e, pending);
  });
  show(el);
  loadBoard(el);
}

// Ações compartilhadas pelo hub e pela página da trilha.
function handleCommon(e, pending = []) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'settings') { audio.tick(); settings(); }
  if (act === 'me') { audio.tick(); profileSheet(); }
  if (act === 'home') { audio.tick(); location.hash = ''; }
  if (act === 'deed') { audio.tick(); deedForm(); }
  const idea = e.target.closest('[data-idea]');
  if (idea) { audio.tick(); deedSheet(idea.dataset.idea); }
  const done = e.target.closest('[data-done]');
  if (done) { audio.tick(); const c = pending.find((x) => x.id === done.dataset.done); deedForm(c); }
}

// ---------- Boas Ações Cognitivas ----------
function deedsSection(pending) {
  return `
    <section class="deeds" id="boas-acoes">
      <div class="deeds-hero">
        <div class="deeds-collage" aria-hidden="true">${['ler', 'jogo-tabuleiro', 'caminhada'].map((id) => `<img src="${deedById(id).img}" alt="" loading="lazy">`).join('')}</div>
        <div class="deeds-hero-txt">
          <p class="eyebrow">${L('Boas Ações Cognitivas', 'Cognitive Good Deeds')}</p>
          <h2>${L('Toda ajuda que você recebe vira uma ajuda que você dá.', 'Every bit of help you get becomes help you give.')}</h2>
          <p>${L('No SCHOLA, a Ajuda de um jogo não custa pontos: custa um compromisso de cuidar do cérebro de outra pessoa. Ler para uma criança, ensinar um jogo a um idoso, ouvir alguém sem celular.', 'In SCHOLA, in-game Help never costs points: it costs a promise to care for someone else\'s brain. Reading to a child, teaching a game to a grandparent, listening to someone with your phone away.')}</p>
          <div class="deeds-counter" data-slot="counter"><b>…</b><span>${L('pessoas já ganharam um cérebro mais afiado', 'people have already gained a sharper mind')}</span></div>
          <div class="deeds-goal" data-slot="goal"></div>
          <button class="cta" data-act="deed">${icons.heart} ${L('Registrar uma boa ação', 'Log a good deed')}</button>
        </div>
      </div>

      <div class="deeds-me" data-slot="me">${myImpact(null)}</div>

      ${pending.length ? `
        <h3 class="sub-title">${L('Seus compromissos', 'Your commitments')}</h3>
        <div class="pending">
          ${pending.map((c) => { const d = deedById(c.deedId); return `
            <div class="pending-item">
              <img src="${d?.img || ''}" alt="">
              <span class="pending-txt"><b>${esc(d?.title || c.deedId)}</b><small>${L('Compromisso de', 'Promised on')} ${new Date(c.at).toLocaleDateString(locale())}${c.game ? ` · ${GAMES.find((g) => g.id === c.game)?.title || ''}` : ''}</small></span>
              <button class="btn-sm" data-done="${c.id}">${L('Já fiz', 'Done it')}</button>
            </div>`; }).join('')}
        </div>` : ''}

      <h3 class="sub-title">${L('Escolha sua próxima boa ação', 'Pick your next good deed')}</h3>
      <div class="ideas" role="list">
        ${DEEDS.map((d) => { const s = skillById(d.skill); return `
          <button class="idea" data-idea="${d.id}" role="listitem" style="--c:${s.color}">
            <img src="${d.img}" alt="" loading="lazy">
            <span class="idea-txt"><b>${d.title}</b><small>~${d.mins} min · <i>${s.name}</i></small></span>
          </button>`; }).join('')}
      </div>

      <div class="deeds-board" aria-live="polite"><p class="muted">${L('Carregando o mural…', 'Loading the wall…')}</p></div>
    </section>`;
}

function badgeFor(n) {
  let i = -1;
  BADGES.forEach((b, k) => { if (n >= b.min) i = k; });
  return { badge: BADGES[i] || null, next: BADGES[i + 1] || null };
}

function myImpact(rows) {
  const u = store.user;
  const mine = rows ? rows.filter((r) => r.nickname === u.nickname) : [];
  const n = Math.max(u.deedsDone || 0, mine.length);
  const people = Math.max(u.peopleHelped || 0, mine.reduce((a, r) => a + (r.people || 1), 0));
  const { badge, next } = badgeFor(n);
  const frac = next ? n / next.min : 1;
  return `
    <div class="impact">
      <div class="impact-badge"><span>${badge ? badge.icon : '🤍'}</span><b>${badge ? badge.name : L('Sem selo ainda', 'No badge yet')}</b>
        <small>${next ? L(`${next.min - n} para ${next.icon} ${next.name}`, `${next.min - n} to ${next.icon} ${next.name}`) : L('Selo máximo!', 'Top badge!')}</small>
        <i class="impact-bar"><u style="width:${pct(frac)}"></u></i></div>
      <div class="impact-kpi"><b>${fmt(n)}</b><span>${L('suas boas ações', 'your good deeds')}</span></div>
      <div class="impact-kpi"><b>${fmt(people)}</b><span>${L('pessoas que você ajudou', 'people you helped')}</span></div>
      <div class="impact-kpi"><b>${fmt(store.pendingCommitments().length)}</b><span>${L('compromissos abertos', 'open commitments')}</span></div>
    </div>`;
}

// Detalhe de uma boa ação: como fazer, assumir o compromisso ou registrar.
function deedSheet(id) {
  const d = deedById(id);
  const s = skillById(d.skill);
  const sh = sheet(`
    <div class="deed-detail" style="--c:${s.color}">
      <div class="deed-detail-img"><img src="${d.img}" alt="">${closeIcon}</div>
      <h2>${d.title}</h2>
      <p class="deed-detail-meta">~${d.mins} min · ${L('exercita', 'exercises')} <b>${s.name}</b> ${L('em quem recebe', 'in the person you help')}</p>
      <p class="deed-detail-how">${d.how}</p>
      <div class="deed-detail-actions">
        <button class="ghost-btn" data-a="commit">${icons.heart} ${L('Vou fazer', 'I will do it')}</button>
        <button class="cta" data-a="log">${L('Já fiz, registrar', 'Done, log it')}</button>
      </div>
    </div>`, { label: d.title, wide: true });
  sh.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'commit') {
      store.commit(d.id, { source: 'mural' });
      audio.chime(784, 0.6); haptic(15);
      sh.close();
      toast(L('Compromisso feito. Ele aparece na sua página inicial.', 'Commitment made. You will find it on your home page.'));
      hub();
      setTimeout(() => document.getElementById('boas-acoes')?.scrollIntoView({ behavior: 'smooth' }), 400);
    }
    if (a === 'log') { audio.tick(); sh.close(); setTimeout(() => deedForm({ deedId: d.id }), 260); }
  });
}

async function loadBoard(root) {
  const box = root.querySelector('.deeds-board');
  const rows = await store.listDeeds();
  if (!box.isConnected) return;
  const slot = (name) => root.querySelector(`[data-slot="${name}"]`);
  if (!rows) {
    box.innerHTML = `<p class="muted">${L('O mural está fora do ar agora. Tente de novo mais tarde.', 'The wall is offline right now. Try again later.')}</p>`;
    slot('counter').querySelector('b').textContent = '—';
    return;
  }
  const people = rows.reduce((a, r) => a + (r.people || 1), 0);
  const now = new Date();
  const monthRows = rows.filter((r) => { const d = new Date(r.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const monthPeople = monthRows.reduce((a, r) => a + (r.people || 1), 0);
  const goal = Math.max(50, Math.ceil((monthPeople + 1) / 50) * 50);
  slot('counter').querySelector('b').textContent = fmt(people);
  slot('goal').innerHTML = `
    <div class="deeds-goal-head"><span>${L('Meta coletiva do mês', 'Community goal this month')}</span><b>${fmt(monthPeople)} / ${fmt(goal)}</b></div>
    <i><u style="width:${pct(monthPeople / goal)}"></u></i>`;
  slot('me').innerHTML = myImpact(rows);

  if (!rows.length) {
    box.innerHTML = `<p class="muted">${L('Ainda não há boas ações registradas. Seja a primeira pessoa a inspirar o mural!', 'No good deeds logged yet. Be the first to inspire the wall!')}</p>`;
    return;
  }
  const by = (key) => {
    const m = new Map();
    rows.forEach((r) => { const k = key(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const players = new Map();
  rows.forEach((r) => {
    const p = players.get(r.nickname) || { nickname: r.nickname, avatar: r.avatar, n: 0, people: 0 };
    p.n++; p.people += r.people || 1;
    players.set(r.nickname, p);
  });
  const leaders = [...players.values()].sort((a, b) => b.n - a.n || b.people - a.people).slice(0, 8);
  const cities = by((r) => (r.city || '').trim());
  const actions = by((r) => deedTitle(r));
  const bars = (list, color) => {
    const top = list.slice(0, 5);
    const max = top[0]?.[1] || 1;
    return top.map(([k, n]) => `
      <div class="bar"><span class="bar-label">${esc(k)}</span><span class="bar-track"><i style="width:${(n / max) * 100}%;background:${color}"></i></span><b>${n}</b></div>`).join('');
  };

  box.innerHTML = `
    <div class="board-grid">
      <div class="panel">
        <h3>${L('Placar de boas ações', 'Good deeds leaderboard')}</h3>
        <ol class="leaders">
          ${leaders.map((p, i) => `
            <li><span class="pos">${i + 1}</span><img src="${avatarById(p.avatar).img}" alt=""><span class="who">${esc(p.nickname)}</span><span class="n">${p.n}<small> ${L('ações', 'deeds')}</small></span></li>`).join('')}
        </ol>
      </div>
      <div class="panel">
        <h3>${L('Últimas boas ações', 'Latest good deeds')}</h3>
        <ul class="feed">
          ${rows.slice(0, 6).map((r) => { const d = deedById(r.deed_id); return `
            <li>${d ? `<img class="feed-thumb" src="${d.img}" alt="">` : ''}
              <div><p><img class="feed-av" src="${avatarById(r.avatar).img}" alt=""><b>${esc(r.nickname)}</b> · ${esc(deedTitle(r))}</p>
              ${r.note ? `<p class="feed-note">“${esc(r.note)}”</p>` : ''}
              <small>${esc(r.city || L('cidade não informada', 'city not given'))} · ${L(`${r.people || 1} pessoa${(r.people || 1) > 1 ? 's' : ''}`, `${r.people || 1} ${(r.people || 1) > 1 ? 'people' : 'person'}`)} · ${timeAgo(r.created_at)}</small></div></li>`; }).join('')}
        </ul>
      </div>
    </div>
    <div class="panel dash">
      <h3>${L('Impacto em números', 'Impact in numbers')}</h3>
      <div class="kpis">
        <div class="kpi"><b>${fmt(rows.length)}</b><span>${L('boas ações', 'good deeds')}</span></div>
        <div class="kpi"><b>${fmt(people)}</b><span>${L('pessoas impactadas', 'people reached')}</span></div>
        <div class="kpi"><b>${fmt(cities.length)}</b><span>${L('cidades de impacto', 'cities reached')}</span></div>
        <div class="kpi"><b>${fmt(monthRows.length)}</b><span>${L('neste mês', 'this month')}</span></div>
      </div>
      <div class="dash-cols">
        <div><h4>${L('Cidades com mais impacto', 'Cities with the most impact')}</h4>${bars(cities, '#38E1FF')}</div>
        <div><h4>${L('Ações mais praticadas', 'Most practiced deeds')}</h4>${bars(actions, '#FF4FD8')}</div>
      </div>
    </div>`;
}

// Formulário de registro de boa ação (opcionalmente fechando um compromisso).
function deedForm(commitment) {
  const u = store.user;
  const s = sheet(`
    <header class="sheet-head"><h2>${L('Registrar boa ação', 'Log a good deed')}</h2>${closeIcon}</header>
    <form class="form" novalidate>
      <label>${L('O que você fez', 'What you did')}
        <select name="deed">${DEEDS.map((d) => `<option value="${d.id}" ${commitment?.deedId === d.id ? 'selected' : ''}>${d.title}</option>`).join('')}</select>
      </label>
      <label>${L('Como foi? (opcional)', 'How did it go? (optional)')}<textarea name="note" maxlength="280" rows="3" placeholder="${L('Ex.: Li um capítulo para minha avó e ela lembrou dos nomes de todos os personagens.', 'E.g. I read a chapter to my grandma and she remembered every character\'s name.')}"></textarea></label>
      <div class="form-row">
        <label>${L('Cidade', 'City')}<input name="city" maxlength="40" value="${esc(u.city)}"></label>
        <label>${L('Pessoas ajudadas', 'People helped')}<input name="people" type="number" min="1" max="50" value="1" inputmode="numeric"></label>
      </div>
      <p class="form-hint">${store.online ? L('Sua boa ação aparece no mural para todos os jogadores, com seu apelido e cidade.', 'Your good deed shows up on the wall for every player, with your nickname and city.') : L('Modo local: a boa ação fica salva só neste aparelho.', 'Local mode: the good deed is saved on this device only.')}</p>
      <p class="form-error" aria-live="polite"></p>
      <button class="cta" type="submit">${icons.heart} ${L('Registrar', 'Log it')}</button>
    </form>`, { label: L('Registrar boa ação', 'Log a good deed') });
  s.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const open = commitment?.id ? commitment : store.pendingCommitments().find((c) => c.deedId === f.deed.value);
      await store.registerDeed({ deedId: f.deed.value, note: f.note.value, city: f.city.value, people: f.people.value, commitmentId: open?.id });
      audio.arpeggio(7);
      haptic(20);
      s.close();
      const { badge } = badgeFor(store.user.deedsDone || 0);
      toast(badge && badge.min === store.user.deedsDone
        ? L(`Novo selo: ${badge.icon} ${badge.name}! Obrigado por cuidar de outro cérebro.`, `New badge: ${badge.icon} ${badge.name}! Thank you for caring for another mind.`)
        : L('Boa ação registrada. Obrigado por cuidar de outro cérebro!', 'Good deed logged. Thank you for caring for another mind!'));
      hub();
      setTimeout(() => document.getElementById('boas-acoes')?.scrollIntoView({ behavior: 'smooth' }), 400);
    } catch (err) {
      console.warn(err);
      f.querySelector('.form-error').textContent = L('Não foi possível registrar agora. Tente de novo em instantes.', 'Could not log it right now. Try again in a moment.');
      btn.disabled = false;
    }
  };
}

// ---------- Ajuda (compartilhada por todos os jogos) ----------
// Para receber ajuda numa fase, o jogador se compromete com uma boa ação cognitiva.
function requestHelp(ctx = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    const s = sheet(`
      <header class="sheet-head"><h2>${L('Ajuda por uma boa ação', 'Help for a good deed')}</h2>${closeIcon}</header>
      <p class="sheet-lead">${L('Para destravar a ajuda, escolha uma boa ação que melhore o raciocínio de <b>outra pessoa</b>. Depois de cumprir, registre na página inicial.', 'To unlock help, pick a good deed that sharpens <b>someone else\'s</b> thinking. Once you have done it, log it on the home page.')}</p>
      <div class="deed-list">
        ${DEEDS.map((d) => `
          <details class="deed" data-deed="${d.id}">
            <summary><img src="${d.img}" alt=""><b>${d.title}</b><small>~${d.mins} min</small><span class="deed-radio"></span></summary>
            <p>${d.how}</p>
          </details>`).join('')}
      </div>
      <button class="cta" data-act="commit" disabled>${icons.heart} ${L('Eu me comprometo', 'I promise')}</button>`, { label: L('Ajuda por uma boa ação', 'Help for a good deed'), wide: true });
    const btn = s.el.querySelector('[data-act="commit"]');
    let committed = false;
    s.el.addEventListener('click', (e) => {
      const sum = e.target.closest('summary');
      if (sum) {
        const det = sum.parentElement;
        chosen = det.dataset.deed;
        s.el.querySelectorAll('.deed').forEach((d) => { d.classList.toggle('picked', d === det); if (d !== det) d.open = false; });
        btn.disabled = false;
        audio.tick();
      }
      if (e.target.closest('[data-act="commit"]') && chosen) {
        committed = true;
        store.commit(chosen, ctx);
        audio.chime(784, 0.6);
        haptic(20);
        s.close();
        toast(L('Compromisso feito. A ajuda está liberada!', 'Promise made. Help is unlocked!'));
        resolve(true);
      }
    });
    // Fechou sem se comprometer.
    new MutationObserver((_, obs) => { if (!s.el.isConnected) { obs.disconnect(); if (!committed) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

// ---------- Página da trilha (Sua Mente) ----------
function trailPage(skill) {
  unmountGame();
  const rows = trailLevels(skill.id);
  const pts = store.skillPoints(skill.id);
  const max = trailMax(skill.id);
  const done = rows.filter((r) => r.rec);
  const stars = rows.reduce((a, r) => a + (r.rec?.stars || 0), 0);
  const months = store.skillMonths(skill.id, 6);
  const mMax = Math.max(1, ...months.map((m) => m.pts));
  const thisM = months[5].pts;
  const lastM = months[4].pts;
  const frees = GAMES.filter((g) => g.free?.skill === skill.id);
  const minutes = skill.id === 'atencao' ? store.user.focusMinutes || 0 : skill.id === 'criatividade' ? store.user.freeMinutes || 0 : 0;
  const games = [...new Set(rows.map((r) => r.game))];
  const monthName = (key) => new Date(`${key}-15`).toLocaleDateString(locale(), { month: 'short' }).replace('.', '');
  const state = { game: 'all', sort: 'order' };

  const el = h(`
    <section class="screen hub trail-page" style="--c:${skill.color}">
      ${topBar(true)}
      <section class="tp-hero">
        <img src="${skill.img}" alt="">
        <div class="tp-hero-txt">
          <p class="eyebrow">${L('Trilha de Sua Mente', 'Your Mind trail')}</p>
          <h1>${skill.name}</h1>
          <p>${skill.pitch}</p>
        </div>
      </section>

      <div class="tp-grid">
        <section class="panel tp-gains">
          <h3>${L('Você vai desenvolver', 'You will develop')}</h3>
          <ul>${skill.gains.map((g) => `<li>${g}</li>`).join('')}</ul>
          <p class="tp-life"><b>${L('Na vida real', 'In real life')}:</b> ${skill.life}</p>
        </section>

        <section class="panel tp-metrics">
          <h3>${L('Suas métricas', 'Your metrics')}</h3>
          <div class="tp-kpis">
            <div class="tp-kpi tp-kpi-main">${ring(max ? pts / max : 0, skill.color)}<span><b>${max ? pct(pts / max) : '0%'}</b><small>${L('dominado', 'mastered')}</small></span></div>
            <div class="tp-kpi"><b>${fmt(pts)}</b><small>${L('pontos na trilha', 'trail points')}</small></div>
            <div class="tp-kpi"><b>${done.length}/${rows.length}</b><small>${L('fases concluídas', 'levels cleared')}</small></div>
            <div class="tp-kpi"><b>★ ${stars}/${rows.length * 3}</b><small>${L('estrelas', 'stars')}</small></div>
            ${frees.length ? `<div class="tp-kpi"><b>${fmt(minutes)} min</b><small>${frees.map((g) => g.free.name).join(' · ')}</small></div>` : ''}
            <div class="tp-kpi"><b class="${thisM >= lastM ? 'up' : 'down'}">${thisM >= lastM ? '▲' : '▼'} ${fmt(Math.abs(thisM - lastM))}</b><small>${L('este mês vs anterior', 'this month vs last')}</small></div>
          </div>
          <h4>${L('Pontos por mês', 'Points per month')}</h4>
          <div class="months">${months.map((m) => `<span><i style="height:${Math.max(3, (m.pts / mMax) * 100)}%" title="${fmt(m.pts)}"></i><em>${monthName(m.key)}</em></span>`).join('')}</div>
        </section>
      </div>

      <section class="panel tp-table">
        <div class="tp-table-head">
          <h3>${L('Habilidades por jogo', 'Skills by game')}</h3>
          <div class="tp-filters">
            <div class="seg" role="group" aria-label="${L('Filtrar por jogo', 'Filter by game')}">
              <button data-f="all" aria-pressed="true">${L('Todos', 'All')}</button>
              ${games.map((g) => `<button data-f="${g.id}" aria-pressed="false" style="--accent:${g.accent}">${g.title}</button>`).join('')}
            </div>
            <select data-sort aria-label="${L('Ordenar', 'Sort')}">
              <option value="order">${L('Ordem das fases', 'Level order')}</option>
              <option value="points">${L('Mais pontos', 'Most points')}</option>
              <option value="gap">${L('Mais a ganhar', 'Most to gain')}</option>
            </select>
          </div>
        </div>
        <div class="tp-rows" role="table"></div>
      </section>

      <section class="panel tp-compare">
        <h3>${L('Você e a comunidade', 'You and the community')}</h3>
        <div class="tp-compare-body"><p class="muted">${L('Comparando com os outros jogadores…', 'Comparing with other players…')}</p></div>
      </section>
    </section>`);

  const renderRows = () => {
    let list = rows.filter((r) => state.game === 'all' || r.game.id === state.game);
    if (state.sort === 'points') list = [...list].sort((a, b) => (b.rec?.points || 0) - (a.rec?.points || 0));
    if (state.sort === 'gap') list = [...list].sort((a, b) => (b.level.points - (b.rec?.points || 0)) - (a.level.points - (a.rec?.points || 0)));
    el.querySelector('.tp-rows').innerHTML = `
      <div class="tp-row tp-row-head" role="row"><span>${L('Jogo · fase', 'Game · level')}</span><span>${L('Foco treinado', 'Focus trained')}</span><span>${L('Status', 'Status')}</span><span>${L('Pontos', 'Points')}</span></div>
      ${list.map((r) => {
        const got = r.rec?.points || 0;
        const st = r.rec ? `<span class="stars">${'★'.repeat(r.rec.stars)}<i>${'★'.repeat(3 - r.rec.stars)}</i></span>` : r.open ? `<span class="tag-open">${L('Disponível', 'Available')}</span>` : `<span class="tag-lock">${icons.lock}${L('Bloqueada', 'Locked')}</span>`;
        return `
        <button class="tp-row" role="row" data-play="${r.open ? `${r.game.id}/fase/${r.level.id}` : ''}" ${r.open ? '' : 'disabled'}>
          <span class="tp-cell-game"><i style="background:${r.game.accent}"></i><b>${r.game.title}</b> ${r.level.id} · ${r.level.name}</span>
          <span class="tp-cell-focus">${r.level.focus}</span>
          <span>${st}</span>
          <span class="tp-cell-pts"><b>${fmt(got)}</b><small>/ ${fmt(r.level.points)}</small><i><u style="width:${pct(got / r.level.points)}"></u></i></span>
        </button>`;
      }).join('')}
      ${frees.filter((g) => state.game === 'all' || g.id === state.game).map((g) => `
        <button class="tp-row" role="row" data-play="${g.id}/${g.free.path}">
          <span class="tp-cell-game"><i style="background:${g.accent}"></i><b>${g.title}</b> ${g.free.name}</span>
          <span class="tp-cell-focus">${g.free.focus}</span>
          <span><span class="tag-open">${L('Livre', 'Free')}</span></span>
          <span class="tp-cell-pts"><b>${fmt(minutes)} min</b><small>${L('2.000 pts/min', '2,000 pts/min')}</small></span>
        </button>`).join('')}`;
  };
  renderRows();

  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) {
      audio.tick();
      state.game = f.dataset.f;
      el.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      renderRows();
      return;
    }
    const row = e.target.closest('[data-play]');
    if (row && row.dataset.play) { audio.tick(); haptic(8); location.hash = `#/${row.dataset.play}`; return; }
    handleCommon(e);
  });
  el.querySelector('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; audio.tick(); renderRows(); });
  show(el);
  loadCompare(el, skill, pts);
}

async function loadCompare(el, skill, mine) {
  const box = el.querySelector('.tp-compare-body');
  const profiles = await store.listProfiles();
  if (!box.isConnected) return;
  if (!profiles) { box.innerHTML = `<p class="muted">${L('A comparação está fora do ar agora. Tente de novo mais tarde.', 'The comparison is offline right now. Try again later.')}</p>`; return; }
  const me = store.user;
  const list = profiles
    .filter((p) => p.id !== me.id)
    .map((p) => ({ nickname: p.nickname, avatar: p.avatar, pts: Store.skillPointsOf(p, skill.id) }));
  list.push({ nickname: me.nickname, avatar: me.avatar, pts: mine, me: true });
  list.sort((a, b) => b.pts - a.pts);
  const n = list.length;
  const pos = list.findIndex((p) => p.me) + 1;
  const below = list.filter((p) => p.pts < mine).length;
  const avg = list.reduce((a, p) => a + p.pts, 0) / n;
  const top = list[0].pts || 1;
  const BUCKETS = 6;
  const step = top / BUCKETS;
  const hist = Array(BUCKETS).fill(0);
  list.forEach((p) => { hist[Math.min(BUCKETS - 1, Math.floor(p.pts / step))]++; });
  const myBucket = Math.min(BUCKETS - 1, Math.floor(mine / step));
  const hMax = Math.max(...hist);
  const bar = (label, v, cls) => `<div class="cmp-bar ${cls}"><span>${label}</span><i><u style="width:${pct(v / top)}"></u></i><b>${fmt(v)}</b></div>`;

  box.innerHTML = `
    ${n < 2 ? `<p class="muted">${store.online ? L('Você é o primeiro jogador desta trilha. Convide alguém para comparar!', 'You are the first player on this trail. Invite someone to compare!') : L('Modo local: a comparação usa os jogadores deste aparelho. Crie outro jogador ou conecte o banco online.', 'Local mode: the comparison uses players on this device. Create another player or connect the online database.')}</p>` : ''}
    <div class="cmp-head">
      <div class="cmp-pos"><b>#${pos}</b><small>${L(`de ${n} jogador${n > 1 ? 'es' : ''}`, `of ${n} player${n > 1 ? 's' : ''}`)}</small></div>
      <p>${n < 2 ? '' : below > 0
        ? L(`Você está à frente de <b>${pct(below / (n - 1))}</b> dos jogadores em ${skill.name}.`, `You are ahead of <b>${pct(below / (n - 1))}</b> of players in ${skill.name}.`)
        : pos > 1
          ? L(`Faltam <b>${fmt(list[pos - 2].pts - mine)}</b> pts para subir uma posição em ${skill.name}. Cada fase desta trilha conta.`, `<b>${fmt(list[pos - 2].pts - mine)}</b> pts to move up a spot in ${skill.name}. Every level on this trail counts.`)
          : L(`Todo mundo começa do zero aqui. A primeira fase concluída já te coloca na frente.`, `Everyone starts at zero here. Your first cleared level puts you in front.`)}</p>
    </div>
    <div class="cmp-bars">
      ${bar(L('Você', 'You'), mine, 'is-me')}
      ${bar(L('Média', 'Average'), avg, '')}
      ${bar(L('Melhor', 'Best'), list[0].pts, 'best')}
    </div>
    <div class="cmp-cols">
      <div>
        <h4>${L('Distribuição dos jogadores', 'How players are spread')}</h4>
        <div class="hist">${hist.map((c, i) => `<span class="${i === myBucket ? 'is-me' : ''}"><i style="height:${Math.max(4, (c / hMax) * 100)}%"></i><em>${c}</em></span>`).join('')}</div>
        <div class="hist-axis"><span>0</span><span>${fmt(top)} pts</span></div>
      </div>
      <div>
        <h4>${L('Top da trilha', 'Trail top')}</h4>
        <ol class="leaders">
          ${list.slice(0, 5).map((p, i) => `<li class="${p.me ? 'is-me' : ''}"><span class="pos">${i + 1}</span><img src="${avatarById(p.avatar).img}" alt=""><span class="who">${esc(p.nickname)}</span><span class="n">${fmt(p.pts)}</span></li>`).join('')}
        </ol>
      </div>
    </div>`;
}

// ---------- Perfil e ajustes ----------
function profileSheet() {
  const u = store.user;
  const av = avatarById(u.avatar);
  const s = sheet(`
    <header class="sheet-head"><h2>${L('Seu perfil', 'Your profile')}</h2>${closeIcon}</header>
    <div class="profile">
      <img src="${av.img}" alt="">
      <div><b>${esc(u.nickname)}</b><small>${esc(u.city)}</small>
        <p>${L('Avatar', 'Avatar')}: ${av.name} · ${L('ligação', 'link')} ${av.link}</p></div>
    </div>
    <p class="sheet-lead">${av.fact}</p>
    <button class="ghost-btn" data-act="switch">${icons.user} ${L('Trocar de usuário', 'Switch player')}</button>`, { label: L('Seu perfil', 'Your profile') });
  s.el.querySelector('[data-act="switch"]').onclick = () => { audio.tick(); s.close(); store.logout(); location.hash = ''; welcome(); };
}

function settings() {
  const st = store.settings;
  const row = (key, icon, label) => `
    <label class="set-row">
      <span class="set-ico">${icon}</span><span class="set-label">${label}</span>
      <input type="checkbox" data-key="${key}" ${st[key] ? 'checked' : ''}><span class="switch"></span>
    </label>`;
  const s = sheet(`
    <header class="sheet-head"><h2>${L('Ajustes', 'Settings')}</h2>${closeIcon}</header>
    <div class="set-row set-lang">
      <span class="set-ico">${icons.sparkle}</span><span class="set-label">${L('Idioma', 'Language')}</span>
      <div class="seg" role="group" aria-label="${L('Idioma', 'Language')}">
        <button data-lang="pt" aria-pressed="${lang === 'pt'}">PT</button>
        <button data-lang="en" aria-pressed="${lang === 'en'}">EN</button>
      </div>
    </div>
    ${row('sound', icons.sound, L('Sons', 'Sounds'))}
    ${row('music', icons.music, L('Música ambiente', 'Ambient music'))}
    ${row('haptics', icons.vibrate, L('Vibração', 'Vibration'))}
    <button class="danger" data-act="reset">${L('Zerar meus pontos', 'Reset my points')}</button>`, { label: L('Ajustes', 'Settings') });
  s.el.addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    store.setSetting(k, e.target.checked);
    if (k === 'sound') audio.setSound(e.target.checked);
    if (k === 'music') audio.setMusic(e.target.checked);
    audio.tick();
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === lang) return;
    setLang(b.dataset.lang);
    location.reload();
  });
  s.el.querySelector('[data-act="reset"]').onclick = () => {
    if (!confirm(L('Zerar todos os seus pontos? As boas ações registradas continuam no mural.', 'Reset all your points? Your logged good deeds stay on the wall.'))) return;
    store.resetUser();
    s.close();
    hub();
  };
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
      requestHelp: (ctx) => requestHelp({ game: game.id, ...ctx }),
      progress: {
        levels: () => store.game(game.id).levels,
        points: () => store.gamePoints(game.id),
        saveLevel: (levelId, result) => store.saveLevel(game.id, levelId, result),
        addFreeMinute: (skill) => store.addFreeMinute(skill),
      },
    };
    show(el);
    current = { id: game.id, el, inst: game.mount(el, api) };
  }
  current.inst.route(sub);
}

function route() {
  if (!started) return;
  if (!store.user) { welcome(); return; }
  const [, id, ...rest] = location.hash.replace(/^#/, '').split('/');
  if (id === 'mente') {
    const sk = skillById(rest[0]);
    if (sk) { trailPage(sk); return; }
  }
  const game = GAMES.find((g) => g.id === id);
  if (game) openGame(game, rest.join('/'));
  else hub();
}

export function start(opts) {
  audio = opts.audio;
  started = true;
  route();
}

window.addEventListener('hashchange', () => {
  // Âncoras internas do hub (#boas-acoes) não são rotas.
  if (location.hash && !location.hash.startsWith('#/')) return;
  route();
});
document.addEventListener('contextmenu', (e) => e.target.closest('canvas') && e.preventDefault());
document.addEventListener('dblclick', (e) => e.target.closest('canvas') && e.preventDefault(), { passive: false });
