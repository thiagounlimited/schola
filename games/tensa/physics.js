// Física do Tensa (pura, determinística): estilingue de elástico + bilhar/golfe.
// Usada pelo jogo, pela mira prevista e pelo validador de fases (Node).
// Unidades: tabuleiro quadrado 0–1; tempo em segundos.

export const TAU = Math.PI * 2;
export const BALL_R = 0.022;
export const HOLE_R = 0.042;
export const PIN_R = 0.013;
export const BAND_T = 0.006; // meia-espessura do elástico
export const MAX_PULL = 0.3;
export const LAUNCH = 8.5; // velocidade = puxada × LAUNCH
export const LOAD_R = 0.07; // distância máxima para a bola "entrar na bolsa" do estilingue
export const CAPTURE = 1.05; // acima desta velocidade a bola espirra da borda do buraco
const DT = 1 / 240;
const DECEL = 0.85;
const DAMP = 0.42;
const STOP = 0.012;
const E = { wall: 0.72, band: 0.9, box: 0.55, pin: 0.6, ball: 0.94 };

export function motionAt(x0, y0, m, t) {
  if (!m) return [x0, y0];
  const ph = (m.phase || 0) + (TAU * t) / m.period;
  if (m.type === 'slide') {
    const s = Math.sin(ph);
    return [x0 + (m.dx || 0) * s, y0 + (m.dy || 0) * s];
  }
  if (m.type === 'orbit') return [x0 + m.r * Math.cos(ph), y0 + m.r * Math.sin(ph)];
  return [x0, y0];
}

export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-12;
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const x = ax + s * dx, y = ay + s * dy;
  return { x, y, s, d: Math.hypot(px - x, py - y) };
}

export function createWorld(level) {
  return {
    t: 0,
    pins: level.pins.map(([x, y], i) => ({ x0: x, y0: y, x, y, m: level.pinMotion?.[i] || null })),
    bands: (level.bands || []).map(([a, b]) => ({ a, b, fixed: true })),
    balls: level.balls.map((b, i) => ({
      i, x: b.x, y: b.y, vx: 0, vy: 0, c: b.c ?? 0, cue: !!b.cue,
      home: { x: b.x, y: b.y }, state: 'rest', ghost: -1, ghostUntil: 0, lip: -1, fall: 0, hole: -1,
    })),
    holes: level.holes.map((h) => ({ x0: h.x, y0: h.y, x: h.x, y: h.y, c: h.c ?? null, m: h.m || null, r: h.r || HOLE_R, cap: h.cap || CAPTURE })),
    boxes: (level.boxes || []).map(([x, y, w, h]) => ({ x, y, w, h })),
    events: [],
  };
}

export function cloneWorld(w) {
  return {
    ...w,
    pins: w.pins.map((p) => ({ ...p })),
    bands: w.bands.map((b) => ({ ...b })),
    balls: w.balls.map((b) => ({ ...b, home: { ...b.home } })),
    holes: w.holes.map((h) => ({ ...h })),
    boxes: w.boxes,
    events: [],
  };
}

export function placeMovers(w) {
  for (const p of w.pins) [p.x, p.y] = motionAt(p.x0, p.y0, p.m, w.t);
  for (const h of w.holes) [h.x, h.y] = motionAt(h.x0, h.y0, h.m, w.t);
}

export const bandEnds = (w, band) => [w.pins[band.a], w.pins[band.b]];

// Ponto do elástico (em repouso) no parâmetro s.
export function bandPoint(w, band, s) {
  const [A, B] = bandEnds(w, band);
  return { x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * s };
}

// Bola parada mais próxima do ponto agarrado: é ela que vai na "bolsa" do estilingue.
export function loadableBall(w, band, s) {
  const p = bandPoint(w, band, s);
  let best = -1, bd = LOAD_R;
  for (const b of w.balls) {
    if (b.state !== 'rest') continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bd) { bd = d; best = b.i; }
  }
  return best;
}

export function clampPull(dx, dy) {
  const L = Math.hypot(dx, dy);
  return L > MAX_PULL ? [(dx * MAX_PULL) / L, (dy * MAX_PULL) / L] : [dx, dy];
}

