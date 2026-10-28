// Shell do SCHOLA: abertura, cadastro/entrada com avatar-órgão, hub (pontos, trilhas,
// jogos, Boas Ações Cognitivas) e o sistema de Ajuda compartilhado por todos os jogos.
// Cada sub-jogo é um módulo com { id, title, tagline, accent, cover, skills, mount(root, api) }.
import tensa from '../games/tensa/index.js';
import lume from '../games/lume/index.js';
import { SoundEngine } from './audio.js';
import { Store } from './store.js';
import { icons } from './icons.js';
import { SKILLS, AVATARS, DEEDS, avatarById, deedById } from './catalog.js';
import { RANKS, MAX_POINTS, rankFor, fmt } from './scoring.js';

const GAMES = [tensa, lume];
const COMING_SOON = [
  { title: 'Em breve', tagline: 'Um desafio de memória de trabalho', color: '#A78BFA' },
  { title: 'Em breve', tagline: 'Um desafio de lógica e padrões', color: '#3EDBB0' },
];

const app = document.getElementById('app');
const store = new Store();
const audio = new SoundEngine();
audio.soundOn = store.settings.sound;
audio.musicOn = store.settings.music;

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
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
};

// ---------- Abertura ----------
function splash() {
  const el = h(`
    <section class="screen splash" aria-label="Abertura">
      <div class="splash-emblem"><img src="brand/schola-emblem-glow.png" alt=""></div>
      <img class="splash-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <p class="splash-sub">Treino cognitivo em forma de jogo.</p>
      <button class="cta" type="button">Entrar</button>
    </section>`);
  el.addEventListener('click', () => {
    audio.init();
    audio.arpeggio(5);
    haptic(15);
    started = true;
    el.classList.add('out');
    setTimeout(route, 380);
  }, { once: true });
  show(el);
}

