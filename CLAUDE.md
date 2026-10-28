# SCHOLA

Plataforma web de jogos cognitivos: um **shell** (abertura, cadastro com avatar-órgão, hub com pontos, trilhas de Sua Mente, jogos e mural de Boas Ações Cognitivas) que hospeda **sub-jogos**. Funciona com toque (celular, laptop touch) e mouse. Publicado em https://thiagounlimited.github.io/schola/ (GitHub Pages, a partir da `main`).

## Rodar
- `py -m http.server 5173` (ou `npm run dev`) e abra http://localhost:5173. ES modules exigem servidor HTTP.
- Sem build e sem dependências: HTML + CSS + JS puro (ES modules), Canvas 2D e Web Audio.
- `node tools/check-levels.js [id]` (ou `npm run check`) simula a física real e confirma que cada fase do Tensa tem solução dentro do par (~40 s). Rode após mexer em `games/tensa/levels.js` ou `physics.js`.

## Estrutura
- `index.html`, `css/schola.css`: shell e tokens visuais (preto profundo, Space Grotesk + Inter, neon magenta/ciano do logo "anel de foco").
- `js/main.js`: roteamento por hash (`#/<jogo>/<sub-rota>`), cadastro/entrada, hub, mural + dashboard, folha de Ajuda, registro `GAMES`. Todo texto vindo de outros jogadores passa por `esc()`.
- `js/store.js`: usuários (login só por apelido), pontos, histórico mensal, compromissos e boas ações. Sempre salva em localStorage (`schola.v2`); com Supabase configurado, sincroniza perfis e publica boas ações.
- `js/config.js`: `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Vazios = modo local. Tabelas e regras (RLS) em `supabase/schema.sql`.
- `js/scoring.js`: escala única 0–1.000.000 por jogo e faixas Beginner → Elite; `distributePoints(pesos)` reparte o milhão entre as fases.
- `js/catalog.js`: trilhas (`SKILLS`), avatares-órgão com índice de ligação (`AVATARS`), lista de boas ações (`DEEDS`).
- `js/audio.js`: `SoundEngine` sintetizado (pentatônica). `init()` só dentro de gesto do usuário.
- `assets/`: imagens dos avatares e das trilhas (WebP). `brand/`: logo atual; `brand/logos/` guarda as propostas do Higgsfield.

## Contrato de sub-jogo
`games/<id>/index.js` exporta `{ id, title, tagline, accent, cover, skills, mount(root, api) }`; `mount` retorna `{ route(path), destroy() }`.
O `api` traz `audio`, `haptic`, `go(subrota)`, `home()`, `requestHelp(ctx) → Promise<boolean>` (abre a folha de boa ação; true = jogador se comprometeu) e `progress.{levels, points, saveLevel(levelId, {points, stars, skill}), addFreeMinute}`.
Todo jogo deve: distribuir 1.000.000 pontos entre as fases, marcar cada fase com uma trilha (`skill`) e um foco específico, e oferecer o botão Ajuda ligado a `requestHelp`.

## Tensa (estilingue de elástico + bilhar/golfe)
- `physics.js`: física pura e determinística (passo fixo 1/240 s). Bolas, buracos (bola rápida demais "espirra" na borda: `cap`), paredes, blocos, pinos e elásticos como tabelas. `launch()` dispara a bola da bolsa do estilingue na direção oposta à puxada.
- `solver.js`: busca por simulação (ângulo × força). Usado pela Ajuda (fantasma da tacada) e pelo validador.
- `engine.js`: desenho, toque, mira prevista (simula a tacada e mostra `guide` × trajetória), regras da fase (vitória, bola volta ao estilingue quando para longe).
- `levels.js`: 12 fases, cada uma com `skill`, `focus` e um desafio novo; `FREE` é o treino livre (sem pontos, conta minutos de Criatividade).
- Pontos da fase: 100% dentro do par; cada tacada extra tira 20% (mínimo 35%). Ajuda não tira pontos: custa um compromisso de boa ação.

## Convenções
- Interface em português do Brasil, tom gentil (nunca "game over"). Nomes das faixas de pontos ficam em inglês (decisão do produto).