// Onde a bola fica enquanto o elástico está puxado: na bolsa, à frente do ponto de puxada.
export function pouchPosition(w, band, s, dx, dy) {
  const p = bandPoint(w, band, s);
  const L = Math.hypot(dx, dy) || 1;
  return { x: p.x + dx - (dx / L) * (BALL_R + BAND_T), y: p.y + dy - (dy / L) * (BALL_R + BAND_T) };
}

// Solta o estilingue: a bola sai da bolsa na direção oposta à puxada.
export function launch(w, bandIdx, s, dx, dy) {
  const band = w.bands[bandIdx];
  [dx, dy] = clampPull(dx, dy);
  const bi = loadableBall(w, band, s);
  if (bi < 0 || Math.hypot(dx, dy) < 0.015) return -1;
  const ball = w.balls[bi];
  const pos = pouchPosition(w, band, s, dx, dy);
  ball.x = Math.min(1 - BALL_R, Math.max(BALL_R, pos.x));
  ball.y = Math.min(1 - BALL_R, Math.max(BALL_R, pos.y));
  ball.vx = -dx * LAUNCH;
  ball.vy = -dy * LAUNCH;
  ball.state = 'move';
  ball.ghost = bandIdx; // não colide com o próprio elástico logo após o disparo
  ball.ghostUntil = w.t + 0.35;
  return bi;
}

const live = (b) => b.state === 'move' || b.state === 'rest';

function bounce(b, nx, ny, e) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  b.state = 'move';
  return -vn;
}

