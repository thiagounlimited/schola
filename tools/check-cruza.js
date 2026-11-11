// Confere o CRUZA: o banco de palavras (campos, tamanhos, dica sem a resposta) e se cada fase
// monta a grade com todas as palavras, dentro do tamanho, nos dois idiomas.
// Uso: node tools/check-cruza.js [id da fase]
import { LEVELS, FREE } from '../games/cruza/levels.js';
import { CATS, words, normalize } from '../games/cruza/bank.js';
import { levelGrid } from '../games/cruza/index.js';
import { buildGrid, cellsOf } from '../games/cruza/generator.js';

const only = process.argv[2];
let failures = 0;
const fail = (msg) => { failures++; console.log(`✗ ${msg}`); };

// ---------- Banco ----------
const LIMITS = { clue: 90, clue2: 90, explain: 280, analogy: 220 };
for (const lg of ['pt', 'en']) {
  const seen = new Set();
  for (const c of CATS) {
    const list = words(c.id, lg);
    if (list.length < 12) fail(`${lg}/${c.id}: só ${list.length} palavras (mínimo 12)`);
    for (const e of list) {
      if (seen.has(e.answer)) fail(`${lg}: ${e.answer} repetida entre categorias (ok, mas evite)`);
      seen.add(e.answer);
      if (!/^[A-Z]{3,13}$/.test(e.answer)) fail(`${e.id}: resposta inválida "${e.answer}"`);
      for (const [k, max] of Object.entries(LIMITS)) {
        if (!e[k]) fail(`${e.id}: falta ${k}`);
        else if (e[k].length > max) fail(`${e.id}: ${k} com ${e[k].length} caracteres (máx. ${max})`);
      }
      for (const k of ['clue', 'clue2']) if (e[k] && normalize(e[k]).includes(e.answer)) fail(`${e.id}: ${k} entrega a resposta`);
    }
  }
  console.log(`  ${lg}: ${CATS.map((c) => `${c.id} ${words(c.id, lg).length}`).join(' · ')}`);
}

// ---------- Fases ----------
function checkGrid(label, grid, count, size) {
  if (!grid) { fail(`${label}: não montou a grade`); return; }
  if (grid.words.length !== count) fail(`${label}: ${grid.words.length}/${count} palavras`);
  if (grid.w > size || grid.h > size) fail(`${label}: grade ${grid.w}×${grid.h} passa de ${size}`);
  // Toda casa preenchida bate com as palavras que passam por ela.
  for (const p of grid.words) cellsOf(p).forEach(([r, c], i) => {
    if (grid.cells[r][c] !== p.entry.answer[i]) fail(`${label}: conflito em ${p.entry.answer}`);
  });
  return true;
}

for (const lg of ['pt', 'en']) {
  for (const level of LEVELS) {
    if (only && level.id !== only) continue;
    const grid = levelGrid(level, lg);
    const label = `${lg} fase ${level.id.padStart(2)} ${level.cat || 'todas'}`;
    if (checkGrid(label, grid, level.count, level.size)) {
      const cross = grid.cells.flat().filter(Boolean).length;
      console.log(`✓ ${label.padEnd(26)} ${grid.w}×${grid.h} · ${grid.words.length} palavras · ${grid.words.map((p) => p.entry.answer).join(' ')} (${cross} casas)`);
    }
  }
  if (!only) {
    // Grade livre: 20 sementes por categoria.
    for (const c of [...CATS.map((x) => x.id), null]) {
      let ok = 0;
      for (let s = 0; s < 20; s++) {
        const grid = buildGrid(words(c, lg), { count: FREE.count, size: FREE.size, seed: s * 7919 });
        if (grid && grid.words.length === FREE.count) ok++;
      }
      if (ok < 20) fail(`${lg} grade livre ${c || 'todas'}: ${ok}/20 sementes montaram`);
    }
    console.log(`✓ ${lg} grade livre: todas as categorias montam`);
  }
}

if (failures) { console.log(`\n${failures} problema(s).`); process.exit(1); }
console.log('\nCRUZA: banco ok e todas as fases montam nos dois idiomas.');
