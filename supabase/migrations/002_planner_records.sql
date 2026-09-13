-- Run after 001 when DATA_PROVIDER=supabase. SQLite creates this automatically.
create table if not exists public.planner_records (
  id uuid primary key,
  start_at bigint not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists planner_records_start_at_idx on public.planner_records (start_at);
alter table public.planner_records enable row level security;
revoke all on public.planner_records from anon, authenticated;
grant select, insert, update, delete on public.planner_records to service_role;
