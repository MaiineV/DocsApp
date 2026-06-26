-- Migration: initial schema
-- Schemas, enum de roles, tablas multi-tenant (teams/memberships/documents),
-- índices y trigger genérico de updated_at.
-- Fase 0: documents.content es texto plano (Yjs llega en Fase 2).

-- Schema privado para helpers/enum. NO se expone por PostgREST
-- (en Settings -> API -> Exposed schemas dejar solo "public").
create schema if not exists private;

-- Enum de roles del team (jerarquía: owner > admin > editor > viewer).
create type private.team_role as enum ('owner', 'admin', 'editor', 'viewer');

-- ---------------------------------------------------------------------------
-- teams: workspace, tenant raíz del modelo multi-tenant.
-- ---------------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 100),
  created_by  uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.teams is 'Workspace. Tenant raíz del modelo multi-tenant.';

-- ---------------------------------------------------------------------------
-- memberships: une auth.users con teams + rol. Pivot multi-tenant.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        private.team_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, user_id)                      -- un usuario = una membership por team
);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_team_id_idx on public.memberships (team_id);
comment on table public.memberships is 'Une auth.users con teams + rol. Pivot multi-tenant.';

-- ---------------------------------------------------------------------------
-- documents: pertenece a un team. Fase 0 = texto plano.
-- created_by nullable + on delete set null: el doc sobrevive al autor.
-- ---------------------------------------------------------------------------
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  title       text not null default 'Untitled' check (char_length(title) <= 200),
  content     text not null default '',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index documents_team_id_idx on public.documents (team_id);
comment on column public.documents.content is 'Fase 0: texto plano. Migra a Yjs (bytea + snapshots) en Fase 2.';

-- ---------------------------------------------------------------------------
-- Trigger genérico de updated_at.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function private.set_updated_at();

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();