// ---------- Cadastro / entrada ----------
function welcome() {
  unmountGame();
  const locals = store.localUsers();
  const el = h(`
    <section class="screen onboard">
      <img class="onboard-word" src="brand/schola-wordmark.png" alt="SCHOLA">
      <h1>Quem está jogando?</h1>
      <div class="onboard-choices">
        <button class="choice" data-act="new">
          <span class="choice-ico">${icons.sparkle}</span>
          <b>Sou novo por aqui</b><small>Crie seu jogador e escolha seu avatar.</small>
        </button>
        <button class="choice" data-act="existing">
          <span class="choice-ico">${icons.user}</span>
          <b>Usuário existente</b><small>Entre com o seu apelido.</small>
        </button>
      </div>
      ${locals.length ? `
        <p class="onboard-label">Neste aparelho</p>
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
      <button class="icon-btn back" data-act="back" aria-label="Voltar">${icons.back}</button>
      <h1>Bem-vindo de volta</h1>
      <form class="form" novalidate>
        <label>Seu apelido<input name="nick" autocomplete="nickname" maxlength="24" required autofocus></label>
        <p class="form-error" aria-live="polite"></p>
        <button class="cta" type="submit">Entrar</button>
      </form>
    </section>`);
  const err = el.querySelector('.form-error');
  el.querySelector('[data-act="back"]').onclick = () => { audio.tick(); welcome(); };
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const nick = e.target.nick.value;
    if (!nick.trim()) { err.textContent = 'Digite seu apelido.'; return; }
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
        <button class="icon-btn back" data-act="back" aria-label="Voltar">${icons.back}</button>
        <p class="step">Passo 1 de 2</p>
        <h1>Crie seu jogador</h1>
        <form class="form" novalidate>
          <label>Apelido<input name="nick" maxlength="24" autocomplete="nickname" required value="${esc(draft.nickname)}"></label>
          <label>Sua cidade<input name="city" maxlength="40" autocomplete="address-level2" placeholder="Ex.: Recife" value="${esc(draft.city)}"></label>
          <p class="form-hint">A cidade aparece no mapa de impacto das Boas Ações Cognitivas.</p>
          <p class="form-error" aria-live="polite"></p>
          <button class="cta" type="submit">Escolher avatar ${icons.next}</button>
        </form>
      </section>`);
    el.querySelector('[data-act="back"]').onclick = () => { audio.tick(); welcome(); };
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      draft.nickname = e.target.nick.value.trim();
      draft.city = e.target.city.value.trim();
      const err = el.querySelector('.form-error');
      if (draft.nickname.length < 2) { err.textContent = 'O apelido precisa ter pelo menos 2 letras.'; return; }
      if (!draft.city) { err.textContent = 'Conte qual é a sua cidade.'; return; }
      audio.tick();
      stepAvatar();
    };
    show(el);
  };

  const stepAvatar = () => {
    const el = h(`
      <section class="screen onboard wide">
        <button class="icon-btn back" data-act="back" aria-label="Voltar">${icons.back}</button>
        <p class="step">Passo 2 de 2</p>
        <h1>Escolha seu avatar</h1>
        <p class="onboard-lead">Cada avatar é um órgão do corpo. O <b>índice de ligação</b> mostra o quanto ele está conectado ao cérebro, a ferramenta principal de todos os jogos.</p>
        <div class="avatar-grid">
          ${AVATARS.map((a) => `
            <button class="avatar-card" data-av="${a.id}" aria-pressed="false">
              <img src="${a.img}" alt="">
              <b>${a.name}</b>
              <span class="link-meter" aria-label="Índice de ligação ${a.link}"><i style="width:${a.link}%"></i></span>
              <span class="link-num">Ligação ${a.link}</span>
              <small>${a.fact}</small>
            </button>`).join('')}
        </div>
        <div class="onboard-foot">
          <p class="form-error" aria-live="polite"></p>
          <button class="cta" data-act="go" disabled>Começar a jogar</button>
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
    <div class="ladder" aria-label="Faixa atual: ${r.name}">
      ${RANKS.map((k, i) => `<span class="rung ${i < r.index ? 'past' : i === r.index ? 'now' : ''}" style="--rc:${k.color}"><i style="${i === r.index ? `width:${Math.max(3, r.frac * 100)}%` : ''}"></i><em>${k.name}</em></span>`).join('')}
    </div>`;
}

function hub() {
  unmountGame();
  const u = store.user;
  const av = avatarById(u.avatar);
  const total = store.totalPoints();
  const overall = total / GAMES.length;
  const rank = rankFor(overall);
  const pending = store.pendingCommitments();

  const el = h(`
    <section class="screen hub">
      <header class="hub-top">
        <img class="hub-word" src="brand/schola-wordmark.png" alt="SCHOLA">
        <button class="me" data-act="me" aria-label="Seu perfil">
          <img src="${av.img}" alt=""><span><b>${esc(u.nickname)}</b><small>${rank.name}</small></span>
        </button>
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${icons.gear}</button>
      </header>

      <section class="hero">
        <div class="hero-main">
          <p class="eyebrow">Sua quilometragem</p>
          <p class="hero-pts"><b>${fmt(total)}</b><span>/ ${fmt(MAX_POINTS * GAMES.length)} pts</span></p>
          <p class="hero-rank" style="--rc:${rank.color}">${rank.name}${rank.next ? ` · faltam ${fmt(rank.next.min - overall)} para ${rank.next.name}` : ''}</p>
        </div>
        ${rankLadder(overall)}
      </section>

      <h2 class="sec-title">Sua Mente</h2>
      <p class="sec-lead">Escolha uma trilha. Cada fase de cada jogo treina uma delas.</p>
      <div class="trails">
        ${SKILLS.map((s) => {
          const pts = store.skillPoints(s.id);
          return `
          <article class="trail" style="--c:${s.color}">
            <div class="trail-img"><img src="${s.img}" alt="" loading="lazy"></div>
            <div class="trail-body">
              <div class="trail-head"><h3>${s.name}</h3><span class="trail-pts">${fmt(pts)} pts</span></div>
              <p>${s.pitch}</p>
              <p class="trail-gain-title">Você vai desenvolver</p>
              <ul>${s.gains.map((g) => `<li>${g}</li>`).join('')}</ul>
            </div>
          </article>`;
        }).join('')}
      </div>

      <h2 class="sec-title">Jogos</h2>
      <div class="games">
        ${GAMES.map((g) => {
          const pts = store.gamePoints(g.id);
          const gr = rankFor(pts);
          const m = store.monthStats(g.id);
          const diff = m.thisMonth - m.lastMonth;
          return `
          <article class="feature" style="--accent:${g.accent}">
            <div class="feature-cover"><img src="${g.cover}" alt="" loading="lazy"><span class="feature-badge">Novo</span></div>
            <div class="feature-body">
              <h3>${g.title}</h3>
              <p class="feature-tag">${g.tagline}</p>
              <div class="feature-stats">
                <div><span>Seus pontos</span><b>${fmt(pts)}</b><small style="color:${gr.color}">${gr.name}</small></div>
                <div><span>Este mês</span><b>+${fmt(m.thisMonth)}</b><small class="${diff >= 0 ? 'up' : 'down'}">${m.lastMonth || m.thisMonth ? `${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))} vs mês passado` : 'Primeiro mês'}</small></div>
              </div>
              <p class="feature-skills-title">Habilidades que expande</p>
              <div class="chips">${g.skills.map((id) => { const s = SKILLS.find((x) => x.id === id); return `<span class="chip" style="--c:${s.color}">${s.name}</span>`; }).join('')}</div>
              <button class="cta" data-game="${g.id}">${icons.play} Jogar ${g.title}</button>
            </div>
          </article>`;
        }).join('')}
        <div class="soon-row">
          ${COMING_SOON.map((c) => `
            <div class="soon" style="--c:${c.color}" aria-disabled="true">
              <span class="soon-ico">${icons.lock}</span>
              <span><b>${c.title}</b><small>${c.tagline}</small></span>
            </div>`).join('')}
        </div>
      </div>

      <h2 class="sec-title" id="boas-acoes">Boas Ações Cognitivas</h2>
      <p class="sec-lead">Cada ajuda pedida num jogo vira um compromisso: melhorar o raciocínio de outra pessoa. Registre aqui o que você fez.</p>
      ${pending.length ? `
        <div class="pending">
          ${pending.map((c) => { const d = deedById(c.deedId); return `
            <div class="pending-item">
              <span class="pending-ico">${icons.heart}</span>
              <span class="pending-txt"><b>${esc(d?.title || c.deedId)}</b><small>Compromisso de ${new Date(c.at).toLocaleDateString('pt-BR')}</small></span>
              <button class="btn-sm" data-done="${c.id}">Registrar</button>
            </div>`; }).join('')}
        </div>` : ''}
      <button class="ghost-btn" data-act="deed">${icons.heart} Registrar uma boa ação</button>
      <div class="deeds-board" aria-live="polite"><p class="muted">Carregando o mural…</p></div>
      <footer class="hub-foot">SCHOLA · ${store.online ? 'mural compartilhado' : 'modo local: o mural mostra só este aparelho'}</footer>
    </section>`);

  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-game]');
    if (g) { audio.tick(); haptic(8); location.hash = `#/${g.dataset.game}`; return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'settings') { audio.tick(); settings(); }
    if (act === 'me') { audio.tick(); profileSheet(); }
    if (act === 'deed') { audio.tick(); deedForm(); }
    const done = e.target.closest('[data-done]');
    if (done) { audio.tick(); const c = pending.find((x) => x.id === done.dataset.done); deedForm(c); }
  });
  show(el);
  loadBoard(el.querySelector('.deeds-board'));
}

