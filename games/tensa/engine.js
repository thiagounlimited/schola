// Motor do Tensa: tabuleiro, elásticos vibrantes, sementes que florescem, toque multi-ponto.
import { TAU, motionAt, isSimplePoly, evaluate, distToSegment } from './geometry.js';
import { noteFreq } from '../../js/audio.js';

export const SEED_COLORS = ['#FF6B5E', '#3EDBB0', '#FFD23F', '#A78BFA'];
const STRING_COLORS = ['#FF6B5E', '#FF9F43', '#FFD23F', '#3EDBB0', '#38BDF8', '#A78BFA', '#F472B6'];
const IDLE_BAND = '#E6E0FF';
const THORN_GLOW = '#FF4FA3';
const SEED_NOTES = [10, 12, 13, 14];
const HOLD_TO_WIN = 0.7; // segundos com tudo resolvido antes de vencer
const DOUBLE_TAP = 0.34;

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const ease = (x) => 1 - (1 - x) ** 3;

export class Board {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks; // { audio, haptic, onStatus, onMessage, onWin, onEchoPluck }
    this.mode = level.mode || 'enclose';
    this.time = 0;
    this.pins = level.pins.map(([x, y], i) => ({ x0: x, y0: y, x, y, px: 0, py: 0, m: level.pinMotion?.[i] || level.spin || null }));
    this.seeds = (level.seeds || []).map((s) => ({
      x0: s.x, y0: s.y, x: s.x, y: s.y, c: s.c, m: s.m || level.spin || null,
      bloom: 0, happy: s.c < 0, enclosed: false, rot: Math.random() * TAU,
    }));
    this.bands = [];
    this.undoStack = [];
    this.drags = new Map();
    this.effects = [];
    this.hint = null;
    this.hintUsed = false;
    this.hold = 0;
    this.won = false;
    this.lastTap = null;
    this.tutorialStage = -1;
    this.lastStatus = '';

    (level.strings || []).forEach(([a, b, note], k) =>
      this._addBand([a, b], { fixed: true, note, color: STRING_COLORS[k % STRING_COLORS.length] }));
    if (this.mode === 'echo') this.echo = new Echo(this, level.rounds);

