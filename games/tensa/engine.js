// Motor do Tensa: desenho, toque (multitoque) e regras de uma fase.
// A física fica em physics.js; aqui ficam visual, som, mira prevista e fluxo da fase.
import {
  TAU, BALL_R, PIN_R, BAND_T, createWorld, advance, launch, loadableBall, clampPull,
  pouchPosition, bandPoint, closestOnSegment, anyMoving, targetsLeft, simulate, MAX_PULL,
} from './physics.js';
import { grabCandidates } from './solver.js';
import { noteFreq } from '../../js/audio.js';
import { L } from '../../js/i18n.js';

export const BALL_COLORS = ['#FF6B5E', '#3EDBB0', '#FFD23F'];
const CUE = '#F3F3FB';
const BAND = '#FF4FD8';
const RAIL = '#38E1FF';
const HOLE_GLOW = '#38E1FF';

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
    this.hooks = hooks; // { audio, haptic, onStatus, onMessage, onWin }
    this.world = createWorld(level);
    this.vis = this.world.bands.map(() => this._vis());
    this.drags = new Map();
    this.fx = [];
    this.strokes = 0;
    this.helpUsed = false;
    this.ghostShot = null;
    this.guide = level.guide ?? 0.3;
    this.time = 0;
    this.won = false;
    this.winHold = 0;
    this.lastTap = null;
    this.preview = null;
    this.stuckShown = false;
    this._bind();
    this.resize();
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

  _vis() { return { dx: 0, dy: 0, vx: 0, vy: 0, s: 0.5, born: this.time || 0 }; }

  // ---------- Layout ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(this, { w: r.width, h: r.height, dpr });
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.S = Math.min(this.w, this.h) * 0.95;
    this.ox = (this.w - this.S) / 2;
    this.oy = (this.h - this.S) / 2;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.hitPin = Math.max(this.S * 0.045, coarse ? 26 : 18);
    this.hitBand = Math.max(this.S * 0.04, coarse ? 24 : 16);
  }

  X(x) { return this.ox + x * this.S; }
  Y(y) { return this.oy + y * this.S; }

  // ---------- Estado ----------
  get userBands() { return this.world.bands.filter((b) => !b.fixed).length; }
  get bandsLeft() { return Math.max(0, (this.level.maxBands || 0) - this.userBands); }

  _status() {
    this.hooks.onStatus?.({ strokes: this.strokes, par: this.level.par, bandsLeft: this.level.maxBands ? this.bandsLeft : null });
  }

  restart() {
    this.world = createWorld(this.level);
    this.vis = this.world.bands.map(() => this._vis());
    this.drags.clear();
    this.strokes = 0;
    this.won = false;
    this.winHold = 0;
    this.time = 0;
    this.stuckShown = false;
    this.ghostShot = null;
    this.fx = [];
    this._status();
    this.hooks.audio.pluck(noteFreq(7), 0.3, 0, 0.5);
  }

  // Ajuda: mostra a mira completa e, quando dá, a tacada exata (fantasma).
  enableHelp(shot) {
    this.helpUsed = true;
    this.guide = 1;
    this.ghostShot = shot || null;
    this.holeReveal = this.time + 3;
  }

  // ---------- Entrada ----------
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
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { x, y, ux: (x - this.ox) / this.S, uy: (y - this.oy) / this.S };
  }

  _nearestPin(x, y, skip = -1) {
    let best = -1, bd = this.hitPin;
    this.world.pins.forEach((p, i) => {
      if (i === skip) return;
      const d = Math.hypot(this.X(p.x) - x, this.Y(p.y) - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  _nearestBand(x, y) {
    let best = null, bd = this.hitBand;
    this.world.bands.forEach((band, k) => {
      const A = this.world.pins[band.a], B = this.world.pins[band.b];
      const c = closestOnSegment(x, y, this.X(A.x), this.Y(A.y), this.X(B.x), this.Y(B.y));
      if (c.d < bd) { bd = c.d; best = { band: k, s: Math.min(0.95, Math.max(0.05, c.s)) }; }
    });
    return best;
  }

  _down(e) {
    e.preventDefault();
    if (this.won) return;
    const p = this._local(e);
    if (e.button === 2) {
      const hit = this._nearestBand(p.x, p.y);
      if (hit && !this.world.bands[hit.band].fixed) this._removeBand(hit.band);
      return;
    }
    // Perto de uma bola carregável, o elástico tem prioridade sobre o pino.
    const hit = this._nearestBand(p.x, p.y);
    const pin = this._nearestPin(p.x, p.y);
    const loadedHere = hit && loadableBall(this.world, this.world.bands[hit.band], hit.s) >= 0;
    if (pin >= 0 && !loadedHere && (this.level.maxBands || 0) > 0) {
      this.drags.set(e.pointerId, { kind: 'new', from: pin, x: p.x, y: p.y, target: -1 });
      this.hooks.haptic(6);
    } else if (hit && ![...this.drags.values()].some((d) => d.band === hit.band)) {
      const band = this.world.bands[hit.band];
      const moving = anyMoving(this.world);
      const ball = moving ? -1 : loadableBall(this.world, band, hit.s);
      if (moving && loadedHere) this.hooks.onMessage?.(L('Espere as bolas pararem para a próxima tacada.', 'Wait for the balls to stop before the next shot.'));
      this.drags.set(e.pointerId, { kind: 'pull', band: hit.band, s: hit.s, ball, sx: p.x, sy: p.y, dx: 0, dy: 0 });
      this.vis[hit.band].s = hit.s;
      if (ball >= 0) this.hooks.audio.pluck(noteFreq(4), 0.2, this._pan(p.x), 0.3);
    } else {
      this.fx.push({ type: 'ripple', x: p.x, y: p.y, t0: this.time, life: 0.8 });
      return;
    }
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _move(e) {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    const p = this._local(e);
    if (d.kind === 'new') {
      d.x = p.x; d.y = p.y;
      const t = this._nearestPin(p.x, p.y, d.from);
      if (t !== d.target && t >= 0) this.hooks.haptic(5);
      d.target = t;
      return;
    }
    const band = this.world.bands[d.band];
    const P = bandPoint(this.world, band, d.s);
    [d.dx, d.dy] = clampPull(p.ux - P.x, p.uy - P.y);
    const pull = Math.hypot(d.dx, d.dy);
    const step = Math.floor((pull / MAX_PULL) * 12);
    if (step !== d.step) { d.step = step; if (d.ball >= 0 && step > 0) this.hooks.haptic(3); }
    if (d.ball >= 0) this._updatePreview(d);
  }

  _cancel(e) {
    this.drags.delete(e.pointerId);
    this.preview = null;
  }

  _up(e) {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    this.drags.delete(e.pointerId);
    this.preview = null;
    if (this.won) return;
    if (d.kind === 'new') return this._finishNew(d);
    const v = this.vis[d.band];
    const pull = Math.hypot(d.dx, d.dy);
    v.dx = d.dx; v.dy = d.dy; v.vx = 0; v.vy = 0; v.s = d.s; // o elástico volta como mola
    const band = this.world.bands[d.band];
    if (d.ball >= 0 && pull > 0.015) {
      const bi = launch(this.world, d.band, d.s, d.dx, d.dy);
      if (bi >= 0) {
        this.strokes++;
        this.lastBall = bi;
        this.ghostShot = null;
        this.stuckShown = false;
        this._status();
        const vel = 0.3 + (pull / MAX_PULL) * 0.7;
        this.hooks.audio.pluck(this._bandFreq(band), vel, this._pan(this.X(this.world.balls[bi].x)), 1.4);
        this.hooks.haptic(18 + Math.round(pull * 60));
        return;
      }
    }
    // Sem bola: só um dedilhado (e toque duplo remove elásticos do jogador).
    this.hooks.audio.pluck(this._bandFreq(band), 0.35 + Math.min(1, pull / 0.15) * 0.5, this._pan(d.sx), 1.2);
    if (pull < 0.01) {
      v.dx = -bandNormal(this.world, band)[0] * 0.01; v.dy = -bandNormal(this.world, band)[1] * 0.01;
      if (!band.fixed) {
        const lt = this.lastTap;
        if (lt && lt.band === d.band && this.time - lt.t < 0.34) { this.lastTap = null; this._removeBand(d.band); return; }
        this.lastTap = { band: d.band, t: this.time };
      }
    }
  }

  _finishNew(d) {
    if (d.target < 0) {
      const p = this.world.pins[d.from];
      this.fx.push({ type: 'snap', x1: this.X(p.x), y1: this.Y(p.y), x2: d.x, y2: d.y, t0: this.time, life: 0.2 });
      this.hooks.audio.pluck(noteFreq(14), 0.2, this._pan(d.x), 0.3);
      return;
    }
    if (this.bandsLeft <= 0) {
      this.hooks.audio.nope();
      this.hooks.haptic(25);
      this.hooks.onMessage?.(this.level.maxBands === 1 ? L('Só 1 elástico nesta fase. Toque duas vezes nele para tirar e montar outro.', 'Only 1 band in this level. Double-tap it to remove it and set up another.') : L(`Limite de ${this.level.maxBands} elásticos. Toque duas vezes num para tirá-lo.`, `Limit of ${this.level.maxBands} bands. Double-tap one to remove it.`));
      return;
    }
    if (this.world.bands.some((b) => (b.a === d.from && b.b === d.target) || (b.b === d.from && b.a === d.target))) return;
    this.world.bands.push({ a: d.from, b: d.target, fixed: false });
    const v = this._vis();
    v.dx = 0.006; // pequeno "tremor" ao nascer
    this.vis.push(v);
    this.hooks.audio.pluck(this._bandFreq(this.world.bands.at(-1)), 0.7, this._pan(d.x));
    this.hooks.haptic(14);
    this._status();
  }

  _removeBand(k) {
    if (this.world.bands[k].fixed) return;
    const band = this.world.bands[k];
    const A = this.world.pins[band.a], B = this.world.pins[band.b];
    for (let i = 0; i < 14; i++) {
      const s = Math.random();
      this._spark(this.X(A.x + (B.x - A.x) * s), this.Y(A.y + (B.y - A.y) * s), BAND, 1, 0.4);
    }
    this.world.bands.splice(k, 1);
    this.vis.splice(k, 1);
    this.hooks.audio.pop(this._pan(this.X(A.x)));
    this.hooks.haptic(12);
    this._status();
  }

  _updatePreview(d) {
    const now = performance.now();
    if (this.preview && now - this.preview.at < 45 && Math.abs(this.preview.dx - d.dx) + Math.abs(this.preview.dy - d.dy) < 0.004) return;
    if (this.guide <= 0) { this.preview = null; return; }
    const shot = { band: d.band, s: d.s, dx: d.dx, dy: d.dy };
    const { paths } = simulate(this.world, shot, { trace: true, maxT: 6 });
    this.preview = { at: now, dx: d.dx, dy: d.dy, paths, ball: d.ball };
  }

  _bandFreq(band) {
    const A = this.world.pins[band.a], B = this.world.pins[band.b];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    return noteFreq(Math.round((1 - Math.min(1, Math.max(0, (L - 0.1) / 0.9))) * 12) + 1);
  }

  _pan(x) { return ((x / this.w) * 2 - 1) * 0.7; }

  _spark(x, y, color, n = 12, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (0.12 + Math.random() * 0.3) * this.S * speed;
      this.fx.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t0: this.time, life: 0.5 + Math.random() * 0.5 });
    }
  }

  // ---------- Laço principal ----------
  _frame = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    advance(this.world, dt);
    this._events();
    this._bandsSpring(dt);
    this._rules(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  };

  _events() {
    const { audio, haptic } = this.hooks;
    for (const ev of this.world.events) {
      const x = this.X(ev.x ?? 0.5), pan = this._pan(x);
      const vol = Math.min(1, (ev.v || 0) / 2);
      if (ev.type === 'wall') { audio.pluck(noteFreq(1), 0.15 + vol * 0.4, pan, 0.25); this.fx.push({ type: 'ring', x, y: this.Y(ev.y), t0: this.time, life: 0.4, color: RAIL }); }
      if (ev.type === 'box' || ev.type === 'pin') audio.pluck(noteFreq(3), 0.15 + vol * 0.4, pan, 0.2);
      if (ev.type === 'ball') { audio.pluck(noteFreq(11), 0.25 + vol * 0.5, pan, 0.3); haptic(8); }
      if (ev.type === 'band') {
        const v = this.vis[ev.band];
        const n = bandNormal(this.world, this.world.bands[ev.band]);
        if (v) { v.s = ev.s; v.vx -= n[0] * ev.v * 0.25; v.vy -= n[1] * ev.v * 0.25; }
        audio.pluck(this._bandFreq(this.world.bands[ev.band]), 0.25 + vol * 0.6, pan, 1);
        haptic(10);
      }
      if (ev.type === 'lip') { audio.pluck(noteFreq(8), 0.3, pan, 0.2); setTimeout(() => audio.pluck(noteFreq(9), 0.25, pan, 0.2), 70); this.hooks.onMessage?.(L('Forte demais! A bola espirrou na borda.', 'Too hard! The ball lipped out.')); }
      if (ev.type === 'drop') { const hole = this.world.holes[ev.hole]; audio.chime(noteFreq(12), 0.7, this._pan(this.X(hole.x))); haptic(25); }
      if (ev.type === 'sunk') {
        const hole = this.world.holes[ev.hole];
        const b = this.world.balls[ev.ball];
        this._spark(this.X(hole.x), this.Y(hole.y), b.cue ? CUE : BALL_COLORS[b.c], 22, 1);
        this.fx.push({ type: 'ring', x: this.X(hole.x), y: this.Y(hole.y), t0: this.time, life: 0.7, color: BALL_COLORS[b.c] || CUE, big: true });
      }
      if (ev.type === 'wrong') {
        audio.nope();
        haptic(30);
        const b = this.world.balls[ev.ball];
        this.hooks.onMessage?.(b.cue ? L('A bola branca não pode entrar. Ela volta ao início.', 'The white ball can\'t go in. It goes back to the start.') : L('Buraco de outra cor! A bola volta ao início.', 'Wrong color hole! The ball goes back to the start.'));
      }
    }
    this.world.events.length = 0;
  }

  _bandsSpring(dt) {
    const w = 30, z = 0.16;
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    this.vis.forEach((v, k) => {
      if ([...this.drags.values()].some((d) => d.kind === 'pull' && d.band === k)) return;
      for (let i = 0; i < steps; i++) {
        v.vx += (-w * w * v.dx - 2 * z * w * v.vx) * h;
        v.vy += (-w * w * v.dy - 2 * z * w * v.vy) * h;
        v.dx += v.vx * h;
        v.dy += v.vy * h;
      }
      if (Math.abs(v.dx) + Math.abs(v.dy) < 1e-5 && Math.abs(v.vx) + Math.abs(v.vy) < 1e-4) v.dx = v.dy = v.vx = v.vy = 0;
    });
    this.fx = this.fx.filter((f) => this.time - f.t0 < f.life);
    for (const f of this.fx) if (f.type === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.93; f.vy *= 0.93; }
  }

  _rules(dt) {
    if (this.won || this.level.mode === 'free') return;
    const w = this.world;
    if (targetsLeft(w) === 0 && !anyMoving(w)) {
      this.winHold += dt;
      if (this.winHold > 0.5) {
        this.won = true;
        this.hooks.audio.arpeggio(7);
        this.hooks.haptic(40);
        setTimeout(() => this.hooks.onWin?.({ strokes: this.strokes, helpUsed: this.helpUsed }), 700);
      }
      return;
    }
    // Sem jogada possível: como no golfe, a bola volta ao estilingue (a tacada já contou).
    if (anyMoving(w) || this.strokes === 0 || this.drags.size) { this.stuckFor = 0; return; }
    if (grabCandidates(w).length) { this.stuckFor = 0; return; }
    if (this.bandsLeft > 0) {
      if (!this.stuckShown) { this.stuckShown = true; this.hooks.onMessage?.(L('Monte um elástico passando pela bola para a próxima tacada.', 'Set up a band across the ball for your next shot.')); }
      return;
    }
    this.stuckFor = (this.stuckFor || 0) + dt;
    if (this.stuckFor < 0.9) return;
    this.stuckFor = 0;
    const ball = w.balls[this.lastBall ?? 0];
    if (!ball || ball.state !== 'rest') return;
    this.fx.push({ type: 'ring', x: this.X(ball.x), y: this.Y(ball.y), t0: this.time, life: 0.5, color: '#B4B4FF' });
    Object.assign(ball, { x: ball.home.x, y: ball.home.y, vx: 0, vy: 0 });
    this.fx.push({ type: 'ring', x: this.X(ball.x), y: this.Y(ball.y), t0: this.time, life: 0.6, color: '#B4B4FF', big: true });
    this.hooks.audio.pluck(noteFreq(9), 0.3, 0, 0.4);
    this.hooks.onMessage?.(L('A bola voltou ao estilingue. Ajuste a força e tente de novo.', 'The ball is back in the slingshot. Adjust your force and try again.'));
  }

  // ---------- Desenho ----------
  _draw() {
    const c = this.ctx;
    const { S, ox, oy } = this;
    const w = this.world;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);

    // feltro preto + trilhos neon
    const pad = S * 0.018;
    c.save();
    c.beginPath();
    c.roundRect(ox - pad, oy - pad, S + pad * 2, S + pad * 2, S * 0.035);
    const felt = c.createRadialGradient(ox + S / 2, oy + S * 0.45, S * 0.1, ox + S / 2, oy + S / 2, S * 0.8);
    felt.addColorStop(0, '#15151f');
    felt.addColorStop(1, '#07070c');
    c.fillStyle = felt;
    c.fill();
    c.lineWidth = Math.max(2, S * 0.006);
    c.strokeStyle = hexA(RAIL, 0.35);
    c.shadowColor = RAIL;
    c.shadowBlur = 14;
    c.stroke();
    c.restore();

    // blocos
    for (const b of w.boxes) {
      c.beginPath();
      c.roundRect(this.X(b.x), this.Y(b.y), b.w * S, b.h * S, S * 0.01);
      c.fillStyle = '#1d1d2c';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.lineWidth = 1.5;
      c.stroke();
    }

    this._drawHoles();
    this._drawGuide();
    this._drawGhost();
    this._drawBands();
    this._drawPins();
    this._drawBalls();
    this._drawFx();
    if (this.level.tutorial && this.strokes === 0 && this.drags.size === 0) this._drawTutorial();
  }

  _holeAlpha() {
    const m = this.level.memory;
    if (!m) return 1;
    if (this.holeReveal && this.time < this.holeReveal) return 1;
    const t = this.time;
    return t < m ? 1 : Math.max(0.035, 1 - (t - m) / 0.8);
  }

  _drawHoles() {
    const c = this.ctx;
    const a = this._holeAlpha();
    for (const hole of this.world.holes) {
      const x = this.X(hole.x), y = this.Y(hole.y), r = hole.r * this.S;
      const col = hole.c != null ? BALL_COLORS[hole.c] : HOLE_GLOW;
      c.save();
      c.globalAlpha = a;
      const g = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
      g.addColorStop(0, hexA(col, 0.35));
      g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r * 2.2, 0, TAU); c.fill();
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.fillStyle = '#000';
      c.fill();
      c.lineWidth = Math.max(2, this.S * 0.005);
      c.strokeStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 12;
      c.stroke();
      if (hole.cap < 0.8) { // buraco "suave": anel interno pontilhado
        c.setLineDash([3, 4]);
        c.beginPath(); c.arc(x, y, r * 0.62, 0, TAU);
        c.lineWidth = 1.2; c.shadowBlur = 0;
        c.stroke();
      }
      c.restore();
    }
  }

  _drawGuide() {
    const pv = this.preview;
    if (!pv || this.guide <= 0) return;
    const c = this.ctx;
    pv.paths.forEach((path, i) => {
      if (!path.length) return;
      if (this.level.guideCueOnly && i !== pv.ball) return;
      const n = Math.max(2, Math.floor(path.length * this.guide));
      const b = this.world.balls[i];
      const col = b.cue ? CUE : BALL_COLORS[b.c];
      for (let k = 0; k < n; k += 2) {
        const [x, y] = path[k];
        const fade = 1 - k / n;
        c.beginPath();
        c.arc(this.X(x), this.Y(y), Math.max(1.4, this.S * 0.0035) * (0.6 + fade * 0.6), 0, TAU);
        c.fillStyle = hexA(i === pv.ball ? RAIL : col, 0.25 + fade * 0.6);
        c.fill();
      }
    });
  }

  _drawGhost() {
    const g = this.ghostShot;
    if (!g || this.drags.size) return;
    const band = this.world.bands[g.band];
    if (!band) return;
    const P = bandPoint(this.world, band, g.s);
    const k = ease((this.time % 2) / 1.4 > 1 ? 1 : (this.time % 2) / 1.4);
    const x = this.X(P.x + g.dx * k), y = this.Y(P.y + g.dy * k);
    const c = this.ctx;
    c.save();
    c.setLineDash([5, 6]);
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(this.X(P.x), this.Y(P.y)); c.lineTo(this.X(P.x + g.dx), this.Y(P.y + g.dy)); c.stroke();
    c.setLineDash([]);
    c.beginPath(); c.arc(this.X(P.x + g.dx), this.Y(P.y + g.dy), this.S * 0.022, 0, TAU);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke();
    c.beginPath(); c.arc(x, y, this.S * 0.016, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    c.restore();
  }

  _bandShape(k) {
    const w = this.world;
    const band = w.bands[k];
    const A = w.pins[band.a], B = w.pins[band.b];
    const drag = [...this.drags.values()].find((d) => d.kind === 'pull' && d.band === k);
    const v = this.vis[k];
    const s = drag ? drag.s : v.s;
    const P = bandPoint(w, band, s);
    const dx = drag ? drag.dx : v.dx, dy = drag ? drag.dy : v.dy;
    return { A, B, M: { x: P.x + dx, y: P.y + dy }, tension: Math.hypot(dx, dy) / MAX_PULL, drag };
  }

  _drawBands() {
    const c = this.ctx;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    this.world.bands.forEach((band, k) => {
      const { A, B, M, tension } = this._bandShape(k);
      const pts = [[A.x, A.y], [M.x, M.y], [B.x, B.y]].map(([x, y]) => [this.X(x), this.Y(y)]);
      const width = Math.max(2.5, this.S * BAND_T * 1.5) * (1 - tension * 0.45); // afina ao esticar
      const col = band.fixed ? BAND : '#C084FC';
      const trace = () => { c.beginPath(); c.moveTo(...pts[0]); c.lineTo(...pts[1]); c.lineTo(...pts[2]); };
      trace();
      c.strokeStyle = hexA(col, 0.18 + tension * 0.25);
      c.lineWidth = width * 4;
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = width;
      c.shadowColor = col;
      c.shadowBlur = 10 + tension * 14;
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = width * 0.3;
      c.stroke();
    });
    // elástico novo sendo esticado entre pinos
    for (const d of this.drags.values()) {
      if (d.kind !== 'new') continue;
      const p = this.world.pins[d.from];
      const tx = d.target >= 0 ? this.X(this.world.pins[d.target].x) : d.x;
      const ty = d.target >= 0 ? this.Y(this.world.pins[d.target].y) : d.y;
      c.strokeStyle = hexA('#C084FC', 0.25);
      c.lineWidth = this.S * 0.03;
      c.beginPath(); c.moveTo(this.X(p.x), this.Y(p.y)); c.lineTo(tx, ty); c.stroke();
      c.strokeStyle = '#C084FC';
      c.lineWidth = Math.max(2, this.S * 0.007);
      c.stroke();
    }
  }

  _drawPins() {
    const c = this.ctx;
    const r = Math.max(5, PIN_R * this.S);
    const targets = new Set([...this.drags.values()].flatMap((d) => (d.kind === 'new' ? [d.from, d.target] : [])));
    this.world.pins.forEach((p, i) => {
      const x = this.X(p.x), y = this.Y(p.y);
      if (targets.has(i)) {
        c.beginPath(); c.arc(x, y, r * 2.2, 0, TAU);
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2; c.stroke();
      }
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, '#f2f2f7');
      g.addColorStop(0.45, '#9a9aaa');
      g.addColorStop(1, '#2a2a36');
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.fillStyle = g; c.fill();
      c.strokeStyle = hexA(RAIL, 0.5); c.lineWidth = 1.2; c.stroke();
    });
  }

  _drawBalls() {
    const c = this.ctx;
    const r = BALL_R * this.S;
    this.world.balls.forEach((b) => {
      if (b.state === 'sunk') return;
      let x = b.x, y = b.y, scale = 1;
      const drag = [...this.drags.values()].find((d) => d.kind === 'pull' && d.ball === b.i);
      if (drag) {
        const band = this.world.bands[drag.band];
        const pos = pouchPosition(this.world, band, drag.s, drag.dx, drag.dy);
        x = pos.x; y = pos.y;
      }
      if (b.state === 'falling') scale = Math.max(0.2, 1 - b.fall / 0.3);
      const col = b.cue ? CUE : BALL_COLORS[b.c];
      const X = this.X(x), Y = this.Y(y), R = r * scale;
      const glow = c.createRadialGradient(X, Y, R * 0.5, X, Y, R * 2.6);
      glow.addColorStop(0, hexA(col, 0.4));
      glow.addColorStop(1, hexA(col, 0));
      c.fillStyle = glow;
      c.beginPath(); c.arc(X, Y, R * 2.6, 0, TAU); c.fill();
      const g = c.createRadialGradient(X - R * 0.35, Y - R * 0.4, R * 0.1, X, Y, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, col);
      g.addColorStop(1, hexA(col, 0.75));
      c.beginPath(); c.arc(X, Y, R, 0, TAU);
      c.fillStyle = g; c.fill();
    });
  }

  _drawFx() {
    const c = this.ctx;
    for (const f of this.fx) {
      const k = (this.time - f.t0) / f.life;
      if (f.type === 'spark') {
        c.beginPath(); c.arc(f.x, f.y, Math.max(0.6, this.S * 0.005 * (1 - k)), 0, TAU);
        c.fillStyle = hexA(f.color, 1 - k); c.fill();
      } else if (f.type === 'ring' || f.type === 'ripple') {
        c.beginPath(); c.arc(f.x, f.y, this.S * ((f.big ? 0.04 : 0.015) + ease(k) * (f.big ? 0.12 : 0.05)), 0, TAU);
        c.strokeStyle = hexA(f.color || '#B4B4FF', 0.6 * (1 - k)); c.lineWidth = 2; c.stroke();
      } else if (f.type === 'snap') {
        const e = ease(k);
        c.strokeStyle = hexA('#C084FC', 1 - k); c.lineWidth = 3;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2 + (f.x1 - f.x2) * e, f.y2 + (f.y1 - f.y2) * e); c.stroke();
      }
    }
  }

  // Fase 1: mão-fantasma puxando o elástico para trás.
  _drawTutorial() {
    const band = this.world.bands[0];
    if (!band) return;
    const P = bandPoint(this.world, band, 0.5);
    const cyc = (this.time % 2.4) / 2.4;
    const k = ease(Math.min(1, cyc / 0.6));
    const fade = cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15;
    const c = this.ctx;
    const x = this.X(P.x), y0 = this.Y(P.y), y = y0 + k * this.S * 0.11;
    c.save();
    c.globalAlpha = 0.9 * fade;
    c.setLineDash([5, 7]);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(x, y, this.S * 0.018, 0, TAU); c.fill();
    c.restore();
  }
}

function bandNormal(w, band) {
  const A = w.pins[band.a], B = w.pins[band.b];
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  return [-dy / L, dx / L];
}
