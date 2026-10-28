// Fases do Tensa: estilingue de elástico + bilhar/golfe.
// Coordenadas normalizadas 0–1 num tabuleiro quadrado.
// pins: [x, y]   bands: elásticos já montados [pinoA, pinoB]   maxBands: quantos o jogador pode montar
// balls: { x, y, c (cor), cue (bola branca de tacada) }   holes: { x, y, c (cor exigida), m (movimento), cap (velocidade máx. de captura) }
// boxes: [x, y, w, h]   guide: quanto da trajetória prevista aparece (0–1)   par: tacadas ideais
// skill: trilha de Sua Mente   focus: a habilidade específica treinada nesta fase.
import { distributePoints } from '../../js/scoring.js';
import { L } from '../../js/i18n.js';

const BOTTOM = [[0.38, 0.86], [0.62, 0.86]];

const RAW = [
  {
    id: '1', name: L('Primeira Tacada', 'First Shot'), skill: 'espacial', focus: L('Calibrar a força', 'Calibrating force'),
    goal: L('Puxe o elástico para trás e solte. Acerte o buraco sem passar direto.', 'Pull the band back and let go. Sink it without rolling past the hole.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.3 }],
    guide: 1, par: 1, tutorial: true,
  },
  {
    id: '2', name: L('Na Mira', 'On Target'), skill: 'espacial', focus: L('Estimar ângulos', 'Estimating angles'),
    goal: L('O buraco está de lado. Mire puxando na direção oposta.', 'The hole is off to the side. Aim by pulling the opposite way.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.8, y: 0.24 }],
    guide: 0.45, par: 1,
  },
  {
    id: '3', name: L('Monte o Estilingue', 'Build the Slingshot'), skill: 'planejamento', focus: L('Escolher o ponto de apoio', 'Choosing the anchor point'),
    goal: L('Não há elástico. Ligue dois pinos passando pela bola e dispare.', 'There is no band. Link two pins across the ball and shoot.'),
    pins: [[0.2, 0.66], [0.42, 0.84], [0.2, 0.84], [0.42, 0.66]],
    maxBands: 1,
    balls: [{ x: 0.31, y: 0.75 }],
    holes: [{ x: 0.76, y: 0.26 }],
    guide: 0.45, par: 1,
  },
  {
    id: '4', name: L('Tabela', 'Bank Shot'), skill: 'espacial', focus: L('Prever rebotes', 'Predicting bounces'),
    goal: L('Uma parede bloqueia o caminho. Use as bordas para contornar.', 'A wall blocks the way. Use the cushions to go around it.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.16 }],
    boxes: [[0.22, 0.42, 0.56, 0.07]],
    guide: 0.25, par: 1,
  },
  {
    id: '5', name: L('Toque Suave', 'Soft Touch'), skill: 'atencao', focus: L('Controle fino da força', 'Fine force control'),
    goal: L('Este buraco só aceita bolas lentas. Dose a força com calma.', 'This hole only takes slow balls. Measure your force calmly.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.36, y: 0.4, cap: 0.55 }],
    guide: 0.18, par: 1,
  },
  {
    id: '6', name: L('Dupla', 'Double'), skill: 'planejamento', focus: L('Sequenciar ações', 'Sequencing actions'),
    goal: L('Duas bolas, dois buracos. Pense na ordem para uma não atrapalhar a outra.', 'Two balls, two holes. Think about the order so one doesn\'t block the other.'),
    pins: [[0.18, 0.86], [0.42, 0.86], [0.58, 0.86], [0.82, 0.86]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.3, y: 0.82 }, { x: 0.7, y: 0.82 }],
    holes: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }],
    guide: 0.35, par: 2,
  },
  {
    id: '7', name: L('Cada Cor no Seu Lugar', 'Every Color in Its Place'), skill: 'atencao', focus: L('Atenção seletiva', 'Selective attention'),
    goal: L('Cada bola só entra no buraco da mesma cor. As cores estão cruzadas.', 'Each ball only drops into the hole of its color. The colors are crossed.'),
    pins: [[0.18, 0.86], [0.42, 0.86], [0.58, 0.86], [0.82, 0.86]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.3, y: 0.82, c: 0 }, { x: 0.7, y: 0.82, c: 1 }],
    holes: [{ x: 0.8, y: 0.2, c: 0 }, { x: 0.2, y: 0.2, c: 1 }],
    boxes: [[0.47, 0.5, 0.06, 0.2]],
    guide: 0.3, par: 2,
  },
  {
    id: '8', name: L('Alvo Móvel', 'Moving Target'), skill: 'atencao', focus: L('Antecipar o tempo certo', 'Anticipating the right timing'),
    goal: L('O buraco se move. Dispare antes, onde ele vai estar.', 'The hole moves. Shoot early, where it is going to be.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.5, y: 0.22, m: { type: 'slide', dx: 0.26, period: 3.2 } }],
    guide: 0.3, par: 1,
  },
  {
    id: '9', name: L('Carambola', 'Carom'), skill: 'planejamento', focus: L('Causa e efeito indireto', 'Indirect cause and effect'),
    goal: L('A bola branca não entra. Use-a para empurrar a bola colorida.', 'The white ball can\'t go in. Use it to push the colored ball.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82, cue: true }, { x: 0.38, y: 0.46, c: 0 }],
    holes: [{ x: 0.2, y: 0.12 }],
    guide: 0.22, guideCueOnly: true, par: 1,
  },
  {
    id: '10', name: L('De Memória', 'From Memory'), skill: 'memoria', focus: L('Memória visuoespacial', 'Visuospatial memory'),
    goal: L('Memorize onde fica o buraco. Em 3 segundos ele some.', 'Memorize where the hole is. In 3 seconds it disappears.'),
    pins: BOTTOM, bands: [[0, 1]],
    balls: [{ x: 0.5, y: 0.82 }],
    holes: [{ x: 0.24, y: 0.22 }],
    boxes: [[0.42, 0.38, 0.16, 0.06]],
    guide: 0, memory: 3, par: 1,
  },
  {
    id: '11', name: L('Duas Etapas', 'Two Stages'), skill: 'planejamento', focus: L('Planejar em etapas', 'Planning in stages'),
    goal: L('Leve a bola até o segundo elástico e, de lá, até o buraco.', 'Send the ball to the second band and, from there, into the hole.'),
    pins: [[0.6, 0.88], [0.84, 0.88], [0.12, 0.5], [0.12, 0.26]],
    bands: [[0, 1], [2, 3]],
    balls: [{ x: 0.72, y: 0.84 }],
    holes: [{ x: 0.86, y: 0.14 }],
    boxes: [[0.42, 0.1, 0.06, 0.62]],
    guide: 0.22, par: 2,
  },
  {
    id: '12', name: L('Grande Final', 'Grand Finale'), skill: 'memoria', focus: L('Integrar tudo', 'Bringing it all together'),
    goal: L('Cores cruzadas, um alvo em movimento e uma parede. Respire e planeje.', 'Crossed colors, a moving target and a wall. Breathe and plan.'),
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
  id: 'livre', name: L('Treino Livre', 'Free Play'), mode: 'free', skill: 'criatividade', focus: L('Experimentar livremente', 'Experimenting freely'),
  goal: L('Sem regras: monte elásticos onde quiser e brinque com as tabelas.', 'No rules: set up bands anywhere and play with the bank shots.'),
  pins: [0.15, 0.38, 0.62, 0.85].flatMap((y) => [0.15, 0.38, 0.62, 0.85].map((x) => [x, y])),
  maxBands: 99,
  balls: [{ x: 0.265, y: 0.73, c: 0 }, { x: 0.5, y: 0.73, c: 1 }, { x: 0.735, y: 0.73, c: 2 }],
  holes: [{ x: 0.12, y: 0.1 }, { x: 0.5, y: 0.08 }, { x: 0.88, y: 0.1 }],
  guide: 1, par: 0, points: 0,
};