async function loadBoard(box) {
  const rows = await store.listDeeds();
  if (!box.isConnected) return;
  if (!rows) { box.innerHTML = '<p class="muted">O mural está fora do ar agora. Tente de novo mais tarde.</p>'; return; }
  if (!rows.length) {
    box.innerHTML = '<p class="muted">Ainda não há boas ações registradas. Seja a primeira pessoa a inspirar o mural!</p>';
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
  const actions = by((r) => r.title);
  const people = rows.reduce((a, r) => a + (r.people || 1), 0);
  const now = new Date();
  const thisMonth = rows.filter((r) => { const d = new Date(r.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const bars = (list, color) => {
    const top = list.slice(0, 5);
    const max = top[0]?.[1] || 1;
    return top.map(([k, n]) => `
      <div class="bar"><span class="bar-label">${esc(k)}</span><span class="bar-track"><i style="width:${(n / max) * 100}%;background:${color}"></i></span><b>${n}</b></div>`).join('');
  };

  box.innerHTML = `
    <div class="board-grid">
      <div class="panel">
        <h3>Placar de boas ações</h3>
        <ol class="leaders">
          ${leaders.map((p, i) => `
            <li><span class="pos">${i + 1}</span><img src="${avatarById(p.avatar).img}" alt=""><span class="who">${esc(p.nickname)}</span><span class="n">${p.n}<small> ações</small></span></li>`).join('')}
        </ol>
      </div>
      <div class="panel">
        <h3>Últimas boas ações</h3>
        <ul class="feed">
          ${rows.slice(0, 6).map((r) => `
            <li><img src="${avatarById(r.avatar).img}" alt="">
              <div><p><b>${esc(r.nickname)}</b> · ${esc(r.title)}</p>
              ${r.note ? `<p class="feed-note">“${esc(r.note)}”</p>` : ''}
              <small>${esc(r.city || 'cidade não informada')} · ${r.people || 1} pessoa${(r.people || 1) > 1 ? 's' : ''} · ${timeAgo(r.created_at)}</small></div></li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="panel dash">
      <h3>Impacto em números</h3>
      <div class="kpis">
        <div class="kpi"><b>${fmt(rows.length)}</b><span>boas ações</span></div>
        <div class="kpi"><b>${fmt(people)}</b><span>pessoas impactadas</span></div>
        <div class="kpi"><b>${fmt(cities.length)}</b><span>cidades de impacto</span></div>
        <div class="kpi"><b>${fmt(thisMonth)}</b><span>neste mês</span></div>
      </div>
      <div class="dash-cols">
        <div><h4>Cidades com mais impacto</h4>${bars(cities, '#38E1FF')}</div>
        <div><h4>Ações mais praticadas</h4>${bars(actions, '#FF4FD8')}</div>
      </div>
    </div>`;
}

// Formulário de registro de boa ação (opcionalmente fechando um compromisso).
function deedForm(commitment) {
  const u = store.user;
  const s = sheet(`
    <header class="sheet-head"><h2>Registrar boa ação</h2><button class="icon-btn" data-close aria-label="Fechar">${icons.close}</button></header>
    <form class="form" novalidate>
      <label>O que você fez
        <select name="deed">${DEEDS.map((d) => `<option value="${d.id}" ${commitment?.deedId === d.id ? 'selected' : ''}>${d.title}</option>`).join('')}</select>
      </label>
      <label>Como foi? (opcional)<textarea name="note" maxlength="280" rows="3" placeholder="Ex.: Li um capítulo para minha avó e ela lembrou dos nomes de todos os personagens."></textarea></label>
      <div class="form-row">
        <label>Cidade<input name="city" maxlength="40" value="${esc(u.city)}"></label>
        <label>Pessoas ajudadas<input name="people" type="number" min="1" max="50" value="1" inputmode="numeric"></label>
      </div>
      <p class="form-hint">${store.online ? 'Sua boa ação aparece no mural para todos os jogadores, com seu apelido e cidade.' : 'Modo local: a boa ação fica salva só neste aparelho.'}</p>
      <p class="form-error" aria-live="polite"></p>
      <button class="cta" type="submit">${icons.heart} Registrar</button>
    </form>`, { label: 'Registrar boa ação' });
  s.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await store.registerDeed({ deedId: f.deed.value, note: f.note.value, city: f.city.value, people: f.people.value, commitmentId: commitment?.id });
      audio.arpeggio(7);
      haptic(20);
      s.close();
      toast('Boa ação registrada. Obrigado por cuidar de outro cérebro!');
      hub();
      setTimeout(() => document.getElementById('boas-acoes')?.scrollIntoView({ behavior: 'smooth' }), 400);
    } catch (err) {
      console.warn(err);
      f.querySelector('.form-error').textContent = 'Não foi possível registrar agora. Tente de novo em instantes.';
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
      <header class="sheet-head"><h2>Ajuda por uma boa ação</h2><button class="icon-btn" data-close aria-label="Fechar">${icons.close}</button></header>
      <p class="sheet-lead">Para destravar a ajuda, escolha uma boa ação que melhore o raciocínio de <b>outra pessoa</b>. Depois de cumprir, registre na página inicial.</p>
      <div class="deed-list">
        ${DEEDS.map((d) => `
          <details class="deed" data-deed="${d.id}">
            <summary><span class="deed-radio"></span><b>${d.title}</b><small>~${d.mins} min</small></summary>
            <p>${d.how}</p>
          </details>`).join('')}
      </div>
      <button class="cta" data-act="commit" disabled>${icons.heart} Eu me comprometo</button>`, { label: 'Ajuda por uma boa ação', wide: true });
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
        toast('Compromisso feito. A ajuda está liberada!');
        resolve(true);
      }
    });
    // Fechou sem se comprometer.
    new MutationObserver((_, obs) => { if (!s.el.isConnected) { obs.disconnect(); if (!committed) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

// ---------- Perfil e ajustes ----------
function profileSheet() {
  const u = store.user;
  const av = avatarById(u.avatar);
  const s = sheet(`
    <header class="sheet-head"><h2>Seu perfil</h2><button class="icon-btn" data-close aria-label="Fechar">${icons.close}</button></header>
    <div class="profile">
      <img src="${av.img}" alt="">
      <div><b>${esc(u.nickname)}</b><small>${esc(u.city)}</small>
        <p>Avatar: ${av.name} · ligação ${av.link}</p></div>
    </div>
    <p class="sheet-lead">${av.fact}</p>
    <button class="ghost-btn" data-act="switch">${icons.user} Trocar de usuário</button>`, { label: 'Seu perfil' });
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
    <header class="sheet-head"><h2>Ajustes</h2><button class="icon-btn" data-close aria-label="Fechar">${icons.close}</button></header>
    ${row('sound', icons.sound, 'Sons')}
    ${row('music', icons.music, 'Música ambiente')}
    ${row('haptics', icons.vibrate, 'Vibração')}
    <button class="danger" data-act="reset">Zerar meus pontos</button>`, { label: 'Ajustes' });
  s.el.addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    store.setSetting(k, e.target.checked);
    if (k === 'sound') audio.setSound(e.target.checked);
    if (k === 'music') audio.setMusic(e.target.checked);
    audio.tick();
  });
  s.el.querySelector('[data-act="reset"]').onclick = () => {
    if (!confirm('Zerar todos os seus pontos? As boas ações registradas continuam no mural.')) return;
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
  const game = GAMES.find((g) => g.id === id);
  if (game) openGame(game, rest.join('/'));
  else hub();
}

window.addEventListener('hashchange', route);
document.addEventListener('contextmenu', (e) => e.target.closest('canvas') && e.preventDefault());
document.addEventListener('dblclick', (e) => e.target.closest('canvas') && e.preventDefault(), { passive: false });

splash();
