// Lume: motor do jogo. Uma luz de foco (o dedo), chamas que crescem sob o feixe,
// resíduo de atenção (fios de tarefas abandonadas no meio), estacionar, Fluxo e distrações.
import { noteFreq } from '../../js/audio.js';
import { L as tr } from '../../js/i18n.js';

const TAU = Math.PI * 2;
const KINDS = {
  task: { core: '#FFB547', glow: '255,170,60', name: tr('âmbar', 'amber') },
  mini: { core: '#B794FF', glow: '167,139,250', name: tr('violeta', 'violet') },
  urgent: { core: '#38E1FF', glow: '56,225,255', name: tr('sinal', 'signal') },
};
const FLOW_FULL = 6;       // segundos contínuos na mesma chama para o Fluxo máximo
const RESIDUE_SLOW = 0.25; // cada fio aberto deixa o feixe 25% mais lento
const RESIDUE_MIN = 0.35;
const GRACE = 1.45;        // margem de toque em volta da chama
const PARK_COST = 0.5;
const BAIT_DEFAULT = 50;
const BREATH = 10;         // ciclo do Respiro: 4 s crescendo, 6 s diminuindo

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => x * x * (3 - 2 * x);

export class Board {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.free = level.mode === 'free';
    this.dust = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4, v: 0.004 + Math.random() * 0.01, p: Math.random() * TAU }));

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._frame = this._frame.bind(this);
    const c = canvas;
    c.addEventListener('pointerdown', this._down);
    c.addEventListener('pointermove', this._move);
    c.addEventListener('pointerup', this._up);
    c.addEventListener('pointercancel', this._up);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(c);

    this.helpOn = false;
    this.restart();
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._up);
    this.hooks.audio.setFlow?.(0);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(this, { w: r.width, h: r.height, dpr });
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.R = clamp(Math.min(r.width, r.height) * 0.075, 24, 58);
    this._draw();
  }

  restart() {
    const L = this.level;
    this.t = 0;
    this.energy = L.energy;
    this.flames = L.flames.map((f, i) => {
      const fl = { ...f, i, kind: f.kind || 'task', progress: 0, done: false, open: false, parked: false, gone: false, phase: i * 1.7 + 0.4, milestone: 0 };
      fl.visible = f.at == null && !f.trigger;
      if (fl.visible) this._born(fl, 0);
      return fl;
    });
    this.bubbles = [];
    this.nextBubble = L.bubbles ? L.bubbles.every * 0.8 : Infinity;
    this.ptr = null;
    this.focus = null;
    this.lastFlame = null;
    this.flowStreak = 0;
    this.lux = 0;
    this.doneCount = 0;
    this.anchor = null;
    this.fx = [];
    this.floaters = [];
    this.ended = false;
    this.touched = false;
    this.told = new Set();
    this.minutes = 0;
    this.stats = { interruptions: 0, residue: 0, ctx: 0, bait: 0, baitPts: 0, resisted: 0, bubbles: 0, missed: 0, parked: 0, focusTime: 0, flowTime: 0 };
    this._statusAt = 0;
    this._status();
  }

  enableHelp() { this.helpOn = true; }

  // ---------- Regras ----------
  _born(f, t) {
    f.visible = true;
    f.bornAt = t;
    if (f.kind === 'urgent' && f.deadline) f.expires = t + f.deadline;
    else if (f.until != null) f.expires = f.until;
  }

  _pos(f) {
    const a = this._area();
    const tt = this.t * f.sp + f.phase;
    const nx = f.x + f.ax * Math.sin(tt);
    const ny = f.y + f.ay * Math.sin(tt * 1.37 + f.phase * 0.7);
    return { x: a.x + nx * a.w, y: a.y + ny * a.h };
  }

  _area() {
    const R = this.R;
    return { x: R * 1.1, y: R * 1.1, w: this.w - R * 2.2, h: this.h - R * 2.2 - 26 };
  }

  _radius(f) {
    const base = this.R * (f.kind === 'mini' ? 0.78 : f.kind === 'urgent' ? 0.74 : 1);
    return base * (this.level.breathe ? this._breath().scale : 1);
  }

  _breath() {
    const c = this.t % BREATH;
    const k = c < 4 ? ease(c / 4) : 1 - ease((c - 4) / 6);
    return { k, inhale: c < 4, scale: 0.85 + 0.35 * k };
  }

  _live() { return this.flames.filter((f) => f.visible && !f.done && !f.gone); }

  _flameAt(p) {
    let best = null;
    let bd = Infinity;
    for (const f of this._live()) {
      const q = this._pos(f);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < this._radius(f) * GRACE && d < bd) { best = f; bd = d; }
    }
    return best;
  }

  _bubbleAt(p) {
    const rb = this.R * 0.62;
    return this.bubbles.find((b) => !b.out && Math.hypot(b.px - p.x, b.py - p.y) < rb * 1.25);
  }

  flow() { return clamp(this.flowStreak / FLOW_FULL, 0, 1); }

  _rate() {
    const open = this.flames.filter((f) => f.open && f !== this.focus && !f.done && !f.gone).length;
    const slow = Math.max(RESIDUE_MIN, 1 - RESIDUE_SLOW * open);
    return slow * (1 + 0.25 * this.flow());
  }

  _tell(key, text) {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.hooks.onMessage(text);
  }

  _spend(v) {
    if (Number.isFinite(this.energy)) this.energy = Math.max(0, this.energy - v);
  }

  _enter(g) {
    const prev = this.lastFlame;
    const L = this.level;
    const { audio } = this.hooks;
    this.touched = true;
    if (prev && prev !== g && !prev.done && !prev.gone && prev.progress > 0 && !prev.parked) {
      prev.open = true;
      this.stats.residue++;
      this.stats.interruptions++;
      this.flowStreak = 0;
      this._spend(L.switchCost || 0);
      this._float(this._pos(prev), tr(`−${L.switchCost || 0} luz`, `−${L.switchCost || 0} light`), '#FF8FD8');
      audio.nope();
      this._tell('residue', L.park
        ? tr('Ficou um fio: resíduo de atenção. Da próxima vez, estacione (⚓) antes de trocar.', 'A thread was left: attention residue. Next time, park (⚓) before switching.')
        : tr('Trocar no meio deixa um fio: resíduo de atenção. Ele deixa sua luz mais lenta até você fechar aquela chama.', 'Switching halfway leaves a thread: attention residue. It slows your light until you close that flame.'));
    } else if (prev && prev !== g && L.ctxCost && prev.kind !== g.kind && prev.kind !== 'urgent' && g.kind !== 'urgent') {
      this.stats.ctx++;
      this.stats.interruptions++;
      this.flowStreak = 0;
      this._spend(L.ctxCost);
      this._float(this._pos(g), tr(`−${L.ctxCost} luz`, `−${L.ctxCost} light`), '#B794FF');
      this._tell('ctx', tr('Mudança de contexto custa luz. Agrupe as chamas do mesmo tipo.', 'Context switching costs light. Group flames of the same kind.'));
    }
    g.parked = false;
    g.open = false;
    this.lastFlame = g;
    const q = this._pos(g);
    audio.pluck(noteFreq(4 + (g.i % 5)), 0.28, (q.x / this.w) * 2 - 1, 1.2);
    this.hooks.haptic(8);
  }

  _complete(f) {
    const { audio } = this.hooks;
    f.done = true;
    f.open = false;
    f.doneAt = this.t;
    if (f.kind !== 'urgent') this.doneCount++;
    this.lux += f.lux || 0;
    const q = this._pos(f);
    this._burst(q.x, q.y, KINDS[f.kind].core, 26);
    [0, 2, 4].forEach((s, k) => setTimeout(() => audio.chime(noteFreq(8 + s + (f.i % 3)), 0.55, (q.x / this.w) * 2 - 1), k * 90));
    this.hooks.haptic(22);
    if (f.lux) this._float(q, `+${f.lux} ✦`, '#FFD23F');
    if (f.kind === 'urgent') this.hooks.onMessage(tr('Sinal atendido. Agora volte para o que estava fazendo.', 'Signal handled. Now go back to what you were doing.'));
    this.focus = null;
  }

  _park(f) {
    f.parked = true;
    f.open = false;
    this.stats.parked++;
    this.anchor = null;
    this._spend(PARK_COST);
    const q = this._pos(f);
    this._ring(q.x, q.y, '#38E1FF');
    this.hooks.audio.chime(noteFreq(3), 0.5);
    this.hooks.haptic(12);
    this._tell('park', tr('Estacionado: você anotou onde parou. Sem fio, sem resíduo.', 'Parked: you noted where you stopped. No thread, no residue.'));
  }

  _bait(b) {
    const L = this.level;
    b.out = true;
    b.taken = true;
    this.stats.bait++;
    this.stats.interruptions++;
    const pts = b.bait ?? BAIT_DEFAULT;
    this.stats.baitPts += pts;
    this.flowStreak = 0;
    this._spend((L.switchCost || 0) * 0.6);
    const prev = this.lastFlame;
    if (prev && !prev.done && !prev.gone && prev.progress > 0 && !prev.parked) prev.open = true;
    this._burst(b.px, b.py, b.decoy ? '#38E1FF' : '#FF4FD8', 12);
    this._float({ x: b.px, y: b.py }, `+${pts}`, '#FF8FD8');
    this.hooks.audio.pop((b.px / this.w) * 2 - 1);
    this.hooks.haptic(15);
    if (b.decoy) this._tell('decoy', tr('Era ruído: sinais reais são losangos. Bolhas redondas, mesmo ciano, são distração.', 'That was noise: real signals are diamonds. Round bubbles, even cyan ones, are distractions.'));
    else this._tell('bait', tr(`Distração: +${pts} agora, mas o Fluxo zerou${prev && !prev.done ? ' e ficou um fio' : ''}.`, `Distraction: +${pts} now, but your Flow reset${prev && !prev.done ? ' and a thread was left' : ''}.`));
  }

  _spawnBubble() {
    const cfg = this.level.bubbles;
    const a = this._area();
    const R = this.R;
    let px, py;
    for (let k = 0; k < 12; k++) {
      px = a.x + Math.random() * a.w;
      py = a.y + Math.random() * a.h;
      if (this._live().every((f) => { const q = this._pos(f); return Math.hypot(q.x - px, q.y - py) > R * 2.4; })) break;
    }
    const decoy = Math.random() < (cfg.decoy || 0);
    let bait = null;
    if (cfg.bait) {
      const [lo, hi] = cfg.bait;
      bait = Math.round((lo + (hi - lo) * Math.random() ** 2.2) / 10) * 10;
    }
    this.bubbles.push({ px, py, born: this.t, life: cfg.life, decoy, bait, icon: Math.floor(Math.random() * 3), ph: Math.random() * TAU });
    this.stats.bubbles++;
    this.hooks.audio.pluck(noteFreq(decoy ? 11 : 13), 0.13, (px / this.w) * 2 - 1, 0.35);
  }

  // ---------- Toque ----------
  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _down(e) {
    if (this.ended) return;
    const p = this._pt(e);
    if (this.anchor) {
      const q = this._anchorPos();
      if (q && Math.hypot(q.x - p.x, q.y - p.y) < 30) { this._park(this.anchor.f); return; }
    }
    if (!this._flameAt(p)) {
      const b = this._bubbleAt(p);
      if (b) { this._bait(b); return; }
    }
    if (this.ptr) return; // um feixe só
    this.ptr = { id: e.pointerId, ...p };
    this.anchor = null;
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* ponteiro já liberado */ }
  }

  _move(e) {
    if (this.ptr && e.pointerId === this.ptr.id) Object.assign(this.ptr, this._pt(e));
  }

  _up(e) {
    if (!this.ptr || e.pointerId !== this.ptr.id) return;
    const f = this.focus || this.lastFlame;
    if (this.level.park && f && !f.done && !f.gone && f.progress > 0 && f.kind !== 'urgent' && !f.parked) {
      this.anchor = { f, until: this.t + 2.8 };
    }
    this.ptr = null;
    this.focus = null;
  }

  _anchorPos() {
    const f = this.anchor?.f;
    if (!f || f.done || f.gone) return null;
    const q = this._pos(f);
    const r = this._radius(f);
    return { x: q.x + r * 1.25, y: q.y - r * 1.25 };
  }

  // ---------- Passo ----------
  // Pausa (folha de Ajuda aberta): o tempo da fase para, mas a tela continua desenhando.
  pause(on) {
    this.paused = on;
    if (on) { this.ptr = null; this.focus = null; this.hooks.audio.setFlow?.(0); }
  }

  step(dt) {
    if (this.paused) return;
    if (this.ended) { this.t += dt; this._fx(dt); return; }
    const L = this.level;
    this.t += dt;
    const t = this.t;

    // chamas que chegam
    for (const f of this.flames) {
      if (f.visible || f.done || f.gone) continue;
      const due = f.at != null ? t >= f.at
        : f.trigger ? this.flames.some((o) => o.kind === 'task' && o.progress / o.need >= f.trigger.progress) : false;
      if (due) {
        this._born(f, t);
        const q = this._pos(f);
        this._ring(q.x, q.y, KINDS[f.kind].core);
        if (f.kind === 'urgent') {
          this.hooks.audio.chime(noteFreq(12), 0.6);
          setTimeout(() => this.hooks.audio.chime(noteFreq(14), 0.5), 160);
          this.hooks.haptic(30);
          this._tell('urgent', L.park ? tr('Sinal ciano! Levante o dedo, estacione (⚓) e então atenda.', 'Cyan signal! Lift your finger, park (⚓), then answer it.') : tr('Sinal ciano: atenda antes que o tempo acabe.', 'Cyan signal: answer it before time runs out.'));
        }
      }
    }
    // chamas que vencem
    for (const f of this.flames) {
      if (!f.visible || f.done || f.gone || f.expires == null || t < f.expires) continue;
      f.gone = true;
      f.goneAt = t;
      f.open = false;
      if (this.focus === f) this.focus = null;
      if (f.kind === 'urgent') {
        this.stats.missed++;
        this.stats.interruptions++;
        this._spend(4);
        this.hooks.audio.nope();
        this.hooks.onMessage(tr('Um sinal real passou sem resposta. Quase! Ele custou 4 de luz.', 'A real signal went unanswered. Almost! It cost 4 light.'));
      } else {
        this.hooks.onMessage(tr('Essa chama se apagou antes de ser feita.', 'That flame faded before it was done.'));
      }
    }

    // distrações
    const cfg = L.bubbles;
    if (cfg && t >= this.nextBubble) {
      this._spawnBubble();
      const every = cfg.ramp ? cfg.every + (cfg.ramp - cfg.every) * clamp(t / 30, 0, 1) : cfg.every;
      this.nextBubble = t + every * (0.75 + Math.random() * 0.5);
    }
    for (const b of this.bubbles) {
      if (!b.out && t - b.born > b.life) { b.out = true; b.outAt = t; this.stats.resisted++; }
    }
    this.bubbles = this.bubbles.filter((b) => !b.out || (b.outAt != null && t - b.outAt < 0.5));

    // foco
    if (this.ptr) {
      const keep = this.focus && !this.focus.done && !this.focus.gone && (() => {
        const q = this._pos(this.focus);
        return Math.hypot(q.x - this.ptr.x, q.y - this.ptr.y) < this._radius(this.focus) * GRACE;
      })();
      const cand = keep ? this.focus : this._flameAt(this.ptr);
      if (cand && cand !== this.focus) this._enter(cand);
      this.focus = cand;
      this._spend(dt);
    } else {
      this.focus = null;
    }
    const f = this.focus;
    if (f) {
      f.progress += dt * this._rate();
      this.flowStreak += dt;
      this.stats.focusTime += dt;
      if (this.flow() >= 0.6) this.stats.flowTime += dt;
      const m = Math.floor((f.progress / f.need) * 4);
      if (Number.isFinite(f.need) && m > f.milestone && m < 4) {
        f.milestone = m;
        this.hooks.audio.chime(noteFreq(5 + m * 2), 0.3, 0);
      }
      if (f.progress >= f.need) this._complete(f);
      if (this.free && Math.floor(this.stats.focusTime / 60) > this.minutes) {
        this.minutes++;
        this.hooks.onFocusMinute?.();
      }
    } else {
      this.flowStreak = Math.max(0, this.flowStreak - dt * 2);
    }
    if (this.anchor && t > this.anchor.until) this.anchor = null;
    this.hooks.audio.setFlow?.(f ? this.flow() : this.flow() * 0.5);

    this._fx(dt);
    this._check();
    if (t - this._statusAt > 0.2) { this._statusAt = t; this._status(); }
  }

  _check() {
    if (this.free || this.ended) return;
    const L = this.level;
    const work = this.flames.filter((f) => f.kind !== 'urgent');
    let won = false;
    let lost = null;
    if (L.goalLux) {
      won = this.lux >= L.goalLux;
      const reach = this.lux + this._live().filter((f) => f.kind !== 'urgent').reduce((a, f) => a + (f.lux || 0), 0);
      if (!won && reach < L.goalLux) lost = tr('Não sobrou brilho suficiente para a meta.', 'Not enough glow was left to reach the goal.');
    } else if (L.goalCount) {
      won = this.doneCount >= L.goalCount;
      const possible = this.doneCount + work.filter((f) => !f.done && !f.gone).length;
      if (!won && possible < L.goalCount) lost = tr('Chamas demais se apagaram antes de serem feitas.', 'Too many flames faded before they were done.');
    } else {
      won = work.every((f) => f.done);
      if (!won && work.some((f) => f.gone)) lost = tr('Uma chama se apagou antes de ser feita.', 'A flame faded before it was done.');
    }
    if (!won && !lost && this.energy <= 0) lost = tr('Sua luz acabou antes da meta.', 'Your light ran out before the goal.');
    if (won) this._end(true);
    else if (lost) this._end(false, lost);
  }

  _end(won, reason) {
    this.ended = true;
    this.ptr = null;
    this.focus = null;
    this.anchor = null;
    this.hooks.audio.setFlow?.(0);
    this._status();
    const s = this.stats;
    const result = {
      ...s,
      flowShare: s.focusTime > 0 ? s.flowTime / s.focusTime : 0,
      energyLeft: this.energy,
      done: this.doneCount,
      lux: this.lux,
      helpUsed: this.helpOn,
    };
    Object.assign(this, { won, result, reason });
    setTimeout(() => {
      if (won) { this.hooks.audio.arpeggio(6); this.hooks.onWin(result); }
      else { this.hooks.audio.nope(); this.hooks.onLose(reason, result); }
    }, won ? 900 : 600);
  }

  _status() {
    const L = this.level;
    const work = this.flames.filter((f) => f.kind !== 'urgent');
    this.hooks.onStatus({
      energy: this.energy,
      done: this.doneCount,
      total: L.goalCount || work.length,
      lux: this.lux,
      goalLux: L.goalLux,
      interruptions: this.stats.interruptions,
      minutes: Math.floor(this.stats.focusTime / 60),
      seconds: Math.floor(this.stats.focusTime),
    });
  }

  // Sugestão da Ajuda: o próximo passo mais sensato.
  recommend() {
    const live = this._live();
    if (!live.length) return null;
    const urgent = live.find((f) => f.kind === 'urgent');
    const open = this.lastFlame && !this.lastFlame.done && !this.lastFlame.gone && this.lastFlame.progress > 0 && !this.lastFlame.parked ? this.lastFlame : null;
    if (urgent) return open && this.level.park ? open : urgent;
    if (open) return open;
    const started = live.find((f) => f.progress > 0);
    if (started) return started;
    if (this.level.goalLux) return live.slice().sort((a, b) => (b.lux || 0) / b.need - (a.lux || 0) / a.need)[0];
    const timed = live.filter((f) => f.expires != null).sort((a, b) => a.expires - b.expires);
    if (timed.length) return timed[0];
    const same = this.lastFlame && live.find((f) => f.kind === this.lastFlame.kind);
    return same || live[0];
  }

  // ---------- Efeitos ----------
  _burst(x, y, color, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const v = 40 + Math.random() * 140;
      this.fx.push({ type: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.9 + Math.random() * 0.6, age: 0, color, s: 1 + Math.random() * 2.2 });
    }
  }

  _ring(x, y, color) { this.fx.push({ type: 'r', x, y, life: 0.8, age: 0, color }); }

  _float(q, text, color) { this.floaters.push({ x: q.x, y: q.y, text, color, age: 0, life: 1.4 }); }

  _fx(dt) {
    for (const p of this.fx) {
      p.age += dt;
      if (p.type === 'p') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 - 20 * dt; }
    }
    this.fx = this.fx.filter((p) => p.age < p.life);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < f.life);
  }

  // ---------- Laço ----------
  _frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  }

  // ---------- Desenho ----------
  _draw() {
    const { ctx, w, h, dpr } = this;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05050c';
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(40, 30, 80, 0.35)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    this._drawDust();

    const L = this.level;
    const showHidden = !L.hidden || this.helpOn;
    this._drawBeam();
    if (showHidden) this._drawThreads();
    for (const b of this.bubbles) this._drawBubble(b);
    const rec = this.helpOn && !this.ended ? this.recommend() : null;
    const parkFirst = rec && rec.kind !== 'urgent' && L.park && this._live().some((f) => f.kind === 'urgent');
    for (const f of this.flames) if (f.visible) this._drawFlame(f, f === rec && (parkFirst ? tr('estacione antes ⚓', 'park first ⚓') : tr('agora esta', 'this one now')));
    this._drawAnchor();
    this._drawFx();
    if (L.tutorial && !this.touched) this._drawTutorial();
    if (L.breathe) this._drawBreath();
    if (!this.free) this._drawMeters();
  }

  _drawDust() {
    const { ctx, w, h, t } = this;
    for (const d of this.dust) {
      const y = ((d.y - t * d.v) % 1 + 1) % 1;
      const a = 0.12 + 0.12 * Math.sin(t * 0.8 + d.p);
      ctx.fillStyle = `rgba(180, 200, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(d.x * w + Math.sin(t * 0.3 + d.p) * 6, y * h, d.s, 0, TAU);
      ctx.fill();
    }
  }

  _drawBeam() {
    const { ctx, ptr } = this;
    if (!ptr) return;
    const fl = this.flow();
    const R = this.R;
    const top = R * 0.35;
    const bot = R * (1.05 + 0.45 * fl);
    const g = ctx.createLinearGradient(0, 0, 0, ptr.y);
    g.addColorStop(0, `rgba(56, 225, 255, ${0.02})`);
    g.addColorStop(1, `rgba(56, 225, 255, ${0.16 + 0.16 * fl})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ptr.x - top, -10);
    ctx.lineTo(ptr.x + top, -10);
    ctx.lineTo(ptr.x + bot, ptr.y);
    ctx.lineTo(ptr.x - bot, ptr.y);
    ctx.closePath();
    ctx.fill();
    const spot = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, bot * 1.5);
    spot.addColorStop(0, `rgba(120, 235, 255, ${0.22 + 0.2 * fl})`);
    spot.addColorStop(1, 'rgba(56, 225, 255, 0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(ptr.x, ptr.y, bot * 1.5, 0, TAU);
    ctx.fill();
  }

  _drawThreads() {
    const { ctx, t } = this;
    const you = this.ptr || { x: this.w / 2, y: this.h - 30 };
    for (const f of this.flames) {
      if (!f.visible || f.done || f.gone) continue;
      const q = this._pos(f);
      if (f.open && f !== this.focus) {
        const mx = (q.x + you.x) / 2 + Math.sin(t * 2 + f.phase) * 18;
        const my = (q.y + you.y) / 2 + 40 + Math.cos(t * 1.6 + f.phase) * 12;
        const g = ctx.createLinearGradient(q.x, q.y, you.x, you.y);
        g.addColorStop(0, 'rgba(255, 181, 71, 0.75)');
        g.addColorStop(1, 'rgba(255, 79, 216, 0.55)');
        ctx.save();
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(255, 79, 216, 0.8)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.quadraticCurveTo(mx, my, you.x, you.y);
        ctx.stroke();
        ctx.restore();
      }
      if (f.parked) {
        const r = this._radius(f);
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 225, 255, 0.55)';
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * 1.32, 0, TAU);
        ctx.stroke();
        ctx.restore();
        ctx.font = `${Math.round(r * 0.5)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(160, 240, 255, 0.9)';
        ctx.fillText('⚓', q.x + r * 0.95, q.y + r * 0.95);
      }
    }
  }

  _drawFlame(f, recommended) {
    const { ctx, t } = this;
    const L = this.level;
    const K = KINDS[f.kind];
    const q = this._pos(f);
    const r = this._radius(f);
    let alpha = 1;
    if (f.done) { alpha = 1 - clamp((t - f.doneAt) / 0.8, 0, 1); if (alpha <= 0) return; }
    if (f.gone) { alpha = 1 - clamp((t - f.goneAt) / 1.2, 0, 1); if (alpha <= 0) return; }
    const appear = clamp((t - (f.bornAt ?? 0)) / 0.5, 0, 1);
    const p = Number.isFinite(f.need) ? clamp(f.progress / f.need, 0, 1) : 0.6;
    const showProg = !L.hidden || this.helpOn || f === this.focus;
    const pv = showProg ? p : 0.35;
    const active = f === this.focus;
    const flick = Math.sin(t * 9 + f.phase) * 0.5 + Math.sin(t * 13.7 + f.phase * 2) * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha * ease(appear) * (f.gone ? 0.6 : 1);
    ctx.translate(q.x, q.y);
    if (f.done) ctx.translate(0, -(t - f.doneAt) * 40);

    // halo
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
    halo.addColorStop(0, `rgba(${K.glow}, ${(active ? 0.42 : 0.24) + 0.18 * pv})`);
    halo.addColorStop(1, `rgba(${K.glow}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.5, 0, TAU);
    ctx.fill();

    if (f.kind === 'urgent') {
      const pulse = 1 + 0.08 * Math.sin(t * 8);
      const s = r * 0.62 * pulse;
      ctx.rotate(Math.PI / 4);
      const gd = ctx.createLinearGradient(-s, -s, s, s);
      gd.addColorStop(0, '#E8FDFF');
      gd.addColorStop(1, K.core);
      ctx.fillStyle = gd;
      ctx.shadowColor = K.core;
      ctx.shadowBlur = 18;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.rotate(-Math.PI / 4);
      ctx.shadowBlur = 0;
      if (f.expires != null && !f.done && !f.gone) {
        const left = clamp((f.expires - t) / f.deadline, 0, 1);
        ctx.strokeStyle = `rgba(56, 225, 255, 0.85)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, -Math.PI / 2, -Math.PI / 2 + TAU * left);
        ctx.stroke();
      }
    } else {
      // orbe e chama
      const orb = r * (0.42 + 0.22 * pv);
      const tip = r * (0.55 + 0.55 * pv) * (1 + 0.08 * flick);
      const cg = ctx.createRadialGradient(0, -orb * 0.2, 0, 0, 0, orb * 1.6);
      cg.addColorStop(0, '#FFF8E6');
      cg.addColorStop(0.35, K.core);
      cg.addColorStop(1, `rgba(${K.glow}, 0)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-orb, 0);
      ctx.bezierCurveTo(-orb, -orb * 0.9, -orb * 0.25 + flick * 2, -orb - tip * 0.6, flick * 3, -orb - tip);
      ctx.bezierCurveTo(orb * 0.25 + flick * 2, -orb - tip * 0.6, orb, -orb * 0.9, orb, 0);
      ctx.arc(0, 0, orb, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 240, 0.85)';
      ctx.beginPath();
      ctx.arc(0, orb * 0.05, orb * 0.32, 0, TAU);
      ctx.fill();
    }

    // anel de progresso
    if (Number.isFinite(f.need) && !f.done && showProg && f.kind !== 'urgent') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.12, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = active ? '#7DF0FF' : 'rgba(125, 240, 255, 0.6)';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.12, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }
    if (f.kind === 'urgent' && !f.done && showProg && p > 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#E8FDFF';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.98, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }

    // brilho e custo (orçamento)
    if (f.lux && !f.done) {
      ctx.font = `600 ${Math.round(clamp(r * 0.36, 11, 16))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD23F';
      ctx.fillText(`✦ ${f.lux}`, 0, -r * 1.55);
      ctx.fillStyle = 'rgba(232, 236, 255, 0.7)';
      ctx.fillText(`${f.need} s`, 0, r * 1.5);
    }
    // prazo de chamas com agenda
    if (f.until != null && f.expires != null && !f.done && !f.gone) {
      const left = clamp((f.expires - t) / (f.expires - f.bornAt), 0, 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = left < 0.3 ? 'rgba(255, 120, 120, 0.9)' : 'rgba(255, 210, 63, 0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, -Math.PI / 2, -Math.PI / 2 + TAU * left);
      ctx.stroke();
    }
    if (recommended) {
      ctx.save();
      ctx.rotate(t * 0.8);
      ctx.setLineDash([6, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(56, 225, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.55, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7DF0FF';
      ctx.fillText(recommended, 0, r * 1.95);
    }
    ctx.restore();
  }

  _drawBubble(b) {
    const { ctx, t } = this;
    const rb = this.R * 0.62;
    const age = t - b.born;
    let a = clamp(age / 0.3, 0, 1);
    let s = 0.6 + 0.4 * ease(a);
    if (b.out) { const k = clamp((t - (b.outAt ?? t)) / 0.5, 0, 1); a *= 1 - k; s *= 1 + (b.taken ? 0.4 : -0.3) * k; }
    else if (age > b.life - 0.8) a *= clamp((b.life - age) / 0.8, 0.15, 1);
    if (a <= 0) return;
    const x = b.px + Math.sin(t * 1.3 + b.ph) * 4;
    const y = b.py + Math.cos(t * 1.1 + b.ph) * 4 - age * 3;
    const col = b.decoy ? '56, 225, 255' : '255, 79, 216';
    const blink = 0.7 + 0.3 * Math.sin(t * 7 + b.ph);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, -rb * 0.3, 0, 0, 0, rb * 1.6);
    g.addColorStop(0, `rgba(${col}, ${0.5 * blink})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rb * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(${col}, 0.85)`;
    ctx.beginPath();
    ctx.arc(0, 0, rb, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    if (b.bait != null) {
      ctx.font = `700 ${Math.round(rb * 0.62)}px "Space Grotesk", Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${b.bait}`, 0, 1);
    } else if (b.decoy) {
      ctx.font = `800 ${Math.round(rb * 1.1)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 2);
    } else if (b.icon === 0) { // sino
      ctx.beginPath();
      ctx.moveTo(-rb * 0.42, rb * 0.25);
      ctx.quadraticCurveTo(-rb * 0.42, -rb * 0.5, 0, -rb * 0.5);
      ctx.quadraticCurveTo(rb * 0.42, -rb * 0.5, rb * 0.42, rb * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, rb * 0.36, rb * 0.12, 0, TAU);
      ctx.fill();
    } else if (b.icon === 1) { // coração
      const k = rb * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, k * 0.9);
      ctx.bezierCurveTo(-k * 1.4, -k * 0.1, -k * 0.6, -k * 1.2, 0, -k * 0.4);
      ctx.bezierCurveTo(k * 0.6, -k * 1.2, k * 1.4, -k * 0.1, 0, k * 0.9);
      ctx.fill();
    } else { // reticências
      for (const dx of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(dx * rb * 0.34, 0, rb * 0.12, 0, TAU); ctx.fill(); }
    }
    if (this.helpOn && !b.out) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.moveTo(-rb * 0.75, -rb * 0.75); ctx.lineTo(rb * 0.75, rb * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAnchor() {
    const q = this._anchorPos();
    if (!q) return;
    const { ctx, t } = this;
    const left = clamp((this.anchor.until - t) / 2.8, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(13, 30, 44, 0.92)';
    ctx.strokeStyle = '#38E1FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 20, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(q.x, q.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#BFF6FF';
    ctx.fillText('⚓', q.x, q.y + 1);
    ctx.restore();
  }

  _drawFx() {
    const { ctx } = this;
    for (const p of this.fx) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, k);
      if (p.type === 'p') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * k + 0.3, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.R * (0.8 + 1.6 * (1 - k)), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = f.age / f.life;
      ctx.globalAlpha = 1 - k;
      ctx.font = '700 15px "Space Grotesk", Inter, sans-serif';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - 20 - k * 34);
    }
    ctx.globalAlpha = 1;
  }

  _drawTutorial() {
    const f = this.flames[0];
    const { ctx, t } = this;
    const q = this._pos(f);
    const r = this._radius(f);
    const k = (t % 1.6) / 1.6;
    ctx.save();
    ctx.strokeStyle = `rgba(125, 240, 255, ${0.8 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r * (1.1 + k * 0.9), 0, TAU);
    ctx.stroke();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#BFF6FF';
    ctx.fillText(tr('segure aqui e acompanhe', 'hold here and follow'), q.x, q.y + r * 2.1);
    ctx.restore();
  }

  _drawBreath() {
    const f = this.flames[0];
    const { ctx } = this;
    const q = this._pos(f);
    const b = this._breath();
    ctx.save();
    ctx.font = '500 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(232, 236, 255, ${0.5 + 0.3 * b.k})`;
    ctx.fillText(b.inhale ? tr('inspire…', 'breathe in…') : tr('solte o ar…', 'breathe out…'), q.x, q.y + this._radius(f) * 2.3);
    ctx.restore();
  }

  _drawMeters() {
    const { ctx, w, h } = this;
    const L = this.level;
    const y = h - 16;
    const x0 = 64;
    const x1 = w - 104;
    const frac = Number.isFinite(L.energy) ? clamp(this.energy / L.energy, 0, 1) : 1;
    ctx.save();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(232, 236, 255, 0.65)';
    ctx.fillText(tr('Luz', 'Light'), 16, y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(x0, y - 4, x1 - x0, 8, 4);
    ctx.fill();
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, frac < 0.25 ? '#FF6B5E' : '#FFB547');
    g.addColorStop(1, frac < 0.25 ? '#FF8F6B' : '#FFD23F');
    ctx.fillStyle = g;
    ctx.shadowColor = '#FFB547';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(x0, y - 4, Math.max(4, (x1 - x0) * frac), 8, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Fluxo: 5 pontos
    const fl = this.flow();
    ctx.fillStyle = 'rgba(232, 236, 255, 0.65)';
    ctx.fillText(tr('Fluxo', 'Flow'), w - 92, y);
    for (let k = 0; k < 5; k++) {
      const on = fl >= (k + 1) / 5 - 0.001;
      ctx.fillStyle = on ? '#38E1FF' : 'rgba(255, 255, 255, 0.12)';
      if (on) { ctx.shadowColor = '#38E1FF'; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.arc(w - 46 + k * 8, y, 2.8, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
