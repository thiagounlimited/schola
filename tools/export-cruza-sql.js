// Gera supabase/cruza.sql: a tabela public.cruza_words, suas regras (RLS) e o primeiro lote de
// palavras (os arquivos de games/cruza/words/). Rode depois de mexer no banco local e cole o
// resultado no SQL Editor do Supabase. Pode rodar de novo: as palavras são atualizadas pelo id.
// Uso: node tools/export-cruza-sql.js
import { writeFileSync } from 'node:fs';
import ia from '../games/cruza/words/ia.js';
import atualidades from '../games/cruza/words/atualidades.js';
import ciencia from '../games/cruza/words/ciencia.js';
import dinheiro from '../games/cruza/words/dinheiro.js';
import bemestar from '../games/cruza/words/bemestar.js';

const sets = { ia, atualidades, ciencia, dinheiro, bemestar };
const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const rows = Object.entries(sets).flatMap(([cat, list]) => list.map((e) =>
  `  (${[e.id, e.lang, cat, e.word, e.clue, e.clue2, e.explain, e.analogy].map(q).join(', ')})`));

const sql = `-- CRUZA — banco de palavras online. Gerado por tools/export-cruza-sql.js.
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo sem duplicar nada.
--
-- Para acrescentar uma palavra nova (ex.: em Atualidades), rode um insert como este:
--   insert into public.cruza_words (id, lang, cat, word, clue, clue2, explain, analogy) values
--   ('atualidades-pt-exemplo', 'pt', 'atualidades', 'Exemplo', 'Dica curta', 'Dica mais fácil',
--    'Explicação didática em até 280 caracteres.', 'É como... (analogia do dia a dia).');
-- Regras: uma palavra só, 3 a 13 letras (acentos são ignorados na grade); a dica não pode conter a palavra.
-- Categorias: atualidades, ia, ciencia, dinheiro, bemestar. Idiomas: pt, en.
-- Para tirar uma palavra do jogo sem apagar: update public.cruza_words set active = false where id = '...';

create table if not exists public.cruza_words (
  id          text primary key check (char_length(id) between 3 and 80),
  lang        text not null check (lang in ('pt', 'en')),
  cat         text not null check (cat in ('atualidades', 'ia', 'ciencia', 'dinheiro', 'bemestar')),
  word        text not null check (char_length(word) between 3 and 20),
  clue        text not null check (char_length(clue) <= 120),
  clue2       text not null default '' check (char_length(clue2) <= 120),
  explain     text not null check (char_length(explain) <= 400),
  analogy     text not null check (char_length(analogy) <= 300),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.cruza_words enable row level security;

-- Leitura pública; só quem tem acesso ao painel do Supabase (SQL Editor) acrescenta ou edita palavras.
drop policy if exists "cruza leitura" on public.cruza_words;
create policy "cruza leitura" on public.cruza_words for select to anon using (active);

insert into public.cruza_words (id, lang, cat, word, clue, clue2, explain, analogy) values
${rows.join(',\n')}
on conflict (id) do update set
  lang = excluded.lang, cat = excluded.cat, word = excluded.word, clue = excluded.clue,
  clue2 = excluded.clue2, explain = excluded.explain, analogy = excluded.analogy;
`;

writeFileSync(new URL('../supabase/cruza.sql', import.meta.url), sql);
console.log(`supabase/cruza.sql: ${rows.length} palavras.`);
