// Fases do Tensa. Coordenadas normalizadas (0–1) num tabuleiro quadrado.
// pins: [x, y]; seeds: { x, y, c } com c = índice de cor (0–3) ou -1 (espinho).
// solution: polígonos (índices de pinos) que resolvem a fase — usados na dica e no validador.
// par: nº de elásticos da solução (vale a 2ª estrela).

const grid = (cols, rows, a = 0.1, b = 0.9) => {
  const pts = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) pts.push([a + ((b - a) * c) / (cols - 1), a + ((b - a) * r) / (rows - 1)]);
  return pts;
};

const ring = (n, r, rotDeg = -90, cx = 0.5, cy = 0.5) =>
  Array.from({ length: n }, (_, k) => {
    const a = ((rotDeg + (360 * k) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

const polar = (deg, r, c, extra = {}) => {
  const a = (deg * Math.PI) / 180;
  return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a), c, ...extra };
};

const X = -1; // espinho

// Estrela de 4 pontas: anel externo (8) + anel interno nas diagonais (4).
const STAR_PINS = [...ring(8, 0.38), ...ring(4, 0.14, -45)];
const STAR_POLY = [0, 8, 2, 9, 4, 10, 6, 11];

export const WORLDS = [
  { id: 'w1', name: 'Primeiros Fios', blurb: 'Aprenda a esticar e prender.', skills: ['espacial'] },
  { id: 'w2', name: 'Poucos Fios', blurb: 'Elásticos contados: planeje antes.', skills: ['planejamento', 'espacial'] },
  { id: 'w3', name: 'Correntezas', blurb: 'Tudo se move. Antecipe o caminho.', skills: ['atencao', 'espacial'] },
  { id: 'w4', name: 'Eco', blurb: 'Ouça a melodia e toque de volta.', skills: ['memoria', 'atencao'] },
];

export const LEVELS = [
  // ---------- Mundo 1 ----------
  {
    id: '1', world: 0, name: 'Primeiro Fio', tutorial: true,
    pins: [[0.5, 0.24], [0.24, 0.74], [0.76, 0.74]],
    seeds: [{ x: 0.5, y: 0.56, c: 0 }],
    solution: [[0, 1, 2]],
  },
  {
    id: '2', world: 0, name: 'Quatro Cantos',
    tip: 'Puxe o elástico de novo para prender mais pinos.',
    pins: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
    seeds: [{ x: 0.4, y: 0.64, c: 0 }, { x: 0.63, y: 0.37, c: 0 }],
    solution: [[0, 1, 2, 3]],
  },
  {
    id: '3', world: 0, name: 'Duas Cores',
    tip: 'Cada cor quer o seu próprio elástico.',
    pins: grid(3, 3, 0.2, 0.8),
    seeds: [
      { x: 0.35, y: 0.35, c: 0 }, { x: 0.35, y: 0.65, c: 0 },
      { x: 0.65, y: 0.35, c: 1 }, { x: 0.65, y: 0.65, c: 1 },
    ],
    solution: [[0, 1, 7, 6], [1, 2, 8, 7]],
  },
  {
    id: '4', world: 0, name: 'Ninho',
    tip: 'Elásticos também fazem curvas para dentro. Dá para fazer com só 2.',
    pins: grid(4, 4, 0.15, 0.85),
    seeds: [
      { x: 0.5, y: 0.5, c: 1 },
      { x: 0.27, y: 0.27, c: 0 }, { x: 0.73, y: 0.27, c: 0 },
      { x: 0.73, y: 0.73, c: 0 }, { x: 0.27, y: 0.73, c: 0 },
    ],
    solution: [[5, 6, 10, 9], [4, 0, 3, 15, 12, 8, 9, 10, 6, 5]],
  },

  // ---------- Mundo 2 ----------
  {
    id: '5', world: 1, name: 'Ferradura', maxBands: 2,
    tip: 'Só 2 elásticos. Pense na forma antes de puxar.',
    pins: grid(4, 4, 0.15, 0.85),
    seeds: [
      { x: 0.27, y: 0.27, c: 2 }, { x: 0.27, y: 0.5, c: 2 }, { x: 0.27, y: 0.73, c: 2 },
      { x: 0.5, y: 0.73, c: 2 }, { x: 0.73, y: 0.73, c: 2 }, { x: 0.73, y: 0.5, c: 2 }, { x: 0.73, y: 0.27, c: 2 },
      { x: 0.5, y: 0.38, c: 3 },
    ],
    solution: [[0, 1, 9, 10, 2, 3, 15, 12], [1, 2, 10, 9]],
  },
  {
    id: '6', world: 1, name: 'Escada', maxBands: 2,
    pins: grid(5, 5),
    seeds: [
      { x: 0.2, y: 0.4, c: 0 }, { x: 0.2, y: 0.6, c: 0 }, { x: 0.2, y: 0.8, c: 0 },
      { x: 0.4, y: 0.6, c: 0 }, { x: 0.4, y: 0.8, c: 0 }, { x: 0.6, y: 0.8, c: 0 },
      { x: 0.4, y: 0.2, c: 1 }, { x: 0.6, y: 0.2, c: 1 }, { x: 0.8, y: 0.2, c: 1 },
      { x: 0.6, y: 0.4, c: 1 }, { x: 0.8, y: 0.4, c: 1 }, { x: 0.8, y: 0.6, c: 1 },
    ],
    solution: [[5, 6, 11, 12, 17, 18, 23, 20], [1, 4, 19, 18, 13, 12, 7, 6]],
  },
  {
    id: '7', world: 1, name: 'Pente', maxBands: 3,
    pins: grid(5, 5),
    seeds: [
      { x: 0.2, y: 0.2, c: 3 }, { x: 0.5, y: 0.2, c: 3 }, { x: 0.8, y: 0.2, c: 3 },
      { x: 0.2, y: 0.5, c: 3 }, { x: 0.2, y: 0.8, c: 3 }, { x: 0.6, y: 0.5, c: 3 }, { x: 0.6, y: 0.8, c: 3 },
      { x: 0.4, y: 0.5, c: 1 }, { x: 0.4, y: 0.8, c: 1 }, { x: 0.8, y: 0.5, c: 1 }, { x: 0.8, y: 0.8, c: 1 },
    ],
    solution: [[0, 4, 9, 8, 23, 22, 7, 6, 21, 20], [6, 7, 22, 21], [8, 9, 24, 23]],
  },
  {
    id: '8', world: 1, name: 'Estrela', maxBands: 1,
    tip: 'Espinhos nunca podem ficar dentro de um elástico.',
    pins: STAR_PINS,
    seeds: [
      polar(-90, 0.27, 0), polar(0, 0.27, 0), polar(90, 0.27, 0), polar(180, 0.27, 0),
      polar(-45, 0.27, X), polar(45, 0.27, X), polar(135, 0.27, X), polar(225, 0.27, X),
    ],
    solution: [STAR_POLY],
  },

  // ---------- Mundo 3 ----------
  {
    id: '9', world: 2, name: 'Maré',
    tip: 'As sementes passeiam. Envolva todo o caminho delas.',
    pins: grid(3, 3, 0.2, 0.8),
    seeds: [
      { x: 0.35, y: 0.35, c: 0, m: { type: 'orbit', r: 0.07, period: 4 } },
      { x: 0.35, y: 0.65, c: 0, m: { type: 'orbit', r: 0.07, period: 5, phase: 2 } },
      { x: 0.65, y: 0.35, c: 2, m: { type: 'orbit', r: 0.07, period: 4.5, phase: 1 } },
      { x: 0.65, y: 0.65, c: 2, m: { type: 'orbit', r: 0.07, period: 5.5, phase: 3 } },
    ],
    solution: [[0, 1, 7, 6], [1, 2, 8, 7]],
  },
  {
    id: '10', world: 2, name: 'Vaivém', maxBands: 3,
    pins: grid(5, 5),
    seeds: [
      { x: 0.5, y: 0.2, c: 0, m: { type: 'slide', dx: 0.3, period: 6 } },
      { x: 0.5, y: 0.8, c: 1, m: { type: 'slide', dx: 0.3, period: 6, phase: Math.PI } },
      { x: 0.41, y: 0.5, c: 2, m: { type: 'slide', dy: 0.12, period: 3.5 } },
      { x: 0.59, y: 0.5, c: 2, m: { type: 'slide', dy: 0.12, period: 3.5, phase: Math.PI } },
      { x: 0.2, y: 0.5, c: X, m: { type: 'slide', dy: 0.1, period: 3 } },
      { x: 0.8, y: 0.5, c: X, m: { type: 'slide', dy: 0.1, period: 3, phase: Math.PI } },
    ],
    solution: [[0, 4, 9, 5], [15, 19, 24, 20], [6, 8, 18, 16]],
  },
  {
    id: '11', world: 2, name: 'Respiro',
    tip: 'Os pinos respiram. Os elásticos acompanham.',
    pins: grid(3, 3, 0.2, 0.8),
    pinMotion: {
      1: { type: 'slide', dx: 0.07, period: 3.6 },
      4: { type: 'slide', dx: 0.07, period: 3.6, phase: 0.8 },
      7: { type: 'slide', dx: 0.07, period: 3.6, phase: 1.6 },
      3: { type: 'slide', dy: 0.04, period: 5 },
      5: { type: 'slide', dy: 0.04, period: 5, phase: Math.PI },
    },
    seeds: [
      { x: 0.3, y: 0.32, c: 3 }, { x: 0.3, y: 0.68, c: 3 },
      { x: 0.7, y: 0.32, c: 0 }, { x: 0.7, y: 0.68, c: 0 },
    ],
    solution: [[0, 1, 7, 6], [1, 2, 8, 7]],
  },
  {
    id: '12', world: 2, name: 'Carrossel', maxBands: 2,
    tip: 'Tudo gira devagar. Cada cor no seu pedaço.',
    pins: [...ring(8, 0.38, 0), [0.5, 0.5]],
    spin: { type: 'spin', cx: 0.5, cy: 0.5, period: 34 },
    seeds: [
      polar(18, 0.25, 1), polar(45, 0.25, 1), polar(72, 0.25, 1),
      polar(198, 0.25, 0), polar(225, 0.25, 0), polar(252, 0.25, 0),
      polar(135, 0.25, X), polar(315, 0.25, X),
    ],
    solution: [[8, 0, 1, 2], [8, 4, 5, 6]],
  },

  // ---------- Mundo 4: Eco (memória auditiva) ----------
  echoLevel('13', 'Eco I', [5, 6, 7, 8, 9], [3, 4, 5]),
  echoLevel('14', 'Eco II', [5, 6, 7, 8, 9, 10, 11], [4, 5, 6]),
  echoLevel('15', 'Eco III', [7, 10, 5, 11, 6, 9, 8], [5, 6, 7]),
];

// Harpa: cada corda é um elástico de 2 pinos; cordas mais longas soam mais graves.
function echoLevel(id, name, notes, rounds) {
  const n = notes.length;
  const pins = [];
  const strings = [];
  notes.forEach((note, k) => {
    const x = 0.14 + (0.72 * k) / (n - 1);
    const len = 0.7 - (note - 5) * 0.065;
    const top = 0.5 - len / 2;
    pins.push([x, top], [x, top + len]);
    strings.push([2 * k, 2 * k + 1, note]);
  });
  return {
    id, world: 3, name, mode: 'echo', pins, strings, rounds,
    tip: 'Ouça a melodia e toque as cordas na mesma ordem.',
  };
}

// Ateliê: tabuleiro livre, sem objetivo — um instrumento para criar.
export const FREE = {
  id: 'livre', name: 'Ateliê Livre', mode: 'free',
  tip: 'Sem regras. Estique, toque, crie.',
  pins: grid(6, 6),
  seeds: [
    { x: 0.26, y: 0.3, c: 0, m: { type: 'orbit', r: 0.08, period: 9 } },
    { x: 0.7, y: 0.26, c: 1, m: { type: 'orbit', r: 0.1, period: 12, phase: 1 } },
    { x: 0.5, y: 0.52, c: 2, m: { type: 'orbit', r: 0.12, period: 14, phase: 2 } },
    { x: 0.3, y: 0.74, c: 3, m: { type: 'orbit', r: 0.07, period: 8, phase: 3 } },
    { x: 0.74, y: 0.7, c: 0, m: { type: 'orbit', r: 0.09, period: 10, phase: 4 } },
  ],
};
