// Fases do Lume: uma luz de foco, várias chamas (tarefas) e distrações.
// Coordenadas normalizadas 0–1 no palco.
// flames: { x, y, ax, ay (amplitude da deriva), sp (velocidade), need (segundos de foco),
//           kind ('task' | 'mini' | 'urgent'), lux (valor, fases de orçamento),
//           at (aparece em s), until (some em s), trigger ({ progress }: aparece quando
//           alguma chama passa dessa fração), deadline (urgente: s para atender) }
// energy: segundos de luz (o feixe gasta 1/s enquanto o dedo está na tela)
// switchCost: luz perdida ao abandonar uma chama no meio   ctxCost: luz perdida ao mudar de tipo
// bubbles: { every (s), life (s), decoy (fração de falsos sinais ciano), bait ([min, max] pontos falsos), ramp (every final) }
// park: pode estacionar   hidden: progresso e fios invisíveis   goal: { all | count | lux }
// par: interrupções aceitas para 3 estrelas   tip: o que levar para a vida real.
import { distributePoints } from '../../js/scoring.js';

const RAW = [
  {
    id: '1', name: 'Um Só Fio', skill: 'atencao', focus: 'Sustentar o foco',
    goal: 'Segure o dedo sobre a chama e acompanhe-a até ela se acender por inteiro.',
    tip: 'Escolha uma tarefa e dê a ela um bloco de tempo sem interrupções.',
    energy: 30, switchCost: 2, tutorial: true,
    flames: [{ x: 0.5, y: 0.5, ax: 0.12, ay: 0.08, sp: 0.35, need: 6 }],
  },
  {
    id: '2', name: 'Silêncio', skill: 'atencao', focus: 'Ignorar distrações',
    goal: 'Bolhas vão piscar ao redor. Não toque nelas: só a chama importa.',
    tip: 'Notificações são bolhas: silencie o celular durante o que é importante.',
    energy: 30, switchCost: 2,
    flames: [{ x: 0.5, y: 0.5, ax: 0.2, ay: 0.14, sp: 0.45, need: 10 }],
    bubbles: { every: 2.2, life: 3.6 },
  },
  {
    id: '3', name: 'Fechar o Ciclo', skill: 'atencao', focus: 'Terminar antes de trocar',
    goal: 'Três chamas. Termine uma antes de começar a outra: trocar no meio deixa um fio.',
    tip: 'Terminar antes de trocar evita que a tarefa anterior continue ocupando sua mente.',
    energy: 30, switchCost: 2,
    flames: [
      { x: 0.25, y: 0.35, ax: 0.08, ay: 0.06, sp: 0.4, need: 5 },
      { x: 0.72, y: 0.4, ax: 0.08, ay: 0.08, sp: 0.35, need: 5 },
      { x: 0.48, y: 0.72, ax: 0.1, ay: 0.05, sp: 0.45, need: 5 },
    ],
    bubbles: { every: 4, life: 3.4 },
  },
  {
    id: '4', name: 'Orçamento', skill: 'planejamento', focus: 'Investir a luz onde vale',
    goal: 'Junte 10 de brilho antes que a luz acabe. Compare o brilho de cada chama com o tamanho dela.',
    tip: 'Atenção é um orçamento: gaste-a no que mais importa.',
    energy: 17, switchCost: 2, goalLux: 10,
    flames: [
      { x: 0.22, y: 0.3, ax: 0.05, ay: 0.05, sp: 0.35, need: 8, lux: 5 },
      { x: 0.75, y: 0.28, ax: 0.05, ay: 0.04, sp: 0.4, need: 4, lux: 4 },
      { x: 0.5, y: 0.52, ax: 0.06, ay: 0.04, sp: 0.3, need: 5, lux: 2 },
      { x: 0.25, y: 0.75, ax: 0.05, ay: 0.05, sp: 0.38, need: 6, lux: 6 },
      { x: 0.76, y: 0.74, ax: 0.05, ay: 0.05, sp: 0.36, need: 3, lux: 3 },
    ],
  },
  {
    id: '5', name: 'Estacionar', skill: 'atencao', focus: 'Pausar sem deixar resíduo',
    goal: 'Um sinal ciano vai chamar no meio da tarefa. Antes de atender, levante o dedo e toque na âncora ⚓ para estacionar.',
    tip: 'Antes de interromper, anote onde parou e qual é o próximo passo. Isso reduz o resíduo.',
    energy: 34, switchCost: 2, park: true,
    flames: [
      { x: 0.3, y: 0.45, ax: 0.08, ay: 0.07, sp: 0.4, need: 7 },
      { x: 0.72, y: 0.55, ax: 0.07, ay: 0.08, sp: 0.38, need: 7 },
      { x: 0.55, y: 0.2, ax: 0.04, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', trigger: { progress: 0.4 }, deadline: 7 },
    ],
  },
  {
    id: '6', name: 'Urgente ou Barulhento?', skill: 'atencao', focus: 'Distinguir sinal de ruído',
    goal: 'Sinais reais são losangos ciano: atenda (e estacione antes). Bolhas redondas, mesmo ciano, são ruído.',
    tip: 'Pergunte: isso é urgente de verdade ou só barulhento?',
    energy: 40, switchCost: 2, park: true,
    flames: [
      { x: 0.28, y: 0.5, ax: 0.09, ay: 0.08, sp: 0.42, need: 6 },
      { x: 0.72, y: 0.48, ax: 0.08, ay: 0.09, sp: 0.4, need: 6 },
      { x: 0.5, y: 0.2, ax: 0.05, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', at: 5, deadline: 6 },
      { x: 0.5, y: 0.8, ax: 0.05, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', at: 15, deadline: 6 },
    ],
    bubbles: { every: 2, life: 3.4, decoy: 0.45 },
  },
  {
    id: '7', name: 'Em Lote', skill: 'planejamento', focus: 'Agrupar tarefas parecidas',
    goal: 'Chamas âmbar e violeta são tipos diferentes. Mudar de tipo custa luz: faça todas de um tipo, depois as do outro.',
    tip: 'Agrupe e-mails, mensagens e recados num bloco só.',
    energy: 26, switchCost: 2, ctxCost: 1.6, par: 1,
    flames: [
      { x: 0.2, y: 0.3, ax: 0.05, ay: 0.05, sp: 0.4, need: 3 },
      { x: 0.8, y: 0.68, ax: 0.05, ay: 0.05, sp: 0.38, need: 3 },
      { x: 0.5, y: 0.5, ax: 0.06, ay: 0.05, sp: 0.42, need: 3 },
      { x: 0.78, y: 0.28, ax: 0.05, ay: 0.04, sp: 0.5, need: 1.8, kind: 'mini' },
      { x: 0.22, y: 0.72, ax: 0.05, ay: 0.04, sp: 0.5, need: 1.8, kind: 'mini' },
      { x: 0.5, y: 0.16, ax: 0.06, ay: 0.03, sp: 0.5, need: 1.8, kind: 'mini' },
    ],
  },
  {
    id: '8', name: 'Recompensa Variável', skill: 'atencao', focus: 'Resistir à recompensa',
    goal: 'Agora as bolhas prometem pontos. Alguns parecem muito. Fique na chama.',
    tip: 'Recompensas imprevisíveis prendem a atenção. Perceber isso já é metade do controle.',
    energy: 32, switchCost: 2,
    flames: [
      { x: 0.32, y: 0.45, ax: 0.12, ay: 0.1, sp: 0.42, need: 8 },
      { x: 0.68, y: 0.6, ax: 0.1, ay: 0.1, sp: 0.4, need: 8 },
    ],
    bubbles: { every: 1.5, life: 3.2, bait: [20, 900] },
  },
  {
    id: '9', name: 'Fios Invisíveis', skill: 'memoria', focus: 'Lembrar o que ficou aberto',
    goal: 'As chamas são iguais e os fios não aparecem. Lembre qual você começou e termine-a primeiro.',
    tip: 'Tarefas abertas pesam mesmo quando você não as vê. Feche ou estacione.',
    energy: 34, switchCost: 2, park: true, hidden: true,
    flames: [
      { x: 0.25, y: 0.3, ax: 0.12, ay: 0.1, sp: 0.4, need: 4 },
      { x: 0.75, y: 0.3, ax: 0.12, ay: 0.1, sp: 0.36, need: 4 },
      { x: 0.25, y: 0.72, ax: 0.12, ay: 0.1, sp: 0.38, need: 4 },
      { x: 0.75, y: 0.72, ax: 0.12, ay: 0.1, sp: 0.42, need: 4 },
      { x: 0.5, y: 0.5, ax: 0.05, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', trigger: { progress: 0.5 }, deadline: 7 },
    ],
  },
  {
    id: '10', name: 'Maré de Ruído', skill: 'atencao', focus: 'Foco longo no ruído',
    goal: 'Uma chama longa. O ruído vai crescendo. Fique com ela até o fim.',
    tip: 'Foco profundo é treino: comece com blocos curtos e aumente aos poucos.',
    energy: 34, switchCost: 2,
    flames: [{ x: 0.5, y: 0.5, ax: 0.26, ay: 0.2, sp: 0.55, need: 18 }],
    bubbles: { every: 2, ramp: 0.7, life: 3, decoy: 0.2, bait: [20, 400] },
  },
  {
    id: '11', name: 'Agenda', skill: 'planejamento', focus: 'Planejar a ordem',
    goal: 'Chamas chegam e somem em horários diferentes. Feche pelo menos 4 de 5: comece pela que vence antes.',
    tip: 'Faça primeiro o que vence antes, sem pular entre tarefas.',
    energy: 40, switchCost: 2, goalCount: 4,
    flames: [
      { x: 0.25, y: 0.35, ax: 0.06, ay: 0.06, sp: 0.4, need: 4, at: 0, until: 16 },
      { x: 0.72, y: 0.3, ax: 0.06, ay: 0.05, sp: 0.42, need: 3, at: 1, until: 9 },
      { x: 0.5, y: 0.62, ax: 0.08, ay: 0.06, sp: 0.38, need: 4, at: 8, until: 24 },
      { x: 0.25, y: 0.75, ax: 0.06, ay: 0.05, sp: 0.4, need: 3, at: 12, until: 21 },
      { x: 0.75, y: 0.72, ax: 0.07, ay: 0.06, sp: 0.4, need: 4, at: 17, until: 34 },
    ],
    bubbles: { every: 3.5, life: 3 },
  },
  {
    id: '12', name: 'Mestre da Luz', skill: 'atencao', focus: 'Tudo junto',
    goal: 'Tudo o que você aprendeu: feche cada chama, agrupe por tipo, estacione antes dos sinais e ignore o ruído.',
    tip: 'Uma coisa de cada vez, do começo ao fim.',
    energy: 48, switchCost: 2, ctxCost: 1.6, park: true, par: 1,
    flames: [
      { x: 0.24, y: 0.36, ax: 0.08, ay: 0.07, sp: 0.42, need: 5 },
      { x: 0.76, y: 0.4, ax: 0.08, ay: 0.07, sp: 0.4, need: 5 },
      { x: 0.5, y: 0.7, ax: 0.1, ay: 0.06, sp: 0.44, need: 5 },
      { x: 0.2, y: 0.76, ax: 0.05, ay: 0.04, sp: 0.5, need: 1.8, kind: 'mini' },
      { x: 0.8, y: 0.78, ax: 0.05, ay: 0.04, sp: 0.5, need: 1.8, kind: 'mini' },
      { x: 0.5, y: 0.18, ax: 0.05, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', at: 9, deadline: 6 },
      { x: 0.5, y: 0.45, ax: 0.05, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', at: 24, deadline: 6 },
    ],
    bubbles: { every: 1.9, life: 3.2, decoy: 0.3, bait: [20, 700] },
  },
];

const POINTS = distributePoints(RAW.map((_, i) => 1 + i * 0.45));
export const LEVELS = RAW.map((l, i) => ({ par: 0, ...l, points: POINTS[i] }));

// Respiro: uma chama que respira. Sem pontos; cada minuto conta para a trilha Atenção.
export const FREE = {
  id: 'respiro', name: 'Respiro', mode: 'free', skill: 'atencao', focus: 'Foco calmo',
  goal: 'Acompanhe a chama. Inspire quando ela crescer, solte o ar quando ela diminuir.',
  energy: Infinity, switchCost: 0, breathe: true,
  flames: [{ x: 0.5, y: 0.5, ax: 0.1, ay: 0.06, sp: 0.18, need: Infinity }],
};
