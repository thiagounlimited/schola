// Garante que toda fase do Lume é vencível com 3 estrelas por quem faz uma coisa de cada vez,
// e mostra o que acontece com quem pula de chama em chama.
// Uso: node tools/check-lume.js [id da fase]
import { LEVELS } from '../games/lume/levels.js';
import { Board } from '../games/lume/engine.js';
import { scoreLevel } from '../games/lume/index.js';

const only = process.argv[2];
const DT = 1 / 60;
const noop = () => {};
const audio = { pluck: noop, chime: noop, nope: noop, pop: noop, arpeggio: noop, setFlow: noop };
let failures = 0;

function makeBoard(level, w = 800, h = 600) {
  const b = Object.create(Board.prototype);
  Object.assign(b, { level, free: false, w, h, dpr: 1, helpOn: false, dust: [] });
  b.R = Math.max(24, Math.min(58, Math.min(w, h) * 0.075));
  b.hooks = { audio, haptic: noop, onMessage: noop, onStatus: noop, onWin: noop, onLose: noop };
  b.restart();
  return b;
}

const press = (b, q) => { if (b.ptr) Object.assign(b.ptr, q); else b.ptr = { id: 1, ...q }; };
const lift = (b) => { if (b.ptr) b._up({ pointerId: 1 }); };

// Monotarefa: segue a sugestão da Ajuda e estaciona antes de atender sinais.
function calm(b) {
  const urgent = b._live().find((f) => f.kind === 'urgent');
  const last = b.lastFlame;
  if (urgent && b.level.park && last && !last.done && !last.gone && last.progress > 0 && !last.parked && last.kind !== 'urgent') {
    if (b.ptr) { lift(b); return; }
    if (b.anchor) { b._park(b.anchor.f); return; }
  }
  const f = b.recommend();
  if (f) press(b, b._pos(f)); else lift(b);
}

// Multitarefa: troca de chama a cada 1,5 s e toca em toda bolha que aparece.
function zapper(b) {
  const bub = b.bubbles.find((x) => !x.out);
  if (bub) { b._bait(bub); return; }
  const live = b._live();
  if (!live.length) { lift(b); return; }
  const k = Math.floor(b.t / 1.5) % live.length;
  press(b, b._pos(live[k]));
}

function run(level, bot) {
  const b = makeBoard(level);
  for (let i = 0; i < 60 * 120 && !b.ended; i++) { bot(b); b.step(DT); }
  if (!b.ended) return { won: false, reason: 'tempo esgotado', b };
  return { won: b.won, reason: b.reason, r: b.result, b };
}

for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  const c = run(level, calm);
  const z = run(level, zapper);
  const cs = c.won ? scoreLevel(level, c.r) : null;
  const zs = z.won ? scoreLevel(level, z.r) : null;
  const ok = c.won && cs.stars === 3;
  if (!ok) failures++;
  const calmTxt = c.won ? `${cs.stars}★ ${cs.points}/${level.points} · luz sobrando ${c.r.energyLeft.toFixed(1)} s · ${c.b.t.toFixed(1)} s` : `NÃO VENCEU (${c.reason})`;
  const zapTxt = z.won ? `${zs.stars}★ ${zs.points}` : `perde (${z.reason})`;
  console.log(`${ok ? '✓' : '✗'} ${level.id.padStart(2)} ${level.name.padEnd(24)} calmo: ${calmTxt}  |  multitarefa: ${zapTxt}`);
}
if (failures) { console.log(`\n${failures} fase(s) com problema.`); process.exit(1); }
console.log('\nTodas as fases do Lume são vencíveis com 3 estrelas fazendo uma coisa de cada vez.');