function stepOnce(w, h) {
  w.t += h;
  placeMovers(w);
  for (const b of w.balls) {
    if (b.state === 'falling') {
      const hole = w.holes[b.hole];
      b.x += (hole.x - b.x) * Math.min(1, h * 14);
      b.y += (hole.y - b.y) * Math.min(1, h * 14);
      b.fall += h;
      if (b.fall > 0.28) {
        b.fall = 0;
        if (b.wrong) {
          b.state = 'rest'; b.wrong = false;
          b.x = b.home.x; b.y = b.home.y; b.vx = b.vy = 0;
          w.events.push({ type: 'respawn', ball: b.i });
        } else {
          b.state = 'sunk';
          w.events.push({ type: 'sunk', ball: b.i, hole: b.hole });
        }
      }
      continue;
    }
    if (b.state !== 'move') continue;
    b.x += b.vx * h;
    b.y += b.vy * h;
    const sp = Math.hypot(b.vx, b.vy);
    const ns = Math.max(0, sp - DECEL * h) * (1 - DAMP * h);
    if (ns < STOP) { b.vx = b.vy = 0; b.state = 'rest'; continue; }
    b.vx *= ns / sp;
    b.vy *= ns / sp;
  }

  for (const b of w.balls) {
    if (b.state !== 'move') continue;
    // paredes
    if (b.x < BALL_R) { b.x = BALL_R; const v = bounce(b, 1, 0, E.wall); if (v > 0.2) w.events.push({ type: 'wall', x: b.x, y: b.y, v }); }
    if (b.x > 1 - BALL_R) { b.x = 1 - BALL_R; const v = bounce(b, -1, 0, E.wall); if (v > 0.2) w.events.push({ type: 'wall', x: b.x, y: b.y, v }); }
    if (b.y < BALL_R) { b.y = BALL_R; const v = bounce(b, 0, 1, E.wall); if (v > 0.2) w.events.push({ type: 'wall', x: b.x, y: b.y, v }); }
    if (b.y > 1 - BALL_R) { b.y = 1 - BALL_R; const v = bounce(b, 0, -1, E.wall); if (v > 0.2) w.events.push({ type: 'wall', x: b.x, y: b.y, v }); }
    // blocos
    for (const r of w.boxes) {
      const cx = Math.max(r.x, Math.min(b.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(b.y, r.y + r.h));
      const d = Math.hypot(b.x - cx, b.y - cy);
      if (d < BALL_R) {
        let nx, ny;
        if (d > 1e-9) { nx = (b.x - cx) / d; ny = (b.y - cy) / d; } else { nx = 0; ny = -1; }
        b.x = cx + nx * BALL_R;
        b.y = cy + ny * BALL_R;
        const v = bounce(b, nx, ny, E.box);
        if (v > 0.2) w.events.push({ type: 'box', x: b.x, y: b.y, v });
      }
    }
    // pinos
    for (const p of w.pins) {
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d < BALL_R + PIN_R && d > 1e-9) {
        const nx = dx / d, ny = dy / d;
        b.x = p.x + nx * (BALL_R + PIN_R);
        b.y = p.y + ny * (BALL_R + PIN_R);
        const v = bounce(b, nx, ny, E.pin);
        if (v > 0.2) w.events.push({ type: 'pin', x: b.x, y: b.y, v });
      }
    }
    // elásticos (tabelas de borracha)
    w.bands.forEach((band, k) => {
      if (b.ghost === k && w.t < b.ghostUntil) return;
      const [A, B] = bandEnds(w, band);
      const c = closestOnSegment(b.x, b.y, A.x, A.y, B.x, B.y);
      if (c.d < BALL_R + BAND_T && c.d > 1e-9) {
        const nx = (b.x - c.x) / c.d, ny = (b.y - c.y) / c.d;
        b.x = c.x + nx * (BALL_R + BAND_T);
        b.y = c.y + ny * (BALL_R + BAND_T);
        const v = bounce(b, nx, ny, E.band);
        if (v > 0.15) w.events.push({ type: 'band', band: k, s: c.s, x: b.x, y: b.y, v });
      }
    });
  }

  // bola com bola
  for (let i = 0; i < w.balls.length; i++) {
    const a = w.balls[i];
    if (!live(a)) continue;
    for (let j = i + 1; j < w.balls.length; j++) {
      const b = w.balls[j];
      if (!live(b) || (a.state === 'rest' && b.state === 'rest')) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= BALL_R * 2 || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d;
      const overlap = BALL_R * 2 - d;
      a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv >= 0) continue;
      const jimp = (-(1 + E.ball) * rv) / 2;
      a.vx -= jimp * nx; a.vy -= jimp * ny;
      b.vx += jimp * nx; b.vy += jimp * ny;
      a.state = b.state = 'move';
      w.events.push({ type: 'ball', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: -rv });
    }
  }

  // buracos
  for (const b of w.balls) {
    if (b.state !== 'move' && b.state !== 'rest') continue;
    let inside = -1;
    w.holes.forEach((hole, k) => { if (Math.hypot(b.x - hole.x, b.y - hole.y) < hole.r) inside = k; });
    if (inside < 0) { b.lip = -1; continue; }
    const hole = w.holes[inside];
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < hole.cap) {
      const ok = !b.cue && (hole.c == null || hole.c === b.c);
      b.state = 'falling';
      b.hole = inside;
      b.wrong = !ok;
      b.vx = b.vy = 0;
      w.events.push({ type: ok ? 'drop' : 'wrong', ball: b.i, hole: inside });
    } else if (b.lip !== inside) {
      // rápida demais: espirra na borda (desvia e perde força)
      b.lip = inside;
      const off = ((b.x - hole.x) * b.vy - (b.y - hole.y) * b.vx) / (sp * hole.r);
      const ang = off * 0.5;
      const c = Math.cos(ang), s = Math.sin(ang);
      [b.vx, b.vy] = [(b.vx * c - b.vy * s) * 0.82, (b.vx * s + b.vy * c) * 0.82];
      w.events.push({ type: 'lip', x: b.x, y: b.y, v: sp });
    }
  }
}

// Avança a simulação em passos fixos (determinístico).
export function advance(w, dt) {
  w.acc = (w.acc || 0) + dt;
  while (w.acc >= DT) { stepOnce(w, DT); w.acc -= DT; }
}

export const anyMoving = (w) => w.balls.some((b) => b.state === 'move' || b.state === 'falling');
export const targetsLeft = (w) => w.balls.filter((b) => !b.cue && b.state !== 'sunk').length;

// Simula uma tacada até tudo parar. Devolve o mundo final e o caminho de cada bola.
export function simulate(world, shot, { maxT = 12, trace = false } = {}) {
  const w = cloneWorld(world);
  w.acc = 0;
  const paths = trace ? w.balls.map(() => []) : null;
  if (shot) launch(w, shot.band, shot.s, shot.dx, shot.dy);
  const t0 = w.t;
  let k = 0;
  while (w.t - t0 < maxT) {
    stepOnce(w, DT);
    if (trace && k++ % 4 === 0) w.balls.forEach((b, i) => { if (b.state === 'move') paths[i].push([b.x, b.y]); });
    if (!anyMoving(w)) break;
  }
  return { world: w, paths, events: w.events };
}