    this._bind();
    this.resize();
    this._positions();
    this._evaluate(0, true);
    this._status();
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
    c.removeEventListener('pointercancel', this._cancel);
  }

  // ---------- Layout ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.S = Math.min(this.w, this.h) * 0.96;
    this.ox = (this.w - this.S) / 2;
    this.oy = (this.h - this.S) / 2;
    this.pinR = Math.max(7, this.S * 0.021);
    this.seedR = Math.max(6, this.S * 0.02);
    this.bw = Math.max(3, this.S * 0.0085);
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.hitPin = Math.max(this.pinR * 2.3, coarse ? 28 : 20);
    this.hitBand = Math.max(this.S * 0.03, coarse ? 22 : 14);
    this._positions();
  }

  _positions() {
    const t = this.time;
    for (const p of this.pins) {
      [p.x, p.y] = motionAt(p.x0, p.y0, p.m, t);
      p.px = this.ox + p.x * this.S;
      p.py = this.oy + p.y * this.S;
    }
    for (const s of this.seeds) {
      [s.x, s.y] = motionAt(s.x0, s.y0, s.m, t);
      s.px = this.ox + s.x * this.S;
      s.py = this.oy + s.y * this.S;
    }
  }

  // ---------- Elásticos ----------
  _seg() { return { a: 0, v: 0, b: 0, u: 0 }; }

  _addBand(pins, opts = {}) {
    const band = { pins: [...pins], segs: pins.map(() => this._seg()), fill: 0, glow: 0, born: this.time, ...opts };
    this.bands.push(band);
    return band;
  }

  _countBands() { return this.bands.filter((b) => !b.fixed).length; }

  segGeom(band, i) {
    const n = band.pins.length;
    const P = this.pins[band.pins[i]];
    const Q = this.pins[band.pins[(i + 1) % n]];
    let x1 = P.px, y1 = P.py, x2 = Q.px, y2 = Q.py;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    if (n === 2) {
      // um elástico em 2 pinos é um laço fino: cada lado passa por fora dos pinos
      const o = this.pinR * 0.62;
      x1 += nx * o; y1 += ny * o; x2 += nx * o; y2 += ny * o;
    }
    return { x1, y1, x2, y2, nx, ny, len };
  }

  _segFreq(band, i) {
    if (band.note != null) return noteFreq(band.note);
    const L = this.segGeom(band, i).len / this.S; // 0.05 … 1.2
    const idx = Math.round((1 - Math.min(1, Math.max(0, (L - 0.08) / 0.9))) * 13);
    return noteFreq(idx);
  }

  _pan(x) { return ((x / this.w) * 2 - 1) * 0.7; }

  _pluck(band, i, amp, vel) {
    const seg = band.segs[i];
    seg.a = amp;
    seg.v = 0;
    seg.b = amp * 0.22;
    seg.u = 0;
    band.glow = Math.max(band.glow, 0.6 + vel * 0.4);
    const g = this.segGeom(band, i);
    this.hooks.audio.pluck(this._segFreq(band, i), vel, this._pan((g.x1 + g.x2) / 2));
  }

  _kick(band, scale = 0.012) {
    band.segs.forEach((s) => { s.a += (Math.random() * 2 - 1) * this.S * scale; });
  }

  _snapshot() {
    return this.bands.filter((b) => !b.fixed).map((b) => [...b.pins]);
  }

  _pushUndo() {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  _restore(snap) {
    const fixed = this.bands.filter((b) => b.fixed);
    this.bands = fixed;
    snap.forEach((pins) => this._kick(this._addBand(pins), 0.006));
    this._status();
  }

  undo() {
    if (this.won || !this.undoStack.length) return;
    this._restore(this.undoStack.pop());
    this.hooks.audio.pluck(noteFreq(7), 0.35, 0, 0.6);
  }

  clear() {
    if (this.won || !this._countBands()) return;
    this._pushUndo();
    this.bands.filter((b) => !b.fixed).forEach((b) => this._popFx(b));
    this.bands = this.bands.filter((b) => b.fixed);
    this.hooks.audio.pop();
    this._status();
  }

  showHint() {
    if (this.mode !== 'enclose' || this.won) return false;
    const key = (p) => [...p].sort((a, b) => a - b).join(',');
    const have = new Set(this.bands.map((b) => key(b.pins)));
    const poly = (this.level.solution || []).find((p) => !have.has(key(p))) || this.level.solution?.[0];
    if (!poly) return false;
    this.hint = { poly, until: this.time + 4.5 };
    this.hintUsed = true;
    this.hooks.audio.chime(noteFreq(10), 0.4);
    return true;
  }

  _removeBand(band) {
    this._pushUndo();
    this.bands = this.bands.filter((b) => b !== band);
    this._popFx(band);
    this.hooks.audio.pop(this._pan(this.pins[band.pins[0]].px));
    this.hooks.haptic(12);
    this._status();
  }

  // ---------- Entrada (Pointer Events, multitoque) ----------
  _bind() {
    const c = this.canvas;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._cancel = this._cancel.bind(this);
    c.addEventListener('pointerdown', this._down);
    c.addEventListener('pointermove', this._move);
    c.addEventListener('pointerup', this._up);
    c.addEventListener('pointercancel', this._cancel);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(c);
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _nearestPin(x, y, exclude = () => false) {
    let best = -1, bd = this.hitPin;
    this.pins.forEach((p, i) => {
      if (exclude(i)) return;
      const d = Math.hypot(p.px - x, p.py - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  _nearestSeg(x, y) {
    let best = null, bd = this.hitBand;
    for (let bi = this.bands.length - 1; bi >= 0; bi--) {
      const band = this.bands[bi];
      for (let i = 0; i < band.pins.length; i++) {
        const g = this.segGeom(band, i);
        const { d, s } = distToSegment(x, y, g.x1, g.y1, g.x2, g.y2);
        if (d < bd && s > 0.04 && s < 0.96) { bd = d; best = { band, seg: i, s }; }
      }
    }
    return best;
  }

  _locked(band) {
    for (const d of this.drags.values()) if (d.band === band) return true;
    return false;
  }

  _down(e) {
    e.preventDefault();
    const { x, y } = this._local(e);
    if (this.won) return;
    if (e.button === 2) {
      const hit = this._nearestSeg(x, y);
      if (hit && !hit.band.fixed && !this._locked(hit.band)) this._removeBand(hit.band);
      return;
    }
    const canBuild = this.mode !== 'echo';
    const pin = canBuild ? this._nearestPin(x, y) : -1;
    if (pin >= 0) {
      this.drags.set(e.pointerId, { kind: 'new', from: pin, x, y, target: -1 });
      this.hooks.audio.pluck(noteFreq(9), 0.18, this._pan(x), 0.3);
      this.hooks.haptic(6);
    } else {
      const hit = this._nearestSeg(x, y);
      if (hit && !this._locked(hit.band)) {
        this.drags.set(e.pointerId, { kind: 'pull', band: hit.band, seg: hit.seg, sx: x, sy: y, x, y, target: -1 });
      } else {
        this.effects.push({ type: 'ripple', x, y, t0: this.time, life: 0.9 });
        if (Math.random() < 0.6) this.hooks.audio.chime(noteFreq(8 + Math.floor(Math.random() * 6)), 0.15, this._pan(x));
        return;
      }
    }
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _move(e) {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    const { x, y } = this._local(e);
    d.x = x;
    d.y = y;
    let target = -1;
    if (d.kind === 'new') target = this._nearestPin(x, y, (i) => i === d.from);
    else if (!d.band.fixed && this.mode !== 'echo') target = this._nearestPin(x, y, (i) => d.band.pins.includes(i));
    if (target !== d.target && target >= 0) this.hooks.haptic(5);
    d.target = target;
  }

  _cancel(e) {
    const d = this.drags.get(e.pointerId);
    this.drags.delete(e.pointerId);
    if (d?.kind === 'new') this._snapFx(d);
  }

  _up(e) {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    this.drags.delete(e.pointerId);
    if (this.won) return;
    if (d.kind === 'new') this._finishNew(d);
    else this._finishPull(d);
  }

  _finishNew(d) {
    if (d.target < 0) { this._snapFx(d); return; }
    const max = this.level.maxBands;
    if (max && this._countBands() >= max) {
      this.hooks.audio.nope();
      this.hooks.haptic(25);
      this.hooks.onMessage?.(`Só ${max} elástico${max > 1 ? 's' : ''} nesta fase. Reaproveite um!`);
      this.hooks.onStatus?.({ flash: true });
      this._snapFx(d);
      return;
    }
    this._pushUndo();
    const band = this._addBand([d.from, d.target]);
    this._pluck(band, 0, this.S * 0.03, 0.75);
    this.hooks.haptic(14);
    this._status();
  }

  _finishPull(d) {
    const { band } = d;
    if (!this.bands.includes(band)) return;
    const g = this.segGeom(band, d.seg);
    if (d.target >= 0) {
      const pins = [...band.pins];
      pins.splice(d.seg + 1, 0, d.target);
      const pts = pins.map((i) => [this.pins[i].x, this.pins[i].y]);
      if (!isSimplePoly(pts)) {
        this.hooks.audio.nope();
        this.hooks.haptic(25);
        this.hooks.onMessage?.('Esse caminho cruzaria o próprio elástico.');
        this._kick(band, 0.02);
        return;
      }
      this._pushUndo();
      band.pins = pins;
      band.segs.splice(d.seg, 1, this._seg(), this._seg());
      this._kick(band, 0.008);
      this._pluck(band, d.seg, this.S * 0.025, 0.7);
      setTimeout(() => this.bands.includes(band) && band.segs[d.seg + 1] && this._pluck(band, d.seg + 1, this.S * 0.025, 0.6), 70);
      this.hooks.haptic(16);
      this._status();
      return;
    }
    // Soltou no vazio: o elástico volta e vibra — um dedilhado.
    const moved = Math.hypot(d.x - d.sx, d.y - d.sy);
    const disp = (d.x - g.x1) * g.nx + (d.y - g.y1) * g.ny;
    const cap = this.S * 0.07;
    const isTap = moved < 8;
    const amp = isTap ? this.S * 0.022 * (Math.random() < 0.5 ? -1 : 1) : Math.max(-cap, Math.min(cap, disp));
    const vel = isTap ? 0.55 : 0.35 + Math.min(1, Math.abs(disp) / (this.S * 0.14)) * 0.65;
    this._pluck(band, d.seg, amp, vel);
    this.hooks.haptic(isTap ? 8 : 14);

    if (this.mode === 'echo') this.echo?.onPluck(this.bands.indexOf(band));
    if (isTap && !band.fixed) {
      const lt = this.lastTap;
      if (lt && lt.band === band && this.time - lt.t < DOUBLE_TAP) {
        this.lastTap = null;
        this._removeBand(band);
        return;
      }
      this.lastTap = { band, t: this.time };
    }
  }

  // Toca uma corda pelo índice (usado pelo Eco).
  playBand(k, vel = 0.8) {
    const band = this.bands[k];
    if (!band) return;
    this._pluck(band, 0, this.S * 0.03, vel);
    band.glow = 1.4;
  }

  // ---------- Efeitos ----------
  _snapFx(d) {
    const p = this.pins[d.from];
    this.effects.push({ type: 'snap', x1: p.px, y1: p.py, x2: d.x, y2: d.y, t0: this.time, life: 0.2 });
    this.hooks.audio.pluck(noteFreq(14), 0.25, this._pan(d.x), 0.35);
  }

  _sparks(x, y, color, n = 14, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.15 + Math.random() * 0.35) * this.S * speed;
      this.effects.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t0: this.time, life: 0.6 + Math.random() * 0.5 });
    }
  }

  _popFx(band) {
    const n = band.pins.length;
    for (let i = 0; i < n; i++) {
      const g = this.segGeom(band, i);
      for (let k = 0; k < 4; k++) {
        const s = Math.random();
        this._sparks(g.x1 + (g.x2 - g.x1) * s, g.y1 + (g.y2 - g.y1) * s, this._bandColor(band), 1, 0.6);
      }
    }
  }

  // ---------- Simulação ----------
  _frame = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this._positions();
    this._physics(dt);
    this._evaluate(dt);
    this.echo?.update(dt);
    this._tutorial();
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  };

  _physics(dt) {
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (const band of this.bands) {
      band.glow = Math.max(0, band.glow - dt * 1.2);
      band.segs.forEach((seg, i) => {
        if (Math.abs(seg.a) < 0.02 && Math.abs(seg.v) < 0.05 && Math.abs(seg.b) < 0.02) { seg.a = seg.b = seg.v = seg.u = 0; return; }
        const L = this.segGeom(band, i).len / this.S;
        const w = TAU * (3.2 + 2.2 / (L + 0.25));
        for (let k = 0; k < steps; k++) {
          seg.v += (-w * w * seg.a - 2 * 0.022 * w * seg.v) * h;
          seg.a += seg.v * h;
          const w2 = w * 2;
          seg.u += (-w2 * w2 * seg.b - 2 * 0.035 * w2 * seg.u) * h;
          seg.b += seg.u * h;
        }
      });
    }
    for (const s of this.seeds) {
      const target = s.c >= 0 && s.happy ? 1 : 0;
      s.bloom += (target - s.bloom) * Math.min(1, dt * 5);
      s.rot += dt * (0.25 + s.bloom * 0.5);
    }
    this.effects = this.effects.filter((f) => this.time - f.t0 < f.life);
    for (const f of this.effects) if (f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; }
  }

  _evaluate(dt, silent = false) {
    const polys = this.bands.map((b) => b.pins.map((i) => [this.pins[i].x, this.pins[i].y]));
    const ev = evaluate(this.seeds, polys);
    this.bands.forEach((b, i) => {
      Object.assign(b, ev.bandInfo[i]);
      b.fill += ((b.tone != null ? 1 : 0) - b.fill) * Math.min(1, dt * 4);
    });
    this.seeds.forEach((s, i) => {
      const { happy, enclosed } = ev.seedInfo[i];
      if (!silent && happy && !s.happy && s.c >= 0) {
        this.hooks.audio.chime(noteFreq(SEED_NOTES[s.c]), 0.6, this._pan(s.px));
        this._sparks(s.px, s.py, SEED_COLORS[s.c], 10, 0.7);
        this.hooks.haptic(10);
      }
      if (!silent && s.c < 0 && enclosed && !s.enclosed) {
        this.hooks.audio.nope();
        this.hooks.haptic(30);
      }
      s.happy = happy;
      s.enclosed = enclosed;
    });
    if (this.mode !== 'enclose' || this.won) return;
    this.hold = ev.allHappy ? this.hold + dt : 0;
    if (this.hold >= HOLD_TO_WIN) this._win({ bands: this._countBands(), hintUsed: this.hintUsed });
  }

  _win(result) {
    if (this.won) return;
    this.won = true;
    this.drags.clear();
    this.hooks.audio.arpeggio(7);
    this.hooks.haptic(40);
    for (const s of this.seeds) if (s.c >= 0) this._sparks(s.px, s.py, SEED_COLORS[s.c], 22, 1.2);
    for (const b of this.bands) { this._kick(b, 0.02); b.glow = 1.5; }
    setTimeout(() => this.hooks.onWin?.(result), 900);
  }

  _status() {
    const n = this._countBands();
    const key = `${n}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.hooks.onStatus?.({ bands: n, max: this.level.maxBands || null });
  }

  // Tutorial da 1ª fase: mão-fantasma mostrando o gesto.
  _tutorial() {
    if (!this.level.tutorial || this.won) { this.ghost = null; return; }
    const user = this.bands.filter((b) => !b.fixed);
    let stage = 2;
    if (!user.length) stage = 0;
    else if (user.length === 1 && user[0].pins.length === 2) stage = 1;
    if (stage !== this.tutorialStage) {
      this.tutorialStage = stage;
      const msgs = [
        'Toque num pino e arraste até outro pino.',
        'Agora puxe o elástico pelo meio e prenda no terceiro pino.',
        'Envolva a semente para ela florescer.',
      ];
      this.hooks.onMessage?.(msgs[stage], true);
    }
    const p = this.pins;
    if (stage === 0) this.ghost = { x1: p[0].px, y1: p[0].py, x2: p[1].px, y2: p[1].py };
    else if (stage === 1) {
      const b = user[0];
      const far = [0, 1, 2].find((i) => !b.pins.includes(i));
      const g = this.segGeom(b, 0);
      const g2 = this.segGeom(b, 1);
      // usa o lado do laço mais próximo do pino que falta
      const pick = Math.hypot((g.x1 + g.x2) / 2 - p[far].px, (g.y1 + g.y2) / 2 - p[far].py) <
        Math.hypot((g2.x1 + g2.x2) / 2 - p[far].px, (g2.y1 + g2.y2) / 2 - p[far].py) ? g : g2;
      this.ghost = { x1: (pick.x1 + pick.x2) / 2, y1: (pick.y1 + pick.y2) / 2, x2: p[far].px, y2: p[far].py };
    } else this.ghost = null;
  }

  // ---------- Desenho ----------
  _bandColor(b) {
    if (b.color) return b.color;
    if (b.tone != null) return SEED_COLORS[b.tone];
    if (b.mixed && b.colors?.length) {
      const cols = b.colors.map((c) => (c < 0 ? THORN_GLOW : SEED_COLORS[c]));
      return cols[Math.floor(this.time * 2.5) % cols.length];
    }
    return IDLE_BAND;
  }

  _bandPath(band) {
    const pts = [];
    const n = band.pins.length;
    for (let i = 0; i < n; i++) {
      const g = this.segGeom(band, i);
      const drag = [...this.drags.values()].find((d) => d.kind === 'pull' && d.band === band && d.seg === i);
      if (drag) {
        let tx = drag.x, ty = drag.y;
        if (drag.target >= 0) { tx = this.pins[drag.target].px; ty = this.pins[drag.target].py; }
        pts.push([g.x1, g.y1], [tx, ty]);
        continue;
      }
      const seg = band.segs[i];
      const jitter = band.mixed ? Math.sin(this.time * 31 + i) * this.S * 0.0025 : 0;
      if (Math.abs(seg.a) + Math.abs(seg.b) + Math.abs(jitter) < 0.3) { pts.push([g.x1, g.y1]); continue; }
      const N = 14;
      for (let k = 0; k < N; k++) {
        const s = k / N;
        const off = seg.a * Math.sin(Math.PI * s) + seg.b * Math.sin(TAU * s) + jitter * Math.sin(Math.PI * s);
        pts.push([g.x1 + (g.x2 - g.x1) * s + g.nx * off, g.y1 + (g.y2 - g.y1) * s + g.ny * off]);
      }
    }
    return pts;
  }

  _draw() {
    const c = this.ctx;
    const { S, ox, oy } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);

    // placa do tabuleiro
    const pad = S * 0.02;
    c.beginPath();
    c.roundRect(ox - pad, oy - pad, S + pad * 2, S + pad * 2, S * 0.06);
    const bg = c.createRadialGradient(ox + S / 2, oy + S * 0.4, S * 0.1, ox + S / 2, oy + S / 2, S * 0.75);
    bg.addColorStop(0, 'rgba(124,77,255,0.10)');
    bg.addColorStop(1, 'rgba(255,255,255,0.025)');
    c.fillStyle = bg;
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 1;
    c.stroke();

    const paths = this.bands.map((b) => this._bandPath(b));

    // preenchimentos
    this.bands.forEach((b, i) => {
      if (b.pins.length < 3) return;
      const col = this._bandColor(b);
      const alpha = b.tone != null ? 0.16 * b.fill : b.mixed ? 0.05 : 0;
      if (alpha <= 0.002) return;
      c.beginPath();
      paths[i].forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = hexA(col, alpha);
      c.fill();
    });

    // dica: polígono fantasma
    if (this.hint && this.time < this.hint.until) {
      const a = Math.min(1, (this.hint.until - this.time) / 0.6) * (0.55 + 0.35 * Math.sin(this.time * 5));
      c.save();
      c.setLineDash([S * 0.015, S * 0.015]);
      c.lineDashOffset = -this.time * 40;
      c.lineWidth = this.bw;
      c.strokeStyle = `rgba(255,255,255,${a})`;
      c.beginPath();
      this.hint.poly.forEach((pi, k) => (k ? c.lineTo(this.pins[pi].px, this.pins[pi].py) : c.moveTo(this.pins[pi].px, this.pins[pi].py)));
      c.closePath();
      c.stroke();
      c.restore();
    }

    // elásticos: halo + núcleo + brilho
    c.lineJoin = 'round';
    c.lineCap = 'round';
    this.bands.forEach((b, i) => {
      const col = this._bandColor(b);
      const pts = paths[i];
      const trace = () => {
        c.beginPath();
        pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
      };
      trace();
      c.strokeStyle = hexA(col, 0.16 + Math.min(1, b.glow) * 0.25);
      c.lineWidth = this.bw * (3.2 + b.glow * 1.5);
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = this.bw;
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = this.bw * 0.3;
      c.stroke();
    });

    // elástico novo sendo esticado
    for (const d of this.drags.values()) {
      if (d.kind !== 'new') continue;
      const p = this.pins[d.from];
      const tx = d.target >= 0 ? this.pins[d.target].px : d.x;
      const ty = d.target >= 0 ? this.pins[d.target].py : d.y;
      const stretch = Math.min(1, Math.hypot(tx - p.px, ty - p.py) / (S * 0.8));
      c.strokeStyle = hexA(IDLE_BAND, 0.2);
      c.lineWidth = this.bw * 3.2;
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(tx, ty); c.stroke();
      c.strokeStyle = IDLE_BAND;
      c.lineWidth = this.bw * (1 - stretch * 0.45); // afina ao esticar
      c.stroke();
    }

    this._drawPins();
    this._drawSeeds();
    this._drawEffects();

    if (this.ghost) {
      const g = this.ghost;
      const cyc = (this.time % 2.2) / 2.2;
      const k = ease(Math.min(1, cyc / 0.7));
      const fade = cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15;
      const x = g.x1 + (g.x2 - g.x1) * k, y = g.y1 + (g.y2 - g.y1) * k;
      c.save();
      c.globalAlpha = 0.85 * fade;
      c.setLineDash([6, 8]);
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(g.x1, g.y1); c.lineTo(x, y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath(); c.arc(x, y, this.pinR * 0.9, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, this.pinR * (1.5 + 0.3 * Math.sin(this.time * 8)), 0, TAU); c.stroke();
      c.restore();
    }
  }

  _drawSeeds() {
    const c = this.ctx;
    const r = this.seedR;
    for (const s of this.seeds) {
      let { px: x, py: y } = s;
      if (s.c < 0) {
        if (s.enclosed) { x += Math.sin(this.time * 40) * 2; }
        const spikes = 8;
        const glow = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
        glow.addColorStop(0, hexA(THORN_GLOW, s.enclosed ? 0.55 : 0.18));
        glow.addColorStop(1, hexA(THORN_GLOW, 0));
        c.fillStyle = glow;
        c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
        c.beginPath();
        for (let k = 0; k < spikes * 2; k++) {
          const a = s.rot * 0.4 + (k * Math.PI) / spikes;
          const rr = k % 2 ? r * 0.55 : r * 1.25;
          c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath();
        c.fillStyle = '#1C1840';
        c.fill();
        c.strokeStyle = hexA(THORN_GLOW, 0.85);
        c.lineWidth = 1.5;
        c.stroke();
        continue;
      }
      const col = SEED_COLORS[s.c];
      const b = s.bloom;
      const pulse = 1 + Math.sin(this.time * 2.4 + s.x0 * 10) * 0.06 * (1 - b);
      const glow = c.createRadialGradient(x, y, 0, x, y, r * (2.6 + b * 1.4));
      glow.addColorStop(0, hexA(col, 0.32 + b * 0.25));
      glow.addColorStop(1, hexA(col, 0));
      c.fillStyle = glow;
      c.beginPath(); c.arc(x, y, r * (2.6 + b * 1.4), 0, TAU); c.fill();
      if (b > 0.02) {
        for (let k = 0; k < 6; k++) {
          const a = s.rot + (k * TAU) / 6;
          c.save();
          c.translate(x + Math.cos(a) * r * 1.15 * b, y + Math.sin(a) * r * 1.15 * b);
          c.rotate(a);
          c.beginPath();
          c.ellipse(0, 0, r * 0.85 * b, r * 0.48 * b, 0, 0, TAU);
          c.fillStyle = hexA(col, 0.85);
          c.fill();
          c.restore();
        }
      }
      c.beginPath(); c.arc(x, y, r * 0.8 * pulse, 0, TAU);
      c.fillStyle = b > 0.5 ? '#FFF8E8' : col;
      c.fill();
      c.beginPath(); c.arc(x - r * 0.25, y - r * 0.25, r * 0.25, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill();
    }
  }

  _drawPins() {
    const c = this.ctx;
    const r = this.pinR;
    const targets = new Set([...this.drags.values()].map((d) => d.target).filter((t) => t >= 0));
    const sources = new Set([...this.drags.values()].filter((d) => d.kind === 'new').map((d) => d.from));
    const inert = this.mode === 'echo';
    this.pins.forEach((p, i) => {
      const { px: x, py: y } = p;
      if (targets.has(i) || sources.has(i)) {
        c.beginPath();
        c.arc(x, y, r * (1.9 + 0.15 * Math.sin(this.time * 10)), 0, TAU);
        c.strokeStyle = 'rgba(255,255,255,0.75)';
        c.lineWidth = 2.5;
        c.stroke();
      }
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, inert ? '#6E68B8' : '#6A63E8');
      g.addColorStop(0.55, inert ? '#2E2A6A' : '#2D2690');
      g.addColorStop(1, '#16124A');
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath(); c.arc(x - r * 0.32, y - r * 0.36, r * 0.24, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fill();
    });
  }

  _drawEffects() {
    const c = this.ctx;
    for (const f of this.effects) {
      const k = (this.time - f.t0) / f.life;
      if (f.type === 'ripple') {
        c.beginPath();
        c.arc(f.x, f.y, this.S * (0.02 + ease(k) * 0.09), 0, TAU);
        c.strokeStyle = `rgba(190,180,255,${0.5 * (1 - k)})`;
        c.lineWidth = 2;
        c.stroke();
      } else if (f.type === 'spark') {
        c.beginPath();
        c.arc(f.x, f.y, Math.max(0.5, this.S * 0.006 * (1 - k)), 0, TAU);
        c.fillStyle = hexA(f.color, 1 - k);
        c.fill();
      } else if (f.type === 'snap') {
        const e = ease(k);
        c.strokeStyle = hexA(IDLE_BAND, 1 - k);
        c.lineWidth = this.bw;
        c.beginPath();
        c.moveTo(f.x1, f.y1);
        c.lineTo(f.x2 + (f.x1 - f.x2) * e, f.y2 + (f.y1 - f.y2) * e);
        c.stroke();
      }
    }
  }
}

// Modo Eco: o jogo toca uma melodia nas cordas; o jogador repete.
class Echo {
  constructor(board, rounds) {
    this.b = board;
    this.rounds = rounds;
    this.round = 0;
    this.mistakes = 0;
    this._newSeq();
    this._wait(1.2, 'listen');
  }

  _newSeq() {
    const n = this.rounds[this.round];
    const k = this.b.bands.length;
    this.seq = [];
    for (let i = 0; i < n; i++) {
      let x;
      do x = Math.floor(Math.random() * k); while (x === this.seq[i - 1]);
      this.seq.push(x);
    }
  }

  _wait(t, next) { this.state = 'wait'; this.timer = t; this.next = next; }

  _say(msg) {
    this.b.hooks.onMessage?.(msg, true);
    this.b.hooks.onStatus?.({ echo: { round: this.round + 1, total: this.rounds.length, step: this.idx || 0, len: this.seq.length } });
  }

  update(dt) {
    if (this.b.won) return;
    this.timer -= dt;
    if (this.state === 'wait' && this.timer <= 0) {
      this.state = 'listen';
      this.idx = 0;
      this.timer = 0.2;
      this._say('Ouça…');
    } else if (this.state === 'listen' && this.timer <= 0) {
      if (this.idx < this.seq.length) {
        this.b.playBand(this.seq[this.idx]);
        this.idx++;
        this.timer = 0.62;
      } else {
        this.state = 'play';
        this.idx = 0;
        this._say('Sua vez!');
      }
    }
  }

  onPluck(k) {
    if (this.state !== 'play') return;
    if (k === this.seq[this.idx]) {
      this.idx++;
      this.b.hooks.onStatus?.({ echo: { round: this.round + 1, total: this.rounds.length, step: this.idx, len: this.seq.length } });
      if (this.idx < this.seq.length) return;
      this.round++;
      if (this.round >= this.rounds.length) {
        this.b._win({ mistakes: this.mistakes });
        return;
      }
      this._newSeq();
      this.state = 'done';
      setTimeout(() => { this._say('Isso! Agora uma mais longa…'); this._wait(1.3, 'listen'); }, 500);
    } else {
      this.mistakes++;
      this.b.hooks.audio.nope();
      this.b.hooks.haptic(25);
      this._say('Quase! Ouça de novo.');
      this.state = 'done';
      setTimeout(() => this._wait(1.1, 'listen'), 300);
    }
  }
}
