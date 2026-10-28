// Conteúdo do shell: habilidades (trilhas), avatares-órgão e boas ações cognitivas.
import { L } from './i18n.js';

export const SKILLS = [
  {
    id: 'espacial', name: L('Espacial', 'Spatial'), color: '#FF6B5E', img: 'assets/skills/espacial.webp',
    pitch: L('Ver, girar e prever formas e trajetórias no espaço.', 'See, rotate and predict shapes and paths in space.'),
    gains: L(
      ['Estimar distâncias e ângulos', 'Prever trajetórias e rebotes', 'Rotação mental de formas', 'Coordenação olho-mão'],
      ['Estimating distances and angles', 'Predicting paths and bounces', 'Mental rotation of shapes', 'Hand-eye coordination'],
    ),
    life: L('Estacionar o carro, montar um móvel, ler um mapa, arrumar a mala.', 'Parking a car, assembling furniture, reading a map, packing a suitcase.'),
  },
  {
    id: 'planejamento', name: L('Planejamento', 'Planning'), color: '#FFD23F', img: 'assets/skills/planejamento.webp',
    pitch: L('Pensar alguns passos à frente antes de agir.', 'Think a few steps ahead before you act.'),
    gains: L(
      ['Dividir problemas em etapas', 'Escolher a ordem certa das ações', 'Fazer mais com menos recursos', 'Prever consequências'],
      ['Breaking problems into steps', 'Choosing the right order of actions', 'Doing more with fewer resources', 'Anticipating consequences'],
    ),
    life: L('Organizar a semana, cozinhar várias coisas ao mesmo tempo, poupar para um objetivo.', 'Organizing your week, cooking several dishes at once, saving toward a goal.'),
  },
  {
    id: 'atencao', name: L('Atenção', 'Attention'), color: '#3EDBB0', img: 'assets/skills/atencao.webp',
    pitch: L('Focar no que importa e ignorar o que distrai.', 'Focus on what matters and tune out what distracts.'),
    gains: L(
      ['Atenção seletiva', 'Controle de impulsos', 'Antecipar o tempo certo', 'Foco sustentado', 'Menos resíduo de atenção'],
      ['Selective attention', 'Impulse control', 'Anticipating the right timing', 'Sustained focus', 'Less attention residue'],
    ),
    life: L('Estudar sem olhar o celular, ouvir alguém de verdade, terminar o que começou.', 'Studying without checking your phone, truly listening to someone, finishing what you start.'),
  },
  {
    id: 'memoria', name: L('Memória', 'Memory'), color: '#A78BFA', img: 'assets/skills/memoria.webp',
    pitch: L('Guardar, manipular e recuperar informação.', 'Hold, work with and recall information.'),
    gains: L(
      ['Memória visuoespacial', 'Memória de trabalho', 'Recuperar posições de cabeça', 'Lembrar tarefas abertas'],
      ['Visuospatial memory', 'Working memory', 'Recalling positions from memory', 'Keeping track of open tasks'],
    ),
    life: L('Lembrar nomes, a lista do mercado, onde deixou as chaves, o que ficou pendente.', 'Remembering names, the grocery list, where you left your keys, what is still pending.'),
  },
  {
    id: 'criatividade', name: L('Criatividade', 'Creativity'), color: '#38BDF8', img: 'assets/skills/criatividade.webp',
    pitch: L('Explorar caminhos novos e soluções inesperadas.', 'Explore new paths and unexpected solutions.'),
    gains: L(
      ['Pensamento divergente', 'Experimentar sem medo de errar', 'Achar mais de uma solução', 'Expressão livre'],
      ['Divergent thinking', 'Experimenting without fear of mistakes', 'Finding more than one solution', 'Free expression'],
    ),
    life: L('Resolver um imprevisto, inventar uma brincadeira, achar outro jeito de fazer.', 'Handling the unexpected, inventing a game, finding another way to do things.'),
  },
];

export const skillById = (id) => SKILLS.find((s) => s.id === id);

// Índice de ligação (0–100): quão direta é a conexão daquele órgão com o cérebro.
export const AVATARS = [
  { id: 'medula', name: L('Medula Espinhal', 'Spinal Cord'), link: 98, fact: L('A grande estrada do sistema nervoso: liga o cérebro a todo o corpo.', 'The highway of the nervous system: it links the brain to the whole body.') },
  { id: 'olhos', name: L('Olhos', 'Eyes'), link: 95, fact: L('A retina é tecido do próprio cérebro, projetado para fora do crânio.', 'The retina is brain tissue itself, reaching out beyond the skull.') },
  { id: 'ouvidos', name: L('Ouvidos', 'Ears'), link: 90, fact: L('A cóclea transforma vibração em sinais neurais e cuida do equilíbrio.', 'The cochlea turns vibration into neural signals and keeps you balanced.') },
  { id: 'intestino', name: L('Intestino', 'Gut'), link: 88, fact: L('O "segundo cérebro": cerca de 500 milhões de neurônios próprios.', 'The "second brain": about 500 million neurons of its own.') },
  { id: 'maos', name: L('Mãos', 'Hands'), link: 85, fact: L('Ocupam uma das maiores áreas do córtex motor e sensorial.', 'They take up one of the largest areas of the motor and sensory cortex.') },
  { id: 'coracao', name: L('Coração', 'Heart'), link: 82, fact: L('Tem uma rede de neurônios própria e conversa com o cérebro pelo nervo vago.', 'It has its own network of neurons and talks to the brain through the vagus nerve.') },
  { id: 'pele', name: L('Pele', 'Skin'), link: 75, fact: L('O maior órgão sensorial: milhões de receptores de toque e temperatura.', 'The largest sensory organ: millions of touch and temperature receptors.') },
  { id: 'pulmoes', name: L('Pulmões', 'Lungs'), link: 70, fact: L('O ritmo da respiração regula o alerta e a calma do cérebro.', 'The rhythm of your breathing tunes how alert or calm the brain is.') },
].map((a) => ({ ...a, img: `assets/avatars/${a.id}.webp` }));

export const avatarById = (id) => AVATARS.find((a) => a.id === id) || AVATARS[0];

// Boas ações cognitivas: ajudar o cérebro de outra pessoa.
// skill: a trilha que a ação exercita em quem recebe.
export const DEEDS = [
  {
    id: 'ler', skill: 'memoria', mins: 15,
    title: L('Ler em voz alta para alguém', 'Read aloud to someone'),
    how: L('Escolha uma criança ou um idoso. Leia 15 minutos e, no fim, faça 3 perguntas sobre a história para estimular memória e compreensão.',
      'Pick a child or an older person. Read for 15 minutes and finish with 3 questions about the story to spark memory and comprehension.'),
  },
  {
    id: 'jogo-tabuleiro', skill: 'planejamento', mins: 30,
    title: L('Ensinar um jogo de tabuleiro', 'Teach a board game'),
    how: L('Damas, xadrez ou dominó. Explique uma regra por vez, jogue uma partida "aberta" pensando em voz alta e deixe a pessoa vencer só se merecer.',
      'Checkers, chess or dominoes. Explain one rule at a time, play an "open" game thinking out loud, and let them win only if they earn it.'),
  },
  {
    id: 'idoso-digital', skill: 'memoria', mins: 20,
    title: L('Ensinar algo digital a um idoso', 'Teach an older person something digital'),
    how: L('Uma tarefa só: mandar áudio, fazer chamada de vídeo, salvar uma foto. Deixe a pessoa fazer com as próprias mãos, três vezes seguidas.',
      'Just one task: send a voice note, make a video call, save a photo. Let them do it with their own hands, three times in a row.'),
  },
  {
    id: 'memoria-familia', skill: 'memoria', mins: 10,
    title: L('Desafio de memória em família', 'Family memory challenge'),
    how: L('Monte a lista de compras de cabeça: cada um repete os itens anteriores e acrescenta um. Quem lembrar mais itens escolhe a sobremesa.',
      'Build the grocery list from memory: everyone repeats the previous items and adds one. Whoever remembers the most picks dessert.'),
  },
  {
    id: 'escuta', skill: 'atencao', mins: 10,
    title: L('Escuta atenta, sem celular', 'Phone-free deep listening'),
    how: L('Guarde o celular. Peça para alguém contar algo importante e só faça perguntas abertas. Ao final, resuma o que ouviu para mostrar atenção.',
      'Put your phone away. Ask someone to tell you something important and only ask open questions. At the end, sum up what you heard to show you were present.'),
  },
  {
    id: 'idioma', skill: 'memoria', mins: 10,
    title: L('Ensinar palavras de outro idioma', 'Teach words from another language'),
    how: L('Escolha 5 palavras úteis, associe cada uma a uma imagem ou gesto e peça para a pessoa usá-las numa frase no dia seguinte.',
      'Pick 5 useful words, link each one to a picture or gesture, and ask them to use the words in a sentence the next day.'),
  },
  {
    id: 'calculo', skill: 'planejamento', mins: 10,
    title: L('Desafio de lógica na refeição', 'Logic challenge at mealtime'),
    how: L('Proponha um enigma ou uma conta de cabeça durante o jantar. Dê tempo para pensarem e celebre quem explicar o raciocínio, não só a resposta.',
      'Pose a riddle or some mental math over dinner. Give everyone time to think and celebrate whoever explains their reasoning, not just the answer.'),
  },
  {
    id: 'caminhada', skill: 'criatividade', mins: 20,
    title: L('Caminhada com conversa nova', 'A walk with a new conversation'),
    how: L('Caminhe 20 minutos com alguém falando de um assunto que nenhum dos dois domina. Movimento + novidade é combustível para o cérebro.',
      'Walk for 20 minutes with someone, talking about a topic neither of you knows well. Movement plus novelty is fuel for the brain.'),
  },
  {
    id: 'livro', skill: 'criatividade', mins: 30,
    title: L('Emprestar e discutir um livro', 'Lend and discuss a book'),
    how: L('Empreste um livro que mudou sua cabeça e marque uma conversa de 30 minutos para trocarem as ideias principais.',
      'Lend a book that changed your mind and set up a 30-minute chat to swap its main ideas.'),
  },
  {
    id: 'quebra-cabeca', skill: 'espacial', mins: 20,
    title: L('Resolver um quebra-cabeça junto', 'Solve a puzzle together'),
    how: L('Palavras-cruzadas, sudoku ou quebra-cabeça. Não dê a resposta: dê pistas e deixe a pessoa chegar lá.',
      'Crosswords, sudoku or a jigsaw. Don\'t give the answer away: give hints and let them get there.'),
  },
].map((d) => ({ ...d, img: `assets/deeds/${d.id}.webp` }));

export const deedById = (id) => DEEDS.find((d) => d.id === id);

// Selos de impacto: crescem com as boas ações registradas pelo jogador.
export const BADGES = [
  { min: 1, name: L('Semente', 'Seed'), icon: '🌱' },
  { min: 3, name: L('Broto', 'Sprout'), icon: '🌿' },
  { min: 7, name: L('Árvore', 'Tree'), icon: '🌳' },
  { min: 15, name: L('Bosque', 'Grove'), icon: '🌲' },
  { min: 30, name: L('Floresta', 'Forest'), icon: '🏞️' },
];
