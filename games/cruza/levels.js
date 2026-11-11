// Fases do CRUZA: progressivas, de mini-grades de 5 palavras até grades de 12.
// cat: categoria (null = todas)   count: palavras na grade   size: lado máximo da grade
// skill: trilha de Sua Mente   focus: o que a fase treina   seed: semente da grade (mesma grade para todos)
import { distributePoints } from '../../js/scoring.js';
import { L } from '../../js/i18n.js';

const RAW = [
  { id: '1', cat: 'ia', count: 5, size: 9, skill: 'memoria', name: L('Primeiras Palavras', 'First Words'), focus: L('Vocabulário de IA', 'AI vocabulary') },
  { id: '2', cat: 'bemestar', count: 5, size: 9, skill: 'memoria', name: L('Corpo em Equilíbrio', 'Body in Balance'), focus: L('Lembrar pela dica', 'Recalling from a clue') },
  { id: '3', cat: 'dinheiro', count: 6, size: 10, skill: 'planejamento', name: L('Dinheiro no Bolso', 'Money in Your Pocket'), focus: L('Educação financeira', 'Financial literacy') },
  { id: '4', cat: 'ciencia', count: 6, size: 10, skill: 'criatividade', name: L('Como Funciona?', 'How Does It Work?'), focus: L('Entender por analogias', 'Understanding through analogies') },
  { id: '5', cat: 'atualidades', count: 6, size: 10, skill: 'atencao', name: L('Lendo o Mundo', 'Reading the World'), focus: L('Ler as notícias com atenção', 'Reading the news carefully') },
  { id: '6', cat: 'ia', count: 7, size: 11, skill: 'criatividade', name: L('Por Dentro da IA', 'Inside AI'), focus: L('Explicar com as próprias palavras', 'Explaining in your own words') },
  { id: '7', cat: 'bemestar', count: 8, size: 11, skill: 'memoria', name: L('Hábitos', 'Habits'), focus: L('Memória de trabalho', 'Working memory') },
  { id: '8', cat: 'dinheiro', count: 8, size: 12, skill: 'planejamento', name: L('Economia de Casa', 'Household Economics'), focus: L('Causa e consequência', 'Cause and effect') },
  { id: '9', cat: 'ciencia', count: 9, size: 12, skill: 'memoria', name: L('Laboratório', 'The Lab'), focus: L('Associar conceitos', 'Linking concepts') },
  { id: '10', cat: 'atualidades', count: 10, size: 13, skill: 'atencao', name: L('Manchetes', 'Headlines'), focus: L('Separar fato de ruído', 'Separating fact from noise') },
  { id: '11', cat: 'ia', count: 11, size: 13, skill: 'planejamento', name: L('Mestre das Máquinas', 'Master of Machines'), focus: L('Planejar os cruzamentos', 'Planning the crossings') },
  { id: '12', cat: null, count: 12, size: 13, skill: 'memoria', name: L('Grande Cruzada', 'The Grand Crossing'), focus: L('Integrar todas as categorias', 'Bringing all categories together') },
];

const POINTS = distributePoints(RAW.map((_, i) => 1 + i * 0.45));
export const LEVELS = RAW.map((l, i) => ({ ...l, seed: `cruza-${l.id}`, points: POINTS[i] }));

// Grade livre: escolha a categoria, sem pontos; cada minuto conta para Memória.
export const FREE = {
  id: 'livre', name: L('Grade Livre', 'Free Grid'), mode: 'free', skill: 'memoria',
  focus: L('Aprender por prazer', 'Learning for the joy of it'), count: 6, size: 11,
};

// Pontos: 70% por completar a grade (cada palavra errada além de 2 tira 5%, mínimo metade)
// + 10% por resposta certa no mini-quiz final. Ajuda não tira pontos: custa uma boa ação.
export function scoreLevel(level, { wrongs, quiz }) {
  const grid = 0.7 * Math.max(0.5, 1 - 0.05 * Math.max(0, wrongs - 2));
  const points = Math.round((level.points * (grid + 0.1 * quiz)) / 100) * 100;
  const stars = quiz === 3 && wrongs <= 2 ? 3 : quiz >= 2 ? 2 : 1;
  return { points: Math.min(level.points, points), stars };
}
