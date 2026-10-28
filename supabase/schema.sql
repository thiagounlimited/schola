-- SCHOLA — tabelas do Supabase. Cole no SQL Editor do projeto e clique em Run.
-- Login só por apelido (decisão de produto): qualquer pessoa que souber um apelido
-- pode entrar como ele. Os limites abaixo só evitam abuso grosseiro.

create table if not exists public.profiles (
  id          text primary key check (char_length(id) between 2 and 40),
  nickname    text not null check (char_length(nickname) between 2 and 40),
  avatar      text not null check (char_length(avatar) <= 30),
  city        text not null default '' check (char_length(city) <= 60),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.deeds (
  id          bigint generated always as identity primary key,
  profile_id  text not null references public.profiles(id) on delete cascade,
  nickname    text not null check (char_length(nickname) <= 40),
  avatar      text not null check (char_length(avatar) <= 30),
  deed_id     text not null check (char_length(deed_id) <= 40),
  title       text not null check (char_length(title) <= 80),
  note        text not null default '' check (char_length(note) <= 280),
  city        text not null default '' check (char_length(city) <= 60),
  people      int  not null default 1 check (people between 1 and 50),
  created_at  timestamptz not null default now()
);

create index if not exists deeds_created_at_idx on public.deeds (created_at desc);

alter table public.profiles enable row level security;
alter table public.deeds enable row level security;

-- Leitura pública (o mural e o placar são abertos a todos os jogadores).
drop policy if exists "profiles leitura" on public.profiles;
create policy "profiles leitura" on public.profiles for select to anon using (true);
drop policy if exists "deeds leitura" on public.deeds;
create policy "deeds leitura" on public.deeds for select to anon using (true);

-- Criar e atualizar o próprio perfil; registrar boas ações. Ninguém apaga nada pelo app.
drop policy if exists "profiles criar" on public.profiles;
create policy "profiles criar" on public.profiles for insert to anon with check (true);
drop policy if exists "profiles atualizar" on public.profiles;
create policy "profiles atualizar" on public.profiles for update to anon using (true) with check (true);
drop policy if exists "deeds criar" on public.deeds;
create policy "deeds criar" on public.deeds for insert to anon
  with check (exists (select 1 from public.profiles p where p.id = profile_id));
