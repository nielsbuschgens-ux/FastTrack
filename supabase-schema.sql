-- FastTrack tables + RLS
-- Run this in Supabase → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

create table if not exists public.fitness_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fitness_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.fitness_exercises (id) on delete cascade,
  weight numeric not null,
  reps integer not null,
  created_at timestamptz not null default now()
);

create index if not exists fitness_exercises_user_id_idx on public.fitness_exercises (user_id);
create index if not exists fitness_logs_user_id_idx on public.fitness_logs (user_id);
create index if not exists fitness_logs_exercise_id_idx on public.fitness_logs (exercise_id);

alter table public.fitness_exercises enable row level security;
alter table public.fitness_logs enable row level security;

-- Exercises policies
drop policy if exists "Users can read own exercises" on public.fitness_exercises;
create policy "Users can read own exercises"
  on public.fitness_exercises for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own exercises" on public.fitness_exercises;
create policy "Users can insert own exercises"
  on public.fitness_exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own exercises" on public.fitness_exercises;
create policy "Users can update own exercises"
  on public.fitness_exercises for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own exercises" on public.fitness_exercises;
create policy "Users can delete own exercises"
  on public.fitness_exercises for delete
  using (auth.uid() = user_id);

-- Logs policies
drop policy if exists "Users can read own logs" on public.fitness_logs;
create policy "Users can read own logs"
  on public.fitness_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own logs" on public.fitness_logs;
create policy "Users can insert own logs"
  on public.fitness_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own logs" on public.fitness_logs;
create policy "Users can update own logs"
  on public.fitness_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own logs" on public.fitness_logs;
create policy "Users can delete own logs"
  on public.fitness_logs for delete
  using (auth.uid() = user_id);

-- Realtime (optional but used by the app)
do $$
begin
  begin
    alter publication supabase_realtime add table public.fitness_exercises;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.fitness_logs;
  exception when duplicate_object then null;
  end;
end $$;
