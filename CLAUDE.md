# SCHOLA

Jogo web de desenvolvimento cognitivo: um **shell** (abertura, hub, perfil de habilidades, ajustes) que hospeda **sub-jogos**. Leve, relaxante e colorido; funciona com toque (celular, laptop touch) e mouse.

## Rodar
- `py -m http.server 5173` (ou `npm run dev`) e abra http://localhost:5173 — ES modules exigem servidor HTTP, não abra o `index.html` direto.
- Sem build, sem dependências: HTML + CSS + JS puro (ES modules), Canvas 2D e Web Audio.
- `node tools/check-levels.js` (ou `npm run check`) valida que toda fase do Tensa tem solução. Rode após mexer em `games/tensa/levels.js`.

## Estrutura
- `index.html`, `css/schola.css` — shell e tokens visuais (noite índigo + neon do emblema, cores doces do wordmark).
- `js/main.js` — roteamento por hash (`#/<jogo>/<sub-rota>`), hub, ajustes, `SKILLS`, registro `GAMES`.
- `js/audio.js` — `SoundEngine` (tudo sintetizado; escala pentatônica `SCALE`/`noteFreq`). `init()` só dentro de gesto do usuário (tela de abertura).
- `js/progress.js` — localStorage `schola.v1`: estrelas por fase e XP por habilidade (6 XP = 1 nível).
- `games/<id>/index.js` — contrato do sub-jogo: `{ id, title, tagline, accent, art, totalStars, mount(root, api) }`; `mount` retorna `{ route(path), destroy() }`. O `api` traz `audio`, `haptic`, `go(subrota)`, `home()`, `progress.{stars, saveLevel, addXP}`.
- `brand/` — `schola-wordmark.png` (logo 1, sem fundo), `schola-emblem.png` + `icon-*.png` (logo 4, cérebro neon). Originais do Higgsfield em `brand/logos/`.

## Tensa (sub-jogo de elásticos)
- `engine.js` — `Board`: pinos, elásticos como polígonos de índices de pinos (2 pinos = laço fino), vibração por segmento (oscilador amortecido, 2 modos), Pointer Events multitoque, modo `echo` (classe `Echo`).
- `geometry.js` — funções puras compartilhadas pelo jogo e pelo validador (movimento, ponto-em-polígono, polígono simples, avaliação das sementes).
- `levels.js` — coordenadas normalizadas 0–1; `solution` alimenta a dica e o validador; `par` = nº de polígonos da solução (2ª estrela).
- Regras: semente colorida precisa estar dentro de ao menos um elástico, e todo elástico que a envolve deve ser "puro" (uma só cor, sem espinhos). Espinho (`c: -1`) não pode estar dentro de nenhum elástico.
- Estrelas: completar +1, elásticos ≤ par +1, sem dica +1. Eco: 0 erros = 3, ≤2 = 2.

## Convenções
- Textos de interface em português do Brasil, tom gentil (sem "game over", erros são "quase!").
- Novo sub-jogo: criar `games/<id>/`, exportar o contrato acima e adicioná-lo a `GAMES` em `js/main.js`.
