// Valida que toda fase do Tensa tem solução: a solução declarada precisa ser
// simples, caber no limite de elásticos e deixar todas as sementes felizes em
// todo instante (fases com movimento são amostradas ao longo de 60 s).
// Uso: node tools/check-levels.js
import { LEVELS } from '../games/tensa/levels.js';
import { motionAt, isSimplePoly, evaluate, distToSegment } from '../games/tensa/geometry.js';

const MARGIN = 0.02; // folga mínima entre semente e borda/pino
let failures = 0;

for (const lv of LEVELS) {
  const errs = [];
  if (lv.mode === 'echo') {
    const notes = lv.strings.map((s) => s[2]);
    if (new Set(notes).size !== notes.length) errs.push('cordas com notas repetidas');
  } else {
    const sol = lv.solution || [];
    if (lv.maxBands && sol.length > lv.maxBands) errs.push(`solução usa ${sol.length} > máximo ${lv.maxBands}`);
    const moving = lv.spin || lv.pinMotion || lv.seeds.some((s) => s.m);
    const times = moving ? Array.from({ length: 601 }, (_, i) => i * 0.1) : [0];
    for (const t of times) {
      const pins = lv.pins.map(([x, y], i) => motionAt(x, y, lv.pinMotion?.[i] || lv.spin, t));
      const seeds = lv.seeds.map((s) => {
        const [x, y] = motionAt(s.x, s.y, s.m || lv.spin, t);
        return { x, y, c: s.c };
      });
      const polys = sol.map((p) => p.map((i) => pins[i]));
      polys.forEach((poly, k) => { if (!isSimplePoly(poly)) errs.push(`t=${t.toFixed(1)} polígono ${k} não é simples`); });
      const ev = evaluate(seeds, polys);
      ev.seedInfo.forEach((s, k) => { if (!s.happy) errs.push(`t=${t.toFixed(1)} semente ${k} infeliz`); });
      for (const [k, s] of seeds.entries()) {
        for (const p of pins) if (Math.hypot(p[0] - s.x, p[1] - s.y) < MARGIN * 2) errs.push(`t=${t.toFixed(1)} semente ${k} encosta num pino`);
        for (const poly of polys)
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            if (distToSegment(s.x, s.y, a[0], a[1], b[0], b[1]).d < MARGIN) errs.push(`t=${t.toFixed(1)} semente ${k} rente a uma borda`);
          }
      }
      if (errs.length > 5) break;
    }
  }
  const uniq = [...new Set(errs)];
  if (uniq.length) {
    failures++;
    console.log(`✗ ${lv.id} ${lv.name}\n   ${uniq.slice(0, 6).join('\n   ')}`);
  } else {
    console.log(`✓ ${lv.id} ${lv.name}`);
  }
}
process.exitCode = failures ? 1 : 0;
