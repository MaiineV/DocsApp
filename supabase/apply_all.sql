-- DocsApp — schema Fase 0 (combinado para pegar en el SQL Editor de Supabase)
-- Generado desde supabase/migrations/. Aplicar UNA vez en un proyecto nuevo.


-- ============================================================
-- supabase/migrations/20260624120000_initial_schema.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/20260624120100_rls_and_authz.sql
-- ============================================================
-- Migration: RLS y autorización
-- Funciones helper SECURITY DEFINER (clave anti-recursión), RLS y policies
-- para teams/memberships/documents, + salvaguarda del último owner.
--
-- ANTI-RECURSIÓN: una policy sobre `memberships` que hiciera un subquery a
-- `memberships` re-dispararía la policy -> "infinite recursion". Lo evitamos
-- llamando a funciones SECURITY DEFINER: corren como su owner (la tabla NO
-- está en FORCE RLS), por lo que el subquery interno saltea RLS y no recursa.
-- Por eso usamos ENABLE (no FORCE) ROW LEVEL SECURITY.

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER. search_path = '' + nombres calificados = seguro.
-- ---------------------------------------------------------------------------
create or replace function private.role_rank(p_role private.team_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner'  then 40
    when 'admin'  then 30
    when 'editor' then 20
    when 'viewer' then 10
  end;
$$;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.team_id = p_team_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.get_user_role(p_team_id uuid)
returns private.team_role
language sql
security definer
stable
set search_path = ''
as $$
  select m.role from public.memberships m
  where m.team_id = p_team_id
    and m.user_id = (select auth.uid());
$$;

create or replace function private.has_min_role(p_team_id uuid, p_min private.team_role)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    private.role_rank(private.get_user_role(p_team_id)) >= private.role_rank(p_min),
    false
  );
$$;

-- Grants: solo authenticated puede ejecutar; anon/public no.
revoke all on function private.role_rank(private.team_role)          from public, anon;
revoke all on function private.is_team_member(uuid)                  from public, anon;
revoke all on function private.get_user_role(uuid)                   from public, anon;
revoke all on function private.has_min_role(uuid, private.team_role) from public, anon;

