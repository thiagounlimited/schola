// Busca de tacadas por simulação: varre ângulos e forças de puxada para cada
// elástico com bola na bolsa. Usado pela Ajuda (no navegador) e pelo validador.
import { simulate, bandPoint, closestOnSegment, LOAD_R, MAX_PULL, TAU } from './physics.js';

// Pontos de agarre (elástico + parâmetro s) que têm uma bola parada na bolsa.
export function grabCandidates(w) {
  const out = [];
  w.bands.forEach((band, k) => {
    const A = w.pins[band.a], B = w.pins[band.b];
    for (const ball of w.balls) {
      if (ball.state !== 'rest') continue;
      const c = closestOnSegment(ball.x, ball.y, A.x, A.y, B.x, B.y);
      const s = Math.min(0.95, Math.max(0.05, c.s));
      const p = bandPoint(w, band, s);
      if (Math.hypot(ball.x - p.x, ball.y - p.y) < LOAD_R * 0.9) out.push({ band: k, s, ball: ball.i });
    }
  });
  return out;
}

export function shotList(w, { angleStep = 2, pullStep = 0.009 } = {}) {
  const shots = [];
  for (const g of grabCandidates(w)) {
    for (let a = 0; a < 360; a += angleStep) {
      const r = (a * TAU) / 360;
      for (let p = 0.03; p <= MAX_PULL + 1e-9; p += pullStep) shots.push({ band: g.band, s: g.s, dx: Math.cos(r) * p, dy: Math.sin(r) * p });
    }
  }
  return shots;
}

export function scoreResult(before, after) {
  const sunkBefore = before.balls.filter((b) => b.state === 'sunk').length;
  const sunk = after.balls.filter((b) => b.state === 'sunk').length - sunkBefore;
  const wrong = after.events.filter((e) => e.type === 'wrong').length;
  return { sunk, wrong };
}

// Procura a tacada que encaçapa mais bolas sem erro. Fatiado para não travar a tela:
// onProgress(frac) e um "budget" de milissegundos por fatia.
export async function findShot(w, { angleStep = 2, pullStep = 0.009, sliceMs = 24, onProgress, accept } = {}) {
  const shots = shotList(w, { angleStep, pullStep });
  let best = null;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  let t0 = performance.now();
  for (let i = 0; i < shots.length; i++) {
    const { world } = simulate(w, shots[i]);
    const sc = scoreResult(w, world);
    const ok = accept ? accept(world, sc) : sc.sunk > 0 && sc.wrong === 0;
    if (ok && (!best || sc.sunk > best.sc.sunk || (sc.sunk === best.sc.sunk && Math.hypot(shots[i].dx, shots[i].dy) < Math.hypot(best.shot.dx, best.shot.dy)))) {
      best = { shot: shots[i], sc, world };
    }
    if (performance.now() - t0 > sliceMs) {
      onProgress?.(i / shots.length);
      await yieldNow();
      t0 = performance.now();
    }
  }
  return best;
}
