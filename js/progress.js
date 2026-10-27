// Progresso salvo no próprio aparelho (localStorage).
// Estrelas por fase e XP por habilidade cognitiva.

const KEY = 'schola.v1';
const XP_PER_LEVEL = 6;

const fresh = () => ({
  settings: { sound: true, music: true, haptics: true },
  xp: {},
  games: {},
});

export class Progress {
  constructor() {
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

  game(id) {
    return (this.data.games[id] ||= { stars: {} });
  }

  // Guarda a melhor marca e converte estrelas novas em XP das habilidades da fase.
  saveLevel(gameId, levelId, stars, skills = []) {
    const g = this.game(gameId);
    const prev = g.stars[levelId] || 0;
    if (stars > prev) {
      g.stars[levelId] = stars;
      for (const s of skills) this.data.xp[s] = (this.data.xp[s] || 0) + (stars - prev);
      this.save();
    }
    return { prev, best: Math.max(prev, stars) };
  }

  addXP(skill, n = 1) {
    this.data.xp[skill] = (this.data.xp[skill] || 0) + n;
    this.save();
  }

  skill(id) {
    const xp = this.data.xp[id] || 0;
    return { xp, level: 1 + Math.floor(xp / XP_PER_LEVEL), frac: (xp % XP_PER_LEVEL) / XP_PER_LEVEL };
  }

  reset() {
    const settings = this.data.settings;
    this.data = { ...fresh(), settings };
    this.save();
  }
}