grant execute on function private.role_rank(private.team_role)          to authenticated;
grant execute on function private.is_team_member(uuid)                  to authenticated;
grant execute on function private.get_user_role(uuid)                   to authenticated;
grant execute on function private.has_min_role(uuid, private.team_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Habilitar RLS (sin FORCE, ver nota de cabecera).
-- ---------------------------------------------------------------------------
alter table public.teams       enable row level security;
alter table public.memberships enable row level security;
alter table public.documents   enable row level security;

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create policy teams_select on public.teams
  for select to authenticated
  using ( private.is_team_member(id) );

-- El membership owner lo crea la RPC de bootstrap; el insert directo solo
-- te deja crear teams a tu nombre.
create policy teams_insert on public.teams
  for insert to authenticated
  with check ( created_by = (select auth.uid()) );

create policy teams_update on public.teams
  for update to authenticated
  using ( private.has_min_role(id, 'admin') )
  with check ( private.has_min_role(id, 'admin') );

create policy teams_delete on public.teams
  for delete to authenticated
  using ( private.get_user_role(id) = 'owner' );

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated
  using ( private.is_team_member(team_id) );

-- owner/admin invitan; solo un owner puede crear otro owner.
-- (El bootstrap NO pasa por acá: va por la RPC SECURITY DEFINER.)
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    private.has_min_role(team_id, 'admin')
    and (role <> 'owner' or private.get_user_role(team_id) = 'owner')
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using ( private.has_min_role(team_id, 'admin') )
  with check (
    private.has_min_role(team_id, 'admin')
    and (role <> 'owner' or private.get_user_role(team_id) = 'owner')
  );

-- owner/admin remueven a otros; cualquiera puede removerse a sí mismo
-- (el trigger de abajo protege contra dejar el team sin owner).
create policy memberships_delete on public.memberships
  for delete to authenticated
  using ( private.has_min_role(team_id, 'admin') or user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated
  using ( private.is_team_member(team_id) );          -- cualquier rol, incl. viewer

create policy documents_insert on public.documents
  for insert to authenticated
  with check ( private.has_min_role(team_id, 'editor') and created_by = (select auth.uid()) );

create policy documents_update on public.documents
  for update to authenticated
  using ( private.has_min_role(team_id, 'editor') )
  with check ( private.has_min_role(team_id, 'editor') );

create policy documents_delete on public.documents
  for delete to authenticated
  using ( private.has_min_role(team_id, 'editor') );

-- ---------------------------------------------------------------------------
-- Salvaguarda: no dejar un team sin owner (RLS no ve agregados -> trigger).
-- ---------------------------------------------------------------------------
create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := coalesce(old.team_id, new.team_id);
begin
  -- El team ya se borró (cascade): permitir la baja de su membership owner.
  if not exists (select 1 from public.teams where id = v_team) then
    return coalesce(new, old);
  end if;

  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from public.memberships
        where team_id = v_team and role = 'owner' and id <> old.id) = 0 then
      raise exception 'No se puede dejar el team sin owner';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function private.prevent_last_owner_removal();

-- ============================================================
-- supabase/migrations/20260624120200_bootstrap_rpc.sql
-- ============================================================
-- Migration: bootstrap RPC
-- Crea el primer team + membership owner de forma atómica, resolviendo el
-- huevo-y-gallina (memberships_insert exige ser admin, pero el usuario aún no
-- tiene membership). SECURITY DEFINER -> saltea RLS adentro, sin service_role.
-- Es segura: valida auth.uid() explícitamente, el owner siempre es el llamante,
-- es atómica (rollback si falla), y execute solo para authenticated.

create or replace function public.create_team_with_owner(p_name text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_team public.teams;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'El nombre del team es obligatorio' using errcode = '22023';
  end if;

  insert into public.teams (name, created_by)
  values (trim(p_name), v_user)
  returning * into v_team;

  insert into public.memberships (team_id, user_id, role)
  values (v_team.id, v_user, 'owner');

  return v_team;
end;
$$;

revoke all on function public.create_team_with_owner(text) from public, anon;
grant execute on function public.create_team_with_owner(text) to authenticated;

-- ============================================================
-- supabase/migrations/20260626120000_yjs_persistence.sql
-- ============================================================
-- Migration: Fase 2 — persistencia Yjs + Realtime Authorization
-- Snapshot CRDT en documents + autorización del canal Realtime `doc:<id>`
-- (Broadcast/Presence) con RLS sobre realtime.messages, reusando los helpers
-- SECURITY DEFINER de Fase 0 (mismo patrón anti-recursión).

-- documents: snapshot del Y.Doc (base64) + versión para optimistic concurrency.
-- content pasa a ser cache denormalizada; la fuente de verdad es ydoc_state.
alter table public.documents
  add column if not exists ydoc_state   text,
  add column if not exists ydoc_version integer not null default 0;

comment on column public.documents.ydoc_state is
  'Fase 2: snapshot del Y.Doc (CRDT) en base64. Fuente de verdad del contenido colaborativo. NULL = doc legacy aún no migrado (se siembra desde content al primer open).';
comment on column public.documents.ydoc_version is
  'Fase 2: versión para optimistic concurrency (CAS) al persistir el snapshot Yjs.';
comment on column public.documents.content is
  'Cache denormalizada (JSON de bloques BlockNote) derivada del Y.Doc para SSR/listado/search. Fuente de verdad: ydoc_state. Legacy: texto plano (Fase 0) / JSON (Fase 1) hasta el primer open colaborativo.';

-- Helpers SECURITY DEFINER para autorizar el canal por documento.
--   topic_doc_id: parsea `doc:<uuid>` null-safe (topic malformado -> null).
--   doc_team_id:  mapea documento -> team sin filtrar cross-tenant.
create or replace function private.topic_doc_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic like 'doc:%' then
    return substring(p_topic from 5)::uuid;
  end if;
  return null;
exception when others then
  return null;  -- uuid inválido en el topic -> sin doc -> sin acceso
end;
$$;

create or replace function private.doc_team_id(p_doc uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select d.team_id from public.documents d where d.id = p_doc;
$$;

revoke all on function private.topic_doc_id(text) from public, anon;
revoke all on function private.doc_team_id(uuid)  from public, anon;
grant execute on function private.topic_doc_id(text) to authenticated;
grant execute on function private.doc_team_id(uuid)  to authenticated;

-- Realtime Authorization: RLS sobre realtime.messages para topics `doc:<id>`.
-- (realtime.messages ya tiene RLS habilitada por defecto en Supabase.)
--   - receive (SELECT):        cualquier miembro del team del doc.
--   - send broadcast (INSERT): editor+ -> un viewer no puede inyectar updates.
--   - send presence (INSERT):  cualquier miembro -> los viewers figuran "online".
drop policy if exists "doc realtime receive"        on realtime.messages;
drop policy if exists "doc realtime broadcast send"  on realtime.messages;
drop policy if exists "doc realtime presence send"   on realtime.messages;

create policy "doc realtime receive" on realtime.messages
  for select to authenticated
  using (
    private.is_team_member( private.doc_team_id( private.topic_doc_id(realtime.topic()) ) )
  );

create policy "doc realtime broadcast send" on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.messages.extension) = 'broadcast'
    and private.has_min_role(
      private.doc_team_id( private.topic_doc_id(realtime.topic()) ), 'editor'
    )
  );

create policy "doc realtime presence send" on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.messages.extension) = 'presence'
    and private.is_team_member(
      private.doc_team_id( private.topic_doc_id(realtime.topic()) )
    )
  );

