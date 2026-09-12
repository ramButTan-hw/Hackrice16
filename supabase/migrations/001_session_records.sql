-- Run in Supabase SQL Editor. Only the trusted Node backend may access these rows.
create table if not exists public.session_records (
  id uuid primary key,
  revision integer not null default 0 check (revision >= 0),
  started_at bigint not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists session_records_started_at_idx on public.session_records (started_at desc);
alter table public.session_records enable row level security;
revoke all on public.session_records from anon, authenticated;
grant select, insert, update, delete on public.session_records to service_role;
-- No public RLS policies. Server-side secret/service-role access only.
-- Aggregate JSON preserves a session, samples, baseline, and interventions in one
-- atomic revisioned write. Normalize samples into a separate table for larger scale.
