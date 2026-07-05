-- Схема Supabase для сквозной синхронизации прогресса тренажёра.
-- Выполни этот скрипт один раз в Supabase → SQL Editor → New query → Run.
--
-- Безопасность строится на двух вещах:
--   1) Row Level Security (RLS) ниже — каждый пользователь видит и меняет
--      ТОЛЬКО свои строки (user_id = auth.uid()).
--   2) Отключённая публичная регистрация в Auth (см. README) — чтобы
--      посторонний вообще не мог завести аккаунт.

-- === Таблицы ===
-- data хранит запись целиком (jsonb), updated_at — метка для слияния (ms).

create table if not exists public.progress (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  card_id    text        not null,
  updated_at bigint      not null,
  data       jsonb       not null,
  primary key (user_id, card_id)
);

create table if not exists public.personal (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  card_id    text        not null,
  updated_at bigint      not null,
  data       jsonb       not null,
  primary key (user_id, card_id)
);

create table if not exists public.exams (
  user_id uuid  not null references auth.users (id) on delete cascade,
  exam_id text  not null,
  data    jsonb not null,
  primary key (user_id, exam_id)
);

-- docs: «блобы» по ключу (notebook / custom / game) — тетрадка, свои
-- карточки, игровое состояние. updated_at — метка для слияния.
create table if not exists public.docs (
  user_id    uuid   not null references auth.users (id) on delete cascade,
  key        text   not null,
  updated_at bigint not null,
  data       jsonb  not null,
  primary key (user_id, key)
);

-- === Row Level Security ===
alter table public.progress enable row level security;
alter table public.personal enable row level security;
alter table public.exams    enable row level security;
alter table public.docs     enable row level security;

-- Один и тот же принцип для всех таблиц: доступ только к своим строкам.
-- (drop-if-exists делает скрипт идемпотентным — можно перезапускать.)

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own personal" on public.personal;
create policy "own personal" on public.personal
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own exams" on public.exams;
create policy "own exams" on public.exams
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