-- ============================================================
-- supabase/migrations/20260627120000_invitations.sql
-- ============================================================
-- Migration: Fase 3 — invitaciones por link con token
-- Tabla de invitaciones (admin-only via RLS) + RPCs SECURITY DEFINER para los
-- caminos del invitado (preview/accept) y el listado de miembros con email.

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role        private.team_role not null default 'viewer' check (role <> 'owner'),
  token       text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  check (expires_at > created_at),
  unique (team_id, email)
);
create index invitations_team_id_idx    on public.invitations (team_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
comment on table public.invitations is
  'Invitaciones por link con token (Fase 3). token = capability; email + confirm-email = binding real. Una pendiente por (team,email); se borra al aceptar/revocar.';

alter table public.invitations enable row level security;

-- RLS: todo admin-only. El invitado (aún no miembro) no ve nada por RLS; sus
-- caminos van por las RPCs SECURITY DEFINER.
create policy invitations_select on public.invitations
  for select to authenticated
  using ( private.has_min_role(team_id, 'admin') );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    private.has_min_role(team_id, 'admin')
    and role <> 'owner'
    and invited_by = (select auth.uid())
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using ( private.has_min_role(team_id, 'admin') )
  with check (
    private.has_min_role(team_id, 'admin')
    and role <> 'owner'
    and invited_by = (select auth.uid())
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using ( private.has_min_role(team_id, 'admin') );

-- Preview por token (inválido -> vacío, sin enumeración). Campos mínimos.
create or replace function public.invitation_preview(p_token text)
returns table (
  team_name    text,
  role         private.team_role,
  expired      boolean,
  email_match  boolean,
  masked_email text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations where token = p_token;
  if not found then
    return;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  return query select
    (select t.name from public.teams t where t.id = v_inv.team_id),
    v_inv.role,
    v_inv.expires_at <= now(),
    v_inv.email = v_email,
    regexp_replace(v_inv.email, '^(.).*(@.*)$', '\1***\2');
end;
$$;

-- Acepta: valida token + email del llamante; inserta membership (idempotente, NO
-- degrada a un miembro existente); consume la invitación.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'Invitación inválida o ya utilizada' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then
    delete from public.invitations where id = v_inv.id;
    raise exception 'La invitación expiró' using errcode = 'P0003';
  end if;
  if v_inv.email <> v_email then
    raise exception 'Esta invitación es para otra dirección de email' using errcode = 'P0004';
  end if;
  if v_inv.role = 'owner' then
    raise exception 'Rol inválido' using errcode = '22023';
  end if;
  insert into public.memberships (team_id, user_id, role)
  values (v_inv.team_id, v_user, v_inv.role)
  on conflict (team_id, user_id) do nothing;
  delete from public.invitations where id = v_inv.id;
  return v_inv.team_id;
end;
$$;

-- Lista miembros con email (gate: solo miembros del team).
create or replace function public.list_team_members(p_team_id uuid)
returns table (
  user_id uuid,
  email   text,
  role    private.team_role
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_team_member(p_team_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team_id
    order by private.role_rank(m.role) desc, u.email;
end;
$$;

revoke all on function public.invitation_preview(text) from public, anon;
revoke all on function public.accept_invitation(text)  from public, anon;
revoke all on function public.list_team_members(uuid)  from public, anon;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text)  to authenticated;
grant execute on function public.list_team_members(uuid)  to authenticated;

-- authenticated necesita USAGE sobre private para ESCRIBIR columnas del enum
-- private.team_role (invitations.role, memberships.role) vía PostgREST. Seguro:
-- private no está en los "Exposed schemas" → no habilita ninguna ruta por la API.
grant usage on schema private to authenticated;

-- ============================================================
-- supabase/migrations/20260628120000_document_hierarchy.sql
-- ============================================================
-- Migration: Fase 4 — jerarquía de documentos (parent/child)
-- parent_id self-FK (orphan-to-root on delete) + índice + trigger de integridad
-- (mismo team, sin auto-padre, sin ciclos). Mismo patrón private/SECURITY DEFINER.

alter table public.documents
  add column if not exists parent_id uuid references public.documents (id) on delete set null;

create index if not exists documents_parent_id_idx on public.documents (parent_id);

comment on column public.documents.parent_id is
  'Padre en la jerarquía (mismo team). NULL = documento raíz. ON DELETE SET NULL: los hijos suben a raíz, nunca se borran en cascada.';

create or replace function private.enforce_document_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_team uuid;
  v_cursor      uuid;
  v_guard       int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un documento no puede ser su propio padre' using errcode = '23514';
  end if;

  select d.team_id into v_parent_team from public.documents d where d.id = new.parent_id;
  if v_parent_team is null then
    raise exception 'El documento padre no existe' using errcode = '23503';
  end if;
  if v_parent_team <> new.team_id then
    raise exception 'El padre debe pertenecer al mismo team' using errcode = '23514';
  end if;

  -- Walk-up: si alcanzamos new.id partiendo del padre, hay ciclo.
  v_cursor := new.parent_id;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'Ciclo no permitido en la jerarquía de documentos' using errcode = '23514';
    end if;
    select d.parent_id into v_cursor from public.documents d where d.id = v_cursor;
    v_guard := v_guard + 1;
    if v_guard > 10000 then
      raise exception 'Profundidad de jerarquía excedida' using errcode = '54001';
    end if;
  end loop;

  return new;
end;
$$;

create trigger documents_enforce_parent
  before insert or update of parent_id, team_id on public.documents
  for each row execute function private.enforce_document_parent();
