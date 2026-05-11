-- workflow_schedules table
create table public.workflow_schedules (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  user_id uuid not null,
  cron_expression text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  claimed_at timestamptz,
  last_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id)
);

alter table public.workflow_schedules enable row level security;

create policy "Schedules owner select" on public.workflow_schedules
  for select using (auth.uid() = user_id);
create policy "Schedules owner insert" on public.workflow_schedules
  for insert with check (auth.uid() = user_id);
create policy "Schedules owner update" on public.workflow_schedules
  for update using (auth.uid() = user_id);
create policy "Schedules owner delete" on public.workflow_schedules
  for delete using (auth.uid() = user_id);

create trigger trg_workflow_schedules_touch
before update on public.workflow_schedules
for each row execute function public.touch_updated_at();

create index idx_workflow_schedules_next_run on public.workflow_schedules (enabled, next_run_at);
create index idx_workflow_schedules_user on public.workflow_schedules (user_id);

-- Atomic claim: returns rows that are due AND were just claimed (claimed_at set)
create or replace function public.claim_due_schedules(_limit int default 25, _lock_seconds int default 300)
returns table (
  id uuid,
  workflow_id uuid,
  user_id uuid,
  cron_expression text,
  timezone text,
  next_run_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select s.id
    from public.workflow_schedules s
    where s.enabled = true
      and s.next_run_at is not null
      and s.next_run_at <= now()
      and (s.claimed_at is null or s.claimed_at < now() - make_interval(secs => _lock_seconds))
    order by s.next_run_at asc
    for update skip locked
    limit _limit
  )
  update public.workflow_schedules s
     set claimed_at = now()
    from picked p
   where s.id = p.id
  returning s.id, s.workflow_id, s.user_id, s.cron_expression, s.timezone, s.next_run_at;
end;
$$;

-- Mark a schedule as completed; resets claimed_at, sets last_run_at and next_run_at
create or replace function public.mark_schedule_run(
  _id uuid,
  _next_run_at timestamptz,
  _run_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workflow_schedules
     set last_run_at = now(),
         next_run_at = _next_run_at,
         last_run_id = _run_id,
         claimed_at = null
   where id = _id;
end;
$$;

alter publication supabase_realtime add table public.workflow_schedules;