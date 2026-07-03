-- Migration: Links view-only públicos de documentos (Fase 12).
--
-- "Share to web" estilo Notion: un link /share/<token> muestra un documento (y,
-- si el link lo permite, su subárbol) en modo LECTURA a cualquiera, sin login. El
-- token crudo (256 bits, único) VIVE en la URL -> es el secreto (patrón invitación,
-- no PAT: no se hashea). La resolución pública va por RPCs SECURITY DEFINER granted
-- a `anon` (nunca exponen la tabla documents); la administración (crear/revocar
-- desde la web) usa las policies RLS editor+ de abajo.

-- ---------------------------------------------------------------------------
-- document_shares: a lo sumo 1 link activo por documento (índice único parcial).
-- ---------------------------------------------------------------------------
create table if not exists public.document_shares (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents (id) on delete cascade,
  token            text not null unique,
  include_subpages boolean not null default false,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz
);
comment on table public.document_shares is 'Links públicos read-only de documentos (Notion "Share to web"). El token crudo vive en la URL.';

-- Crear cuando ya hay uno activo = idempotente (lo reusa la action); revocar =
-- set revoked_at; re-compartir = token nuevo.
create unique index document_shares_active_idx
  on public.document_shares (document_id) where revoked_at is null;
create index document_shares_document_idx on public.document_shares (document_id);

alter table public.document_shares enable row level security;

-- Gestión (ver/crear/revocar) solo editor+ del team del documento. Reusa el helper
-- SECURITY DEFINER private.doc_team_id (doc -> team sin RLS) igual que las policies
-- de realtime.messages. anon NO tiene acceso a filas -> la lectura pública va por
-- las RPCs de abajo.
create policy document_shares_select on public.document_shares
  for select to authenticated
  using ( private.has_min_role(private.doc_team_id(document_id), 'editor') );
create policy document_shares_insert on public.document_shares
  for insert to authenticated
  with check (
    private.has_min_role(private.doc_team_id(document_id), 'editor')
    and created_by = (select auth.uid())
  );
create policy document_shares_update on public.document_shares
  for update to authenticated
  using ( private.has_min_role(private.doc_team_id(document_id), 'editor') )
  with check ( private.has_min_role(private.doc_team_id(document_id), 'editor') );

-- ---------------------------------------------------------------------------
-- get_shared_doc: resuelve UN documento dentro de un share, para anon (pre-auth).
-- p_doc_id null -> la raíz. Valida que el doc pedido pertenezca al set compartido
-- (la raíz, o -si include_subpages- un descendiente con TODO el path activo) y no
-- esté borrado. Vacío ante token inválido/revocado o doc fuera del set (sin
-- enumeración). SECURITY DEFINER: lee documents sin RLS pero solo expone lo
-- compartido. Grant SOLO a anon; el WARN del linter por "SECURITY DEFINER
-- ejecutable por anon" es intencional (igual que invitations/consume_api_token).
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_doc(p_token text, p_doc_id uuid default null)
returns table (
  root_id uuid, include_subpages boolean,
  id uuid, title text, content text, ydoc_state text, parent_id uuid
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_root   uuid;
  v_sub    boolean;
  v_target uuid;
  v_ok     boolean;
begin
  select s.document_id, s.include_subpages
    into v_root, v_sub
  from public.document_shares s
  where s.token = p_token and s.revoked_at is null;

  if v_root is null then
    return;  -- token inválido/revocado
  end if;

  -- la raíz debe estar activa (no en papelera)
  if not exists (select 1 from public.documents d where d.id = v_root and d.deleted_at is null) then
    return;
  end if;

  v_target := coalesce(p_doc_id, v_root);

  if v_target <> v_root then
    if not v_sub then
      return;  -- share page-only: solo la raíz
    end if;
    -- ¿v_target es descendiente activo de v_root (todo el path activo)?
    with recursive sub as (
      select d.id, d.parent_id
        from public.documents d
       where d.parent_id = v_root and d.deleted_at is null
      union all
      select d.id, d.parent_id
        from public.documents d
        join sub on d.parent_id = sub.id
       where d.deleted_at is null
    )
    select exists (select 1 from sub where sub.id = v_target) into v_ok;
    if not v_ok then
      return;
    end if;
  end if;

  return query
    select v_root, v_sub, d.id, d.title, d.content, d.ydoc_state, d.parent_id
    from public.documents d
    where d.id = v_target and d.deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_shared_tree: filas (id,title,parent_id) del set compartido para el nav
-- público (raíz + descendientes activos si include_subpages, si no solo la raíz).
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_tree(p_token text)
returns table (id uuid, title text, parent_id uuid)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_root uuid;
  v_sub  boolean;
begin
  select s.document_id, s.include_subpages
    into v_root, v_sub
  from public.document_shares s
  where s.token = p_token and s.revoked_at is null;

  if v_root is null then return; end if;
  if not exists (select 1 from public.documents d where d.id = v_root and d.deleted_at is null) then
    return;
  end if;

  return query
    select d.id, d.title, d.parent_id
    from public.documents d
    where d.id = v_root and d.deleted_at is null;

  if v_sub then
    return query
    with recursive sub as (
      select d.id, d.title, d.parent_id
        from public.documents d
       where d.parent_id = v_root and d.deleted_at is null
      union all
      select d.id, d.title, d.parent_id
        from public.documents d
        join sub on d.parent_id = sub.id
       where d.deleted_at is null
    )
    select sub.id, sub.title, sub.parent_id from sub;
  end if;
end;
$$;

revoke all on function public.get_shared_doc(text, uuid) from public, authenticated;
grant execute on function public.get_shared_doc(text, uuid) to anon;
revoke all on function public.get_shared_tree(text) from public, authenticated;
grant execute on function public.get_shared_tree(text) to anon;
