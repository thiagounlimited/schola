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
import { L } from '../../js/i18n.js';

const RAW = [
  {
    id: '1', name: L('Um Só Fio', 'A Single Thread'), skill: 'atencao', focus: L('Sustentar o foco', 'Sustaining focus'),
    goal: L('Segure o dedo sobre a chama e acompanhe-a até ela se acender por inteiro.', 'Hold your finger on the flame and follow it until it is fully lit.'),
    tip: L('Escolha uma tarefa e dê a ela um bloco de tempo sem interrupções.', 'Pick one task and give it a block of uninterrupted time.'),
    energy: 30, switchCost: 2, tutorial: true,
    flames: [{ x: 0.5, y: 0.5, ax: 0.12, ay: 0.08, sp: 0.35, need: 6 }],
  },
  {
    id: '2', name: L('Silêncio', 'Silence'), skill: 'atencao', focus: L('Ignorar distrações', 'Ignoring distractions'),
    goal: L('Bolhas vão piscar ao redor. Não toque nelas: só a chama importa.', 'Bubbles will flash around you. Don\'t touch them: only the flame matters.'),
    tip: L('Notificações são bolhas: silencie o celular durante o que é importante.', 'Notifications are bubbles: silence your phone during what matters.'),
    energy: 30, switchCost: 2,
    flames: [{ x: 0.5, y: 0.5, ax: 0.2, ay: 0.14, sp: 0.45, need: 10 }],
    bubbles: { every: 2.2, life: 3.6 },
  },
  {
    id: '3', name: L('Fechar o Ciclo', 'Close the Loop'), skill: 'atencao', focus: L('Terminar antes de trocar', 'Finish before switching'),
    goal: L('Três chamas. Termine uma antes de começar a outra: trocar no meio deixa um fio.', 'Three flames. Finish one before starting the next: switching halfway leaves a thread.'),
    tip: L('Terminar antes de trocar evita que a tarefa anterior continue ocupando sua mente.', 'Finishing before switching keeps the previous task from lingering in your mind.'),
    energy: 30, switchCost: 2,
    flames: [
      { x: 0.25, y: 0.35, ax: 0.08, ay: 0.06, sp: 0.4, need: 5 },
      { x: 0.72, y: 0.4, ax: 0.08, ay: 0.08, sp: 0.35, need: 5 },
      { x: 0.48, y: 0.72, ax: 0.1, ay: 0.05, sp: 0.45, need: 5 },
    ],
    bubbles: { every: 4, life: 3.4 },
  },
  {
    id: '4', name: L('Orçamento', 'Budget'), skill: 'planejamento', focus: L('Investir a luz onde vale', 'Spending light where it pays'),
    goal: L('Junte 10 de brilho antes que a luz acabe. Compare o brilho de cada chama com o tamanho dela.', 'Gather 10 glow before your light runs out. Compare each flame\'s glow with its size.'),
    tip: L('Atenção é um orçamento: gaste-a no que mais importa.', 'Attention is a budget: spend it on what matters most.'),
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
    id: '5', name: L('Estacionar', 'Park It'), skill: 'atencao', focus: L('Pausar sem deixar resíduo', 'Pausing without residue'),
    goal: L('Um sinal ciano vai chamar no meio da tarefa. Antes de atender, levante o dedo e toque na âncora ⚓ para estacionar.', 'A cyan signal will call mid-task. Before answering, lift your finger and tap the anchor ⚓ to park.'),
    tip: L('Antes de interromper, anote onde parou e qual é o próximo passo. Isso reduz o resíduo.', 'Before you stop, jot down where you were and your next step. That cuts the residue.'),
    energy: 34, switchCost: 2, park: true,
    flames: [
      { x: 0.3, y: 0.45, ax: 0.08, ay: 0.07, sp: 0.4, need: 7 },
      { x: 0.72, y: 0.55, ax: 0.07, ay: 0.08, sp: 0.38, need: 7 },
      { x: 0.55, y: 0.2, ax: 0.04, ay: 0.03, sp: 0.5, need: 1.4, kind: 'urgent', trigger: { progress: 0.4 }, deadline: 7 },
    ],
  },
  {
    id: '6', name: L('Urgente ou Barulhento?', 'Urgent or Just Loud?'), skill: 'atencao', focus: L('Distinguir sinal de ruído', 'Telling signal from noise'),
    goal: L('Sinais reais são losangos ciano: atenda (e estacione antes). Bolhas redondas, mesmo ciano, são ruído.', 'Real signals are cyan diamonds: answer them (park first). Round bubbles, even cyan ones, are noise.'),
    tip: L('Pergunte: isso é urgente de verdade ou só barulhento?', 'Ask yourself: is this truly urgent, or just loud?'),
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
    id: '7', name: L('Em Lote', 'Batching'), skill: 'planejamento', focus: L('Agrupar tarefas parecidas', 'Grouping similar tasks'),
    goal: L('Chamas âmbar e violeta são tipos diferentes. Mudar de tipo custa luz: faça todas de um tipo, depois as do outro.', 'Amber and violet flames are different kinds. Switching kinds costs light: do all of one kind, then the other.'),
    tip: L('Agrupe e-mails, mensagens e recados num bloco só.', 'Batch emails, messages and errands into a single block.'),
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
    id: '8', name: L('Recompensa Variável', 'Variable Reward'), skill: 'atencao', focus: L('Resistir à recompensa', 'Resisting the reward'),
    goal: L('Agora as bolhas prometem pontos. Alguns parecem muito. Fique na chama.', 'Now the bubbles promise points. Some look like a lot. Stay with the flame.'),
    tip: L('Recompensas imprevisíveis prendem a atenção. Perceber isso já é metade do controle.', 'Unpredictable rewards hook your attention. Noticing that is half the control.'),
    energy: 32, switchCost: 2,
    flames: [
      { x: 0.32, y: 0.45, ax: 0.12, ay: 0.1, sp: 0.42, need: 8 },
      { x: 0.68, y: 0.6, ax: 0.1, ay: 0.1, sp: 0.4, need: 8 },
    ],
    bubbles: { every: 1.5, life: 3.2, bait: [20, 900] },
  },
  {
    id: '9', name: L('Fios Invisíveis', 'Invisible Threads'), skill: 'memoria', focus: L('Lembrar o que ficou aberto', 'Remembering what is still open'),
    goal: L('As chamas são iguais e os fios não aparecem. Lembre qual você começou e termine-a primeiro.', 'The flames look alike and threads are hidden. Remember which one you started and finish it first.'),
    tip: L('Tarefas abertas pesam mesmo quando você não as vê. Feche ou estacione.', 'Open tasks weigh on you even when you can\'t see them. Close them or park them.'),
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
    id: '10', name: L('Maré de Ruído', 'Rising Noise'), skill: 'atencao', focus: L('Foco longo no ruído', 'Long focus amid noise'),
    goal: L('Uma chama longa. O ruído vai crescendo. Fique com ela até o fim.', 'One long flame. The noise keeps rising. Stay with it to the end.'),
    tip: L('Foco profundo é treino: comece com blocos curtos e aumente aos poucos.', 'Deep focus is trained: start with short blocks and grow them slowly.'),
    energy: 34, switchCost: 2,
    flames: [{ x: 0.5, y: 0.5, ax: 0.26, ay: 0.2, sp: 0.55, need: 18 }],
    bubbles: { every: 2, ramp: 0.7, life: 3, decoy: 0.2, bait: [20, 400] },
  },
  {
    id: '11', name: L('Agenda', 'Schedule'), skill: 'planejamento', focus: L('Planejar a ordem', 'Planning the order'),
    goal: L('Chamas chegam e somem em horários diferentes. Feche pelo menos 4 de 5: comece pela que vence antes.', 'Flames arrive and fade at different times. Close at least 4 of 5: start with the one due first.'),
    tip: L('Faça primeiro o que vence antes, sem pular entre tarefas.', 'Do first what is due first, without hopping between tasks.'),
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
    id: '12', name: L('Mestre da Luz', 'Master of Light'), skill: 'atencao', focus: L('Tudo junto', 'Everything together'),
    goal: L('Tudo o que você aprendeu: feche cada chama, agrupe por tipo, estacione antes dos sinais e ignore o ruído.', 'Everything you learned: close each flame, batch by kind, park before signals and ignore the noise.'),
    tip: L('Uma coisa de cada vez, do começo ao fim.', 'One thing at a time, from start to finish.'),
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
  id: 'respiro', name: L('Respiro', 'Breathe'), mode: 'free', skill: 'atencao', focus: L('Foco calmo', 'Calm focus'),
  goal: L('Acompanhe a chama. Inspire quando ela crescer, solte o ar quando ela diminuir.', 'Follow the flame. Breathe in as it grows, breathe out as it shrinks.'),
  energy: Infinity, switchCost: 0, breathe: true,
  flames: [{ x: 0.5, y: 0.5, ax: 0.1, ay: 0.06, sp: 0.18, need: Infinity }],
};
