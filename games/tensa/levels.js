// Fases do Tensa: estilingue de elástico + bilhar/golfe.
// Coordenadas normalizadas 0–1 num tabuleiro quadrado.
// pins: [x, y]   bands: elásticos já montados [pinoA, pinoB]   maxBands: quantos o jogador pode montar
// balls: { x, y, c (cor), cue (bola branca de tacada) }   holes: { x, y, c (cor exigida), m (movimento), cap (velocidade máx. de captura) }
// boxes: [x, y, w, h]   guide: quanto da trajetória prevista aparece (0–1)   par: tacadas ideais
// skill: trilha de Sua Mente   focus: a habilidade específica treinada nesta fase.
import { distributePoints } from '../../js/scoring.js';

const BOTTOM = [[0.38, 0.86], [0.62, 0.86]];

const RAW = [
  {
    id: '1', name: 'Primeira Tacada', skill: 'espacial', focus: 'Calibrar a força',
    goal: 'Puxe o elástico para trás e solte. Acerte o buraco sem passar direto.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.3 }],
    guide: 1, par: 1, tutorial: true,
  },
  {
    id: '2', name: 'Na Mira', skill: 'espacial', focus: 'Estimar ângulos',
    goal: 'O buraco está de lado. Mire puxando na direção oposta.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.8, y: 0.24 }],
    guide: 0.45, par: 1,
  },
  {
    id: '3', name: 'Monte o Estilingue', skill: 'planejamento', focus: 'Escolher o ponto de apoio',
    goal: 'Não há elástico. Ligue dois pinos passando pela bola e dispare.',
    pins: [[0.2, 0.66], [0.42, 0.84], [0.2, 0.84], [0.42, 0.66]],
    maxBands: 1,
    balls: [{ x: 0.31, y: 0.75 }],
    holes: [{ x: 0.76, y: 0.26 }],
    guide: 0.45, par: 1,
  },
  {
    id: '4', name: 'Tabela', skill: 'espacial', focus: 'Prever rebotes',
    goal: 'Uma parede bloqueia o caminho. Use as bordas para contornar.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.16 }],
    boxes: [[0.22, 0.42, 0.56, 0.07]],
    guide: 0.25, par: 1,
  },
  {
    id: '5', name: 'Toque Suave', skill: 'atencao', focus: 'Controle fino da força',
    goal: 'Este buraco só aceita bolas lentas. Dose a força com calma.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.36, y: 0.4, cap: 0.55 }],
    guide: 0.18, par: 1,
  },
  {
    id: '6', name: 'Dupla', skill: 'planejamento', focus: 'Sequenciar ações',
    goal: 'Duas bolas, dois buracos. Pense na ordem para uma não atrapalhar a outra.',
    pins: [[0.18, 0.86], [0.42, 0.86], [0.58, 0.86], [0.82, 0.86]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.3, y: 0.82 }, { x: 0.7, y: 0.82 }],
    holes: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }],
    guide: 0.35, par: 2,
  },
  {
    id: '7', name: 'Cada Cor no Seu Lugar', skill: 'atencao', focus: 'Atenção seletiva',
    goal: 'Cada bola só entra no buraco da mesma cor. As cores estão cruzadas.',
    pins: [[0.18, 0.86], [0.42, 0.86], [0.58, 0.86], [0.82, 0.86]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.3, y: 0.82, c: 0 }, { x: 0.7, y: 0.82, c: 1 }],
    holes: [{ x: 0.8, y: 0.2, c: 0 }, { x: 0.2, y: 0.2, c: 1 }],
    boxes: [[0.47, 0.5, 0.06, 0.2]],
    guide: 0.3, par: 2,
  },
  {
    id: '8', name: 'Alvo Móvel', skill: 'atencao', focus: 'Antecipar o tempo certo',
    goal: 'O buraco se move. Dispare antes, onde ele vai estar.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.22, m: { type: 'slide', dx: 0.26, period: 3.2 } }],
    guide: 0.3, par: 1,
  },
  {
    id: '9', name: 'Carambola', skill: 'planejamento', focus: 'Causa e efeito indireto',
    goal: 'A bola branca não entra. Use-a para empurrar a bola colorida.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82, cue: true }, { x: 0.38, y: 0.46, c: 0 }],
    holes: [{ x: 0.2, y: 0.12 }],
    guide: 0.22, guideCueOnly: true, par: 1,
  },
  {
    id: '10', name: 'De Memória', skill: 'memoria', focus: 'Memória visuoespacial',
    goal: 'Memorize onde fica o buraco. Em 3 segundos ele some.',
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.24, y: 0.22 }],
    boxes: [[0.42, 0.38, 0.16, 0.06]],
    guide: 0, memory: 3, par: 1,
  },
  {
    id: '11', name: 'Duas Etapas', skill: 'planejamento', focus: 'Planejar em etapas',
    goal: 'Leve a bola até o segundo elástico e, de lá, até o buraco.',
    pins: [[0.6, 0.88], [0.84, 0.88], [0.12, 0.5], [0.12, 0.26]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.72, y: 0.84 }],
    holes: [{ x: 0.86, y: 0.14 }],
    boxes: [[0.42, 0.1, 0.06, 0.62]],
    guide: 0.22, par: 2,
  },
  {
    id: '12', name: 'Grande Final', skill: 'memoria', focus: 'Integrar tudo',
    goal: 'Cores cruzadas, um alvo em movimento e uma parede. Respire e planeje.',
    pins: [[0.18, 0.86], [0.42, 0.86], [0.58, 0.86], [0.82, 0.86]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.3, y: 0.82, c: 1 }, { x: 0.7, y: 0.82, c: 0 }],
    holes: [{ x: 0.22, y: 0.16, c: 0, m: { type: 'slide', dx: 0.08, period: 4 } }, { x: 0.78, y: 0.16, c: 1 }],
    boxes: [[0.4, 0.42, 0.2, 0.06]],
    guide: 0.15, par: 2,
  },
];

const POINTS = distributePoints(RAW.map((_, i) => 1 + i * 0.45));
export const LEVELS = RAW.map((l, i) => ({ ...l, points: POINTS[i] }));

// Treino livre: sem pontos, várias bolas, monte quantos elásticos quiser.
export const FREE = {
  id: 'livre', name: 'Treino Livre', mode: 'free', skill: 'criatividade', focus: 'Experimentar livremente',
  goal: 'Sem regras: monte elásticos onde quiser e brinque com as tabelas.',
  pins: [0.15, 0.38, 0.62, 0.85].flatMap((y) => [0.15, 0.38, 0.62, 0.85].map((x) => [x, y])),
  maxBands: 99,
  balls: [{ x: 0.265, y: 0.73, c: 0 }, { x: 0.5, y: 0.73, c: 1 }, { x: 0.735, y: 0.73, c: 2 }],
  holes: [{ x: 0.12, y: 0.1 }, { x: 0.5, y: 0.08 }, { x: 0.88, y: 0.1 }],
  guide: 1, par: 0, points: 0,
};
