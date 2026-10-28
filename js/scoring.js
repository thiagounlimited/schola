// Sistema único de pontuação do SCHOLA: cada jogo vai de 0 a 1.000.000 pontos,
// distribuídos entre as suas fases, com as mesmas faixas de nível para todos os jogos.
import { locale } from './i18n.js';

export const MAX_POINTS = 1_000_000;

export const RANKS = [
  { id: 'beginner', name: 'Beginner', min: 0, color: '#9AA3C7' },
  { id: 'elementary', name: 'Elementary', min: 50_000, color: '#38E1FF' },
  { id: 'intermediate', name: 'Intermediate', min: 150_000, color: '#3EDBB0' },
  { id: 'upper', name: 'Upper Intermediate', min: 300_000, color: '#FFD23F' },
  { id: 'advanced', name: 'Advanced', min: 500_000, color: '#FF9F43' },
  { id: 'mastery', name: 'Mastery', min: 700_000, color: '#FF4FD8' },
  { id: 'elite', name: 'Elite', min: 900_000, color: '#FFFFFF' },
];

export function rankFor(points) {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].min) i++;
  const rank = RANKS[i];
  const next = RANKS[i + 1] || null;
  const span = (next ? next.min : MAX_POINTS) - rank.min;
  return { ...rank, index: i, next, frac: span ? Math.min(1, (points - rank.min) / span) : 1 };
}

// Reparte 1.000.000 entre as fases, com fases difíceis valendo mais (peso crescente).
export function distributePoints(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const pts = weights.map((w) => Math.floor((MAX_POINTS * w) / total / 1000) * 1000);
  pts[pts.length - 1] += MAX_POINTS - pts.reduce((a, b) => a + b, 0);
  return pts;
}

const nf = new Intl.NumberFormat(locale());
export const fmt = (n) => nf.format(Math.round(n));
