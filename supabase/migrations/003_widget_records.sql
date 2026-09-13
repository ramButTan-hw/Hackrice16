create table if not exists public.widget_records (
  id text primary key check (id in ('timer','checklist')),
  revision integer not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
alter table public.widget_records enable row level security;
revoke all on public.widget_records from anon, authenticated;
grant select, insert, update on public.widget_records to service_role;
