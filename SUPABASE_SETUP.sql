-- GeoCauce v0.16.37-alpha · esquema cloud para cuenta + sincronización completa del proyecto
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- IMPORTANTE: usa únicamente la publishable/anon key en la app. Nunca pongas service_role en GeoCauce.

create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  zone text,
  torrent text,
  crs text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_snapshots (
  project_id text primary key references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  palette jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_project_snapshots_owner on public.project_snapshots(owner_id);

alter table public.projects enable row level security;
alter table public.project_snapshots enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_snapshots to authenticated;

-- Cada usuario solo ve y modifica sus propios proyectos.
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "snapshots_select_own" on public.project_snapshots;
create policy "snapshots_select_own" on public.project_snapshots
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "snapshots_insert_own" on public.project_snapshots;
create policy "snapshots_insert_own" on public.project_snapshots
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "snapshots_update_own" on public.project_snapshots;
create policy "snapshots_update_own" on public.project_snapshots
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "snapshots_delete_own" on public.project_snapshots;
create policy "snapshots_delete_own" on public.project_snapshots
for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

-- Bucket privado usado por GeoCauce para fotos, GeoTIFF/raster y geometría/render de capas vectoriales.
insert into storage.buckets (id, name, public)
values ('geocauce-files', 'geocauce-files', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "geocauce_files_select_own" on storage.objects;
create policy "geocauce_files_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'geocauce-files'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "geocauce_files_insert_own" on storage.objects;
create policy "geocauce_files_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'geocauce-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "geocauce_files_update_own" on storage.objects;
create policy "geocauce_files_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'geocauce-files'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'geocauce-files'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "geocauce_files_delete_own" on storage.objects;
create policy "geocauce_files_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'geocauce-files'
  and owner_id = (select auth.uid()::text)
);
