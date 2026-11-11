// CRUZA — gerador de palavras cruzadas. Puro e determinístico (mesma semente = mesma grade),
// para que o validador (tools/check-cruza.js) confira exatamente o que o jogador vai ver.
//
// buildGrid(pool, { count, size, seed, attempts })
//   pool: [{ answer: 'INFLACAO', ... }]   count: quantas palavras   size: lado máximo da grade
//   → { w, h, words: [{ entry, row, col, dir: 'a'|'d', num }], cells: [[letra|null]] } ou null

export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hash(String(seed));
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Grade esparsa: chave "r,c" → { ch, a, d } (a/d: já usada por palavra horizontal/vertical).
class Sparse {
  constructor() { this.m = new Map(); this.minR = 0; this.maxR = -1; this.minC = 0; this.maxC = -1; this.words = []; }
  get(r, c) { return this.m.get(`${r},${c}`); }
  span(r0, c0, r1, c1) {
    if (this.maxR < this.minR) return [r1 - r0 + 1, c1 - c0 + 1];
    return [Math.max(this.maxR, r1) - Math.min(this.minR, r0) + 1, Math.max(this.maxC, c1) - Math.min(this.minC, c0) + 1];
  }

  // Quantos cruzamentos a palavra faria nessa posição, ou -1 se for inválida.
  fit(word, r, c, dir, size) {
    const dr = dir === 'd' ? 1 : 0;
    const dc = dir === 'a' ? 1 : 0;
    const n = word.length;
    const [h, w] = this.span(r, c, r + dr * (n - 1), c + dc * (n - 1));
    if (h > size || w > size) return -1;
    if (this.get(r - dr, c - dc) || this.get(r + dr * n, c + dc * n)) return -1;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cell = this.get(rr, cc);
      if (cell) {
        if (cell.ch !== word[i] || cell[dir]) return -1;
        cross++;
      } else if (this.get(rr + dc, cc + dr) || this.get(rr - dc, cc - dr)) {
        return -1; // vizinho lateral formaria uma palavra que não existe
      }
    }
    if (cross === n) return -1;
    return cross;
  }

  put(entry, r, c, dir) {
    const word = entry.answer;
    const dr = dir === 'd' ? 1 : 0;
    const dc = dir === 'a' ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const k = `${rr},${cc}`;
      const cell = this.m.get(k) || { ch: word[i] };
      cell[dir] = true;
      this.m.set(k, cell);
      if (this.maxR < this.minR) { this.minR = this.maxR = rr; this.minC = this.maxC = cc; }
      this.minR = Math.min(this.minR, rr); this.maxR = Math.max(this.maxR, rr);
      this.minC = Math.min(this.minC, cc); this.maxC = Math.max(this.maxC, cc);
    }
    this.words.push({ entry, row: r, col: c, dir });
  }

  // Todas as posições válidas que cruzam letras já colocadas.
  options(word, size) {
    const out = [];
    for (const [k, cell] of this.m) {
      const [r, c] = k.split(',').map(Number);
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell.ch) continue;
        for (const dir of ['a', 'd']) {
          if (cell[dir]) continue;
          const sr = dir === 'd' ? r - i : r;
          const sc = dir === 'a' ? c - i : c;
          const x = this.fit(word, sr, sc, dir, size);
          if (x > 0) out.push({ r: sr, c: sc, dir, cross: x });
        }
      }
    }
    return out;
  }
}

function attempt(pool, count, size, rand) {
  const order = shuffle(pool, rand);
  // Começa por uma palavra comprida (mais chances de cruzamento), no meio.
  const firstIdx = order.findIndex((e) => e.answer.length >= Math.min(7, size - 1));
  const first = order.splice(Math.max(0, firstIdx), 1)[0];
  const g = new Sparse();
  g.put(first, 0, 0, rand() < 0.5 ? 'a' : 'd');
  let crossings = 0;
  let pass = 0;
  while (g.words.length < count && pass < 3) {
    let progress = false;
    for (let i = 0; i < order.length && g.words.length < count; i++) {
      const e = order[i];
      const opts = g.options(e.answer, size);
      if (!opts.length) continue;
      const best = Math.max(...opts.map((o) => o.cross));
      const top = opts.filter((o) => o.cross === best);
      const o = top[Math.floor(rand() * top.length)];
      g.put(e, o.r, o.c, o.dir);
      crossings += o.cross;
      order.splice(i, 1);
      i--;
      progress = true;
    }
    if (!progress) break;
    pass++;
  }
  return { g, crossings };
}

export function buildGrid(pool, { count, size = 13, seed = 1, attempts = 80 } = {}) {
  const usable = dedupe(pool).filter((e) => e.answer.length >= 3 && e.answer.length <= size);
  if (usable.length < count) return null;
  const rand = rng(seed);
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < attempts; k++) {
    const { g, crossings } = attempt(usable, count, size, rand);
    if (g.words.length < count) continue;
    const area = (g.maxR - g.minR + 1) * (g.maxC - g.minC + 1);
    const score = crossings * 10 - area * 0.4;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best ? finish(best) : null;
}

function dedupe(pool) {
  const seen = new Set();
  return pool.filter((e) => (seen.has(e.answer) ? false : (seen.add(e.answer), true)));
}

// Normaliza coordenadas para começar em 0 e numera as palavras na ordem de leitura.
function finish(g) {
  const h = g.maxR - g.minR + 1;
  const w = g.maxC - g.minC + 1;
  const cells = Array.from({ length: h }, () => Array(w).fill(null));
  for (const [k, cell] of g.m) {
    const [r, c] = k.split(',').map(Number);
    cells[r - g.minR][c - g.minC] = cell.ch;
  }
  const words = g.words.map((p) => ({ ...p, row: p.row - g.minR, col: p.col - g.minC }));
  const starts = [...new Set(words.map((p) => `${p.row},${p.col}`))]
    .map((k) => k.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const num = new Map(starts.map(([r, c], i) => [`${r},${c}`, i + 1]));
  words.forEach((p) => { p.num = num.get(`${p.row},${p.col}`); });
  words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'a' ? -1 : 1));
  return { w, h, cells, words };
}

// Células de uma palavra colocada.
export const cellsOf = (p) => Array.from({ length: p.entry.answer.length }, (_, i) => [p.row + (p.dir === 'd' ? i : 0), p.col + (p.dir === 'a' ? i : 0)]);
