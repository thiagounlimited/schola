// Usuários, pontos, compromissos e boas ações.
// Salva sempre no aparelho; quando o Supabase está configurado (js/config.js),
// também sincroniza perfis e publica as boas ações no mural compartilhado.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { deedById } from './catalog.js';

const KEY = 'schola.v2';
const ONLINE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const fresh = () => ({ settings: { sound: true, music: true, haptics: true }, current: null, users: {}, deeds: [] });
const keyOf = (nick) => nick.trim().toLowerCase().replace(/\s+/g, ' ');
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function api(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  // Prefer: return=minimal responde 201 sem corpo.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export class Store {
  constructor() {
    this.online = ONLINE;
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        this.data = { ...fresh(), ...saved, settings: { ...fresh().settings, ...saved.settings } };
      }
    } catch { /* armazenamento indisponível: segue só na memória */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignora */ }
  }

  get settings() { return this.data.settings; }
  setSetting(k, v) { this.data.settings[k] = v; this.save(); }

  // ---------- Usuários ----------
  get user() { return this.data.current ? this.data.users[this.data.current] || null : null; }
  localUsers() { return Object.values(this.data.users).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); }

  _blank({ nickname, city, avatar }) {
    return {
      id: keyOf(nickname), nickname: nickname.trim(), city: city.trim(), avatar,
      createdAt: Date.now(), lastSeen: Date.now(),
      games: {}, history: [], commitments: [], freeMinutes: 0,
    };
  }

  async register({ nickname, city, avatar }) {
    const id = keyOf(nickname);
    if (id.length < 2) return { ok: false, error: 'Escolha um apelido com pelo menos 2 letras.' };
    if (this.data.users[id]) return { ok: false, error: 'Esse apelido já existe neste aparelho. Entre como usuário existente.' };
    const prof = this._blank({ nickname, city, avatar });
    if (this.online) {
      try {
        const found = await api(`profiles?id=eq.${encodeURIComponent(id)}&select=id`);
        if (found.length) return { ok: false, error: 'Esse apelido já está em uso. Tente outro.' };
        await api('profiles', { method: 'POST', body: this._row(prof), prefer: 'return=minimal' });
      } catch (e) {
        console.warn('SCHOLA: falha ao criar perfil online', e);
        return { ok: false, error: 'Sem conexão com o servidor agora. Tente de novo em instantes.' };
      }
    }
    this.data.users[id] = prof;
    this.data.current = id;
    this.save();
    return { ok: true };
  }

  async login(nickname) {
    const id = keyOf(nickname);
    let prof = this.data.users[id];
    if (this.online) {
      try {
        const rows = await api(`profiles?id=eq.${encodeURIComponent(id)}&select=*`);
        if (rows.length) prof = this._fromRow(rows[0], prof);
      } catch (e) {
        console.warn('SCHOLA: falha ao buscar perfil online', e);
      }
    }
    if (!prof) return { ok: false, error: 'Não encontramos esse apelido. Confira a grafia ou crie um usuário novo.' };
    prof.lastSeen = Date.now();
    this.data.users[id] = prof;
    this.data.current = id;
    this.save();
    return { ok: true };
  }

  logout() { this.data.current = null; this.save(); }

  _row(p) {
    return {
      id: p.id, nickname: p.nickname, avatar: p.avatar, city: p.city,
      data: { games: p.games, history: p.history.slice(-400), commitments: p.commitments, freeMinutes: p.freeMinutes, focusMinutes: p.focusMinutes || 0 },
      updated_at: new Date().toISOString(),
    };
  }

  // Combina o perfil do servidor com o local: fica com o melhor resultado de cada fase.
  _fromRow(row, local) {
    const d = row.data || {};
    const prof = local || this._blank({ nickname: row.nickname, city: row.city || '', avatar: row.avatar });
    prof.nickname = row.nickname;
    prof.avatar = row.avatar;
    prof.city = row.city || prof.city;
    for (const [g, gd] of Object.entries(d.games || {})) {
      const mine = (prof.games[g] ||= { levels: {} });
      for (const [lv, rec] of Object.entries(gd.levels || {})) {
        if (!mine.levels[lv] || rec.points > mine.levels[lv].points) mine.levels[lv] = rec;
      }
    }
    const seen = new Set(prof.history.map((h) => `${h.t}:${h.game}`));
    for (const h of d.history || []) if (!seen.has(`${h.t}:${h.game}`)) prof.history.push(h);
    prof.history.sort((a, b) => a.t - b.t);
    const commits = new Set(prof.commitments.map((c) => c.id));
    for (const c of d.commitments || []) if (!commits.has(c.id)) prof.commitments.push(c);
    prof.freeMinutes = Math.max(prof.freeMinutes || 0, d.freeMinutes || 0);
    prof.focusMinutes = Math.max(prof.focusMinutes || 0, d.focusMinutes || 0);
    return prof;
  }

  _sync() {
    if (!this.online || !this.user) return;
    clearTimeout(this._syncTimer);
    const row = this._row(this.user);
    this._syncTimer = setTimeout(() => {
      api('profiles', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' })
        .catch((e) => console.warn('SCHOLA: sincronização adiada', e));
    }, 800);
  }

  // ---------- Pontos ----------
  game(gameId) { return (this.user.games[gameId] ||= { levels: {} }); }

  gamePoints(gameId) {
    const g = this.user?.games[gameId];
    return g ? Object.values(g.levels).reduce((a, r) => a + r.points, 0) : 0;
  }

  totalPoints() {
    return this.user ? Object.keys(this.user.games).reduce((a, g) => a + this.gamePoints(g), 0) : 0;
  }

  // Pontos ganhos neste mês e no mês passado (a partir do histórico de ganhos).
  monthStats(gameId) {
    const now = new Date();
    const cur = monthKey(now);
    const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const out = { thisMonth: 0, lastMonth: 0 };
    for (const h of this.user?.history || []) {
      if (gameId && h.game !== gameId) continue;
      const m = monthKey(new Date(h.t));
      if (m === cur) out.thisMonth += h.pts;
      else if (m === prev) out.lastMonth += h.pts;
    }
    return out;
  }

  skillPoints(skillId) {
    let pts = 0;
    for (const g of Object.values(this.user?.games || {}))
      for (const r of Object.values(g.levels)) if (r.skill === skillId) pts += r.points;
    if (skillId === 'criatividade') pts += (this.user?.freeMinutes || 0) * 2000;
    if (skillId === 'atencao') pts += (this.user?.focusMinutes || 0) * 2000;
    return pts;
  }

  // Guarda o melhor resultado da fase; só a melhora entra no histórico.
  saveLevel(gameId, levelId, { points, stars, skill }) {
    const g = this.game(gameId);
    const prev = g.levels[levelId]?.points || 0;
    if (points > prev) {
      g.levels[levelId] = { points, stars: Math.max(stars, g.levels[levelId]?.stars || 0), skill, at: Date.now() };
      this.user.history.push({ t: Date.now(), game: gameId, pts: points - prev });
      this.save();
      this._sync();
    }
    return { prev, best: Math.max(prev, points), gained: Math.max(0, points - prev) };
  }

  // Minutos de modo livre: Treino livre do Tensa conta para Criatividade, Respiro do Lume para Atenção.
  addFreeMinute(skill = 'criatividade') {
    if (!this.user) return;
    if (skill === 'atencao') this.user.focusMinutes = (this.user.focusMinutes || 0) + 1;
    else this.user.freeMinutes = (this.user.freeMinutes || 0) + 1;
    this.save();
    this._sync();
  }

  // ---------- Compromissos e boas ações ----------
  commit(deedId, ctx = {}) {
    const c = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, deedId, at: Date.now(), ...ctx };
    this.user.commitments.push(c);
    this.save();
    this._sync();
    return c;
  }

  pendingCommitments() { return (this.user?.commitments || []).filter((c) => !c.doneAt); }

  async registerDeed({ deedId, note, city, people, commitmentId }) {
    const u = this.user;
    const d = deedById(deedId);
    const row = {
      profile_id: u.id, nickname: u.nickname, avatar: u.avatar,
      deed_id: deedId, title: d ? d.title : deedId,
      note: (note || '').slice(0, 280), city: (city || u.city || '').trim().slice(0, 60),
      people: Math.max(1, Math.min(50, Number(people) || 1)),
      created_at: new Date().toISOString(),
    };
    if (this.online) {
      await api('deeds', { method: 'POST', body: row, prefer: 'return=minimal' });
    } else {
      this.data.deeds.unshift(row);
    }
    const c = u.commitments.find((x) => x.id === commitmentId);
    if (c) c.doneAt = Date.now();
    this.save();
    this._sync();
  }

  async listDeeds() {
    if (!this.online) return this.data.deeds;
    try {
      return await api('deeds?select=nickname,avatar,deed_id,title,note,city,people,created_at&order=created_at.desc&limit=500');
    } catch (e) {
      console.warn('SCHOLA: mural indisponível', e);
      return null;
    }
  }

  resetUser() {
    const u = this.user;
    if (!u) return;
    Object.assign(u, { games: {}, history: [], commitments: [], freeMinutes: 0, focusMinutes: 0 });
    this.save();
    this._sync();
  }
}
