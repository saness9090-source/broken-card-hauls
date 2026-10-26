-- Broken Card Hauls: run this in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.collector_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"collection":[],"wishlist":[],"trades":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.collector_data enable row level security;
drop policy if exists "Collectors can read their own data" on public.collector_data;
create policy "Collectors can read their own data" on public.collector_data
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Collectors can insert their own data" on public.collector_data;
create policy "Collectors can insert their own data" on public.collector_data
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Collectors can update their own data" on public.collector_data;
create policy "Collectors can update their own data" on public.collector_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.collector_data to authenticated;
