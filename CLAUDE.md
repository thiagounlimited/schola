# SCHOLA

Plataforma web de jogos cognitivos: um **shell** (abertura, cadastro com avatar-órgão, hub com pontos, trilhas de Sua Mente, jogos e mural de Boas Ações Cognitivas) que hospeda **sub-jogos**. Funciona com toque (celular, laptop touch) e mouse. Publicado em https://thiagounlimited.github.io/schola/ (GitHub Pages, a partir da `main`).

## Rodar
- `py -m http.server 5173` (ou `npm run dev`) e abra http://localhost:5173. ES modules exigem servidor HTTP.
- Sem build e sem dependências: HTML + CSS + JS puro (ES modules), Canvas 2D e Web Audio.
- `node tools/check-levels.js [id]` (ou `npm run check`) simula a física real e confirma que cada fase do Tensa tem solução dentro do par (~40 s). Rode após mexer em `games/tensa/levels.js` ou `physics.js`.

## Estrutura
- `index.html`, `css/schola.css`: shell e tokens visuais (preto profundo, Space Grotesk + Inter, neon magenta/ciano do logo "anel de foco").
- `js/main.js`: só a abertura com a escolha de idioma (PT/EN). Depois do toque, inicia o áudio e carrega `js/app.js` com `import()` dinâmico.
- `js/app.js`: roteamento por hash (`#/<jogo>/<sub-rota>`, `#/mente/<trilha>`), cadastro/entrada, hub (trilhas, cards de jogo, Boas Ações), página de cada trilha (o que desenvolve, tabela de fases por jogo, métricas, comparação com todos os jogadores), folha de Ajuda, registro `GAMES`. Todo texto vindo de outros jogadores passa por `esc()`.
- `js/i18n.js`: `L(pt, en)` devolve o texto no idioma escolhido (`schola.lang` no localStorage). Como o app só carrega depois da escolha, `L()` pode ser usado até em constantes de módulo. Trocar de idioma nos Ajustes recarrega a página. **Todo texto novo de interface precisa das duas línguas.**
- `js/store.js`: usuários (login só por apelido), pontos, histórico mensal, compromissos e boas ações. Sempre salva em localStorage (`schola.v2`); com Supabase configurado, sincroniza perfis e publica boas ações.
- `js/config.js`: `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Vazios = modo local. Tabelas e regras (RLS) em `supabase/schema.sql`.
- `js/scoring.js`: escala única 0–1.000.000 por jogo e faixas Beginner → Elite; `distributePoints(pesos)` reparte o milhão entre as fases.
- `js/catalog.js`: trilhas (`SKILLS`, com `gains` e `life`), avatares-órgão com índice de ligação (`AVATARS`), boas ações com imagem e trilha que exercitam (`DEEDS`) e selos de impacto (`BADGES`).
- `js/audio.js`: `SoundEngine` sintetizado (pentatônica). `init()` só dentro de gesto do usuário. A música ambiente é "wellness": acordes longos em Dó maior que mudam a cada 10 s (ritmo de ~6 respirações/min), mar de ruído rosado que "respira" e notas de kalimba esparsas.
- `assets/`: imagens dos avatares, das trilhas e das boas ações (`assets/deeds/<id>.webp`), em WebP. Trilhas, boas ações e capas dos jogos seguem uma direção única: fotografia editorial real, luz quente de fim de tarde, fundo escuro, grão de filme, um acento de cor da trilha. `brand/`: logo atual; `brand/logos/` guarda as propostas do Higgsfield.

## Contrato de sub-jogo
`games/<id>/index.js` exporta `{ id, title, tagline, accent, cover, skills, levels, free: { name, skill, focus, path }, mount(root, api) }` (`levels` e `free` alimentam os cards de jogo e a página da trilha); `mount` retorna `{ route(path), destroy() }`.
O `api` traz `audio`, `haptic`, `go(subrota)`, `home()`, `requestHelp(ctx) → Promise<boolean>` (abre a folha de boa ação; true = jogador se comprometeu) e `progress.{levels, points, saveLevel(levelId, {points, stars, skill}), addFreeMinute}`.
Todo jogo deve: distribuir 1.000.000 pontos entre as fases, marcar cada fase com uma trilha (`skill`) e um foco específico, e oferecer o botão Ajuda ligado a `requestHelp`.

## Tensa (estilingue de elástico + bilhar/golfe)
- `physics.js`: física pura e determinística (passo fixo 1/240 s). Bolas, buracos (bola rápida demais "espirra" na borda: `cap`), paredes, blocos, pinos e elásticos como tabelas. `launch()` dispara a bola da bolsa do estilingue na direção oposta à puxada.
- `solver.js`: busca por simulação (ângulo × força). Usado pela Ajuda (fantasma da tacada) e pelo validador.
- `engine.js`: desenho, toque, mira prevista (simula a tacada e mostra `guide` × trajetória), regras da fase (vitória, bola volta ao estilingue quando para longe).
- `levels.js`: 12 fases, cada uma com `skill`, `focus` e um desafio novo; `FREE` é o treino livre (sem pontos, conta minutos de Criatividade).
- Pontos da fase: 100% dentro do par; cada tacada extra tira 20% (mínimo 35%). Ajuda não tira pontos: custa um compromisso de boa ação.

## Lume (atenção, economia cognitiva, monotasking e resíduo de atenção)
- `engine.js`: o dedo é o feixe de foco; a chama sob ele cresce (`need` segundos). Trocar de chama no meio deixa um fio (resíduo: −25% de velocidade por fio aberto) e custa `switchCost` de luz; mudar de tipo custa `ctxCost`. Levantar o dedo numa chama começada mostra a âncora ⚓ (estacionar = sem resíduo). Bolhas são distrações (tocar = interrupção + pontinhos falsos). Losango ciano = sinal urgente com prazo. Fluxo cresce com foco contínuo e liga a camada `audio.setFlow()`.
- `levels.js`: 12 fases + `FREE` (Respiro: minutos de foco contam para Atenção via `addFreeMinute('atencao')`).
- Pontos: 60% concluir + 25% calma (cada interrupção além do `par` tira um quarto disso) + 15% tempo em Fluxo. Estrelas pelas interrupções.
- `node tools/check-lume.js [id]`: um robô "uma coisa de cada vez" precisa vencer cada fase com 3 estrelas; um robô multitarefa mostra o contraste. Rode após mexer em `games/lume/`.
- Abrir com `?local` desliga o Supabase e expõe `window.__lume` (o `Board` atual) para testes.

## Convenções
- Interface em português do Brasil, tom gentil (nunca "game over"). Nomes das faixas de pontos ficam em inglês (decisão do produto).
