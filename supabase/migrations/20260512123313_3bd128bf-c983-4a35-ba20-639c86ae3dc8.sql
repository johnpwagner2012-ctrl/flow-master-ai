
-- ============ Storage buckets (private) ============
insert into storage.buckets (id, name, public) values
  ('scripts', 'scripts', false),
  ('audio', 'audio', false),
  ('subtitles', 'subtitles', false),
  ('images', 'images', false),
  ('videos', 'videos', false),
  ('thumbnails', 'thumbnails', false),
  ('temp-renders', 'temp-renders', false)
on conflict (id) do nothing;

-- Per-user folder policies: first path segment must equal auth.uid()
do $$
declare b text;
begin
  foreach b in array array['scripts','audio','subtitles','images','videos','thumbnails','temp-renders'] loop
    execute format($f$
      create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]);
    $f$, 'media_' || b || '_select', b);
    execute format($f$
      create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]);
    $f$, 'media_' || b || '_insert', b);
    execute format($f$
      create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]);
    $f$, 'media_' || b || '_update', b);
    execute format($f$
      create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]);
    $f$, 'media_' || b || '_delete', b);
  end loop;
end $$;

-- ============ workflows: publish + version pointer ============
alter table public.workflows
  add column if not exists current_version integer not null default 0,
  add column if not exists published_at timestamptz,
  add column if not exists is_published boolean not null default false;

-- ============ workflow_runs: retries / replay / cancel / trigger source ============
alter table public.workflow_runs
  add column if not exists attempt integer not null default 1,
  add column if not exists parent_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists workflow_version integer;

create index if not exists workflow_runs_workflow_id_created_at_idx
  on public.workflow_runs (workflow_id, created_at desc);

-- ============ node_executions: attempts, duration, browser executor, provider ============
alter table public.node_executions
  add column if not exists attempt integer not null default 1,
  add column if not exists duration_ms integer,
  add column if not exists provider text,
  add column if not exists client_payload jsonb;

create index if not exists node_executions_run_idx on public.node_executions(workflow_run_id);
create index if not exists node_executions_awaiting_idx
  on public.node_executions(status) where status = 'awaiting_client';

-- ============ assets: media metadata for previewing ============
alter table public.assets
  add column if not exists provider text,
  add column if not exists mime_type text,
  add column if not exists duration_ms integer,
  add column if not exists size_bytes bigint,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists thumbnail_url text;

create index if not exists assets_user_created_idx
  on public.assets(user_id, created_at desc);

-- ============ workflow_versions ============
create table if not exists public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null,
  version integer not null,
  name text not null,
  description text,
  snapshot jsonb not null,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);

alter table public.workflow_versions enable row level security;

create policy "Versions owner select" on public.workflow_versions
  for select using (auth.uid() = user_id);
create policy "Versions owner insert" on public.workflow_versions
  for insert with check (auth.uid() = user_id);
create policy "Versions owner update" on public.workflow_versions
  for update using (auth.uid() = user_id);
create policy "Versions owner delete" on public.workflow_versions
  for delete using (auth.uid() = user_id);

-- ============ user_integrations (YouTube OAuth + future providers) ============
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  account_email text,
  account_label text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_integrations enable row level security;

-- Owner can see/manage their own. Tokens themselves only flow through server functions.
create policy "Integrations owner select" on public.user_integrations
  for select using (auth.uid() = user_id);
create policy "Integrations owner insert" on public.user_integrations
  for insert with check (auth.uid() = user_id);
create policy "Integrations owner update" on public.user_integrations
  for update using (auth.uid() = user_id);
create policy "Integrations owner delete" on public.user_integrations
  for delete using (auth.uid() = user_id);

create trigger user_integrations_touch
  before update on public.user_integrations
  for each row execute function public.touch_updated_at();

-- ============ pending_client_jobs (browser executor queue) ============
create table if not exists public.pending_client_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id uuid not null,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  node_execution_id uuid not null references public.node_executions(id) on delete cascade,
  node_key text not null,
  node_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (node_execution_id)
);

alter table public.pending_client_jobs enable row level security;

create policy "Pending jobs owner select" on public.pending_client_jobs
  for select using (auth.uid() = user_id);
create policy "Pending jobs owner insert" on public.pending_client_jobs
  for insert with check (auth.uid() = user_id);
create policy "Pending jobs owner update" on public.pending_client_jobs
  for update using (auth.uid() = user_id);
create policy "Pending jobs owner delete" on public.pending_client_jobs
  for delete using (auth.uid() = user_id);

-- ============ Realtime ============
alter publication supabase_realtime add table public.pending_client_jobs;
alter publication supabase_realtime add table public.workflow_versions;
