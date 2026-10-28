// Conteúdo do shell: habilidades (trilhas), avatares-órgão e boas ações cognitivas.

export const SKILLS = [
  {
    id: 'espacial', name: 'Espacial', color: '#FF6B5E', img: 'assets/skills/espacial.webp',
    pitch: 'Ver, girar e prever formas e trajetórias no espaço.',
    gains: ['Estimar distâncias e ângulos', 'Prever trajetórias e rebotes', 'Rotação mental de formas', 'Coordenação olho-mão'],
  },
  {
    id: 'planejamento', name: 'Planejamento', color: '#FFD23F', img: 'assets/skills/planejamento.webp',
    pitch: 'Pensar alguns passos à frente antes de agir.',
    gains: ['Dividir problemas em etapas', 'Escolher a ordem certa das ações', 'Fazer mais com menos recursos', 'Prever consequências'],
  },
  {
    id: 'atencao', name: 'Atenção', color: '#3EDBB0', img: 'assets/skills/atencao.webp',
    pitch: 'Focar no que importa e ignorar o que distrai.',
    gains: ['Atenção seletiva', 'Controle de impulsos', 'Antecipar o tempo certo', 'Foco sustentado'],
  },
  {
    id: 'memoria', name: 'Memória', color: '#A78BFA', img: 'assets/skills/memoria.webp',
    pitch: 'Guardar, manipular e recuperar informação.',
    gains: ['Memória visuoespacial', 'Memória de trabalho', 'Recuperar posições de cabeça', 'Associar padrões'],
  },
  {
    id: 'criatividade', name: 'Criatividade', color: '#38BDF8', img: 'assets/skills/criatividade.webp',
    pitch: 'Explorar caminhos novos e soluções inesperadas.',
    gains: ['Pensamento divergente', 'Experimentar sem medo de errar', 'Achar mais de uma solução', 'Expressão livre'],
  },
];

// Índice de ligação (0–100): quão direta é a conexão daquele órgão com o cérebro.
export const AVATARS = [
  { id: 'medula', name: 'Medula Espinhal', link: 98, fact: 'A grande estrada do sistema nervoso: liga o cérebro a todo o corpo.' },
  { id: 'olhos', name: 'Olhos', link: 95, fact: 'A retina é tecido do próprio cérebro, projetado para fora do crânio.' },
  { id: 'ouvidos', name: 'Ouvidos', link: 90, fact: 'A cóclea transforma vibração em sinais neurais e cuida do equilíbrio.' },
  { id: 'intestino', name: 'Intestino', link: 88, fact: 'O "segundo cérebro": cerca de 500 milhões de neurônios próprios.' },
  { id: 'maos', name: 'Mãos', link: 85, fact: 'Ocupam uma das maiores áreas do córtex motor e sensorial.' },
  { id: 'coracao', name: 'Coração', link: 82, fact: 'Tem uma rede de neurônios própria e conversa com o cérebro pelo nervo vago.' },
  { id: 'pele', name: 'Pele', link: 75, fact: 'O maior órgão sensorial: milhões de receptores de toque e temperatura.' },
  { id: 'pulmoes', name: 'Pulmões', link: 70, fact: 'O ritmo da respiração regula o alerta e a calma do cérebro.' },
].map((a) => ({ ...a, img: `assets/avatars/${a.id}.webp` }));

export const avatarById = (id) => AVATARS.find((a) => a.id === id) || AVATARS[0];

// Boas ações cognitivas: ajudar o cérebro de outra pessoa.
export const DEEDS = [
  {
    id: 'ler', title: 'Ler em voz alta para alguém', mins: 15,
    how: 'Escolha uma criança ou um idoso. Leia 15 minutos e, no fim, faça 3 perguntas sobre a história para estimular memória e compreensão.',
  },
  {
    id: 'jogo-tabuleiro', title: 'Ensinar um jogo de tabuleiro', mins: 30,
    how: 'Damas, xadrez ou dominó. Explique uma regra por vez, jogue uma partida "aberta" pensando em voz alta e deixe a pessoa vencer só se merecer.',
  },
  {
    id: 'idoso-digital', title: 'Ensinar algo digital a um idoso', mins: 20,
    how: 'Uma tarefa só: mandar áudio, fazer chamada de vídeo, salvar uma foto. Deixe a pessoa fazer com as próprias mãos, três vezes seguidas.',
  },
  {
    id: 'memoria-familia', title: 'Desafio de memória em família', mins: 10,
    how: 'Monte a lista de compras de cabeça: cada um repete os itens anteriores e acrescenta um. Quem lembrar mais itens escolhe a sobremesa.',
  },
  {
    id: 'escuta', title: 'Escuta atenta, sem celular', mins: 10,
    how: 'Guarde o celular. Peça para alguém contar algo importante e só faça perguntas abertas. Ao final, resuma o que ouviu para mostrar atenção.',
  },
  {
    id: 'idioma', title: 'Ensinar palavras de outro idioma', mins: 10,
    how: 'Escolha 5 palavras úteis, associe cada uma a uma imagem ou gesto e peça para a pessoa usá-las numa frase no dia seguinte.',
  },
  {
    id: 'calculo', title: 'Desafio de lógica na refeição', mins: 10,
    how: 'Proponha um enigma ou uma conta de cabeça durante o jantar. Dê tempo para pensarem e celebre quem explicar o raciocínio, não só a resposta.',
  },
  {
    id: 'caminhada', title: 'Caminhada com conversa nova', mins: 20,
    how: 'Caminhe 20 minutos com alguém falando de um assunto que nenhum dos dois domina. Movimento + novidade é combustível para o cérebro.',
  },
  {
    id: 'livro', title: 'Emprestar e discutir um livro', mins: 30,
    how: 'Empreste um livro que mudou sua cabeça e marque uma conversa de 30 minutos para trocarem as ideias principais.',
  },
  {
    id: 'quebra-cabeca', title: 'Resolver um quebra-cabeça junto', mins: 20,
    how: 'Palavras-cruzadas, sudoku ou quebra-cabeça. Não dê a resposta: dê pistas e deixe a pessoa chegar lá.',
  },
];

export const deedById = (id) => DEEDS.find((d) => d.id === id);
