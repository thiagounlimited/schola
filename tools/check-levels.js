// Garante que toda fase do Tensa tem solução dentro do par, simulando a física real.
// Fases com alvo móvel testam o disparo em vários instantes.
// Uso: node tools/check-levels.js [id da fase]
import { LEVELS } from '../games/tensa/levels.js';
import { createWorld, placeMovers, targetsLeft, simulate, cloneWorld } from '../games/tensa/physics.js';
import { shotList, scoreResult, grabCandidates } from '../games/tensa/solver.js';
import { performance } from 'node:perf_hooks';

globalThis.performance ??= performance;
const only = process.argv[2];
let failures = 0;

function bestShot(w, accept) {
  let best = null;
  for (const shot of shotList(w, { angleStep: 1.5, pullStep: 0.006 })) {
    const { world } = simulate(w, shot);
    const sc = scoreResult(w, world);
    if (accept(world, sc) && (!best || sc.sunk > best.sc.sunk)) best = { shot, world, sc };
  }
  return best;
}

// Busca em profundidade até o par: cada passo tenta encaçapar; se não der,
// aceita deixar uma bola em posição de tacada (para fases em etapas).
function solve(w, depth, path = []) {
  if (targetsLeft(w) === 0) return path;
  if (depth === 0) return null;
  const sinking = bestShot(w, (world, sc) => sc.sunk > 0 && sc.wrong === 0);
  if (sinking) {
    const r = solve(sinking.world, depth - 1, [...path, sinking.shot]);
    if (r) return r;
  }
  if (depth < 2) return null;
  // passo intermediário: a bola para encostada em outro elástico
  const tried = [];
  for (const shot of shotList(w, { angleStep: 3, pullStep: 0.012 })) {
    const { world } = simulate(w, shot);
    const g = grabCandidates(world).filter((c) => c.band !== shot.band);
    if (g.length && scoreResult(w, world).wrong === 0) tried.push({ shot, world });
    if (tried.length >= 40) break;
  }
  for (const t of tried) {
    const r = solve(t.world, depth - 1, [...path, t.shot]);
    if (r) return r;
  }
  return null;
}

for (const lv of LEVELS) {
  if (only && lv.id !== only) continue;
  const t0 = Date.now();
  const moving = lv.holes.some((h) => h.m) || lv.pinMotion;
  const starts = moving ? [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8] : [0];
  let sol = null, at = 0;
  for (const t of starts) {
    let w = createWorld(lv);
    w.t = t;
    placeMovers(w);
    // Fases sem elástico: tenta cada par de pinos que o jogador poderia ligar.
    const builds = lv.bands?.length ? [null] : lv.pins.flatMap((_, a) => lv.pins.map((__, b) => (a < b ? [a, b] : null))).filter(Boolean);
    for (const bld of builds) {
      const ww = cloneWorld(w);
      if (bld) ww.bands.push({ a: bld[0], b: bld[1] });
      sol = solve(ww, lv.par);
      if (sol) { if (bld) sol.unshift({ build: bld }); break; }
    }
    if (sol) { at = t; break; }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (sol) {
    const shots = sol.filter((s) => !s.build).map((s) => `(${s.dx.toFixed(3)}, ${s.dy.toFixed(3)})`).join(' → ');
    console.log(`✓ ${lv.id.padStart(2)} ${lv.name.padEnd(22)} ${sol.filter((s) => !s.build).length}/${lv.par} tacada(s) ${shots}${moving ? ` t=${at}` : ''}  [${secs}s]`);
  } else {
    failures++;
    console.log(`✗ ${lv.id.padStart(2)} ${lv.name.padEnd(22)} sem solução em ${lv.par} tacada(s)  [${secs}s]`);
  }
}
process.exitCode = failures ? 1 : 0;
