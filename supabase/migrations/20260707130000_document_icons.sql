-- Migration: emoji/ícono por documento (estilo Notion).
--
-- `icon` = un emoji unicode elegido desde el título del doc. Nullable (sin
-- ícono por defecto); el check acota el largo (emojis con ZWJ/skin tone llegan
-- a ~11 code points — 16 da margen sin permitir basura). NO entra en
-- search_text (el trigger de FTS solo dispara en title/content — un emoji no
-- es término de búsqueda).

alter table public.documents
  add column if not exists icon text
  check (icon is null or char_length(icon) <= 16);

comment on column public.documents.icon is
  'Emoji del documento (picker del título). Null = sin ícono.';

-- ---------------------------------------------------------------------------
-- Las RPCs públicas de share exponen el ícono junto al título (el share view
-- y su nav lo muestran). Cambia el return type → DROP + CREATE.
-- get_shared_tree conserva la columna position de la migración anterior.
-- ---------------------------------------------------------------------------

drop function if exists public.get_shared_doc(text, uuid);
create function public.get_shared_doc(p_token text, p_doc_id uuid default null)
returns table (
  root_id uuid, include_subpages boolean,
  id uuid, title text, icon text, content text, ydoc_state text, parent_id uuid
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
    select v_root, v_sub, d.id, d.title, d.icon, d.content, d.ydoc_state, d.parent_id
    from public.documents d
    where d.id = v_target and d.deleted_at is null;
end;
$$;

drop function if exists public.get_shared_tree(text);
create function public.get_shared_tree(p_token text)
returns table (id uuid, title text, icon text, parent_id uuid, "position" double precision)
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
    select d.id, d.title, d.icon, d.parent_id, d.position
    from public.documents d
    where d.id = v_root and d.deleted_at is null;

  if v_sub then
    return query
    with recursive sub as (
      select d.id, d.title, d.icon, d.parent_id, d.position
        from public.documents d
       where d.parent_id = v_root and d.deleted_at is null
      union all
      select d.id, d.title, d.icon, d.parent_id, d.position
        from public.documents d
        join sub on d.parent_id = sub.id
       where d.deleted_at is null
    )
    select sub.id, sub.title, sub.icon, sub.parent_id, sub."position" from sub;
  end if;
end;
$$;

revoke all on function public.get_shared_doc(text, uuid) from public, authenticated;
grant execute on function public.get_shared_doc(text, uuid) to anon;
revoke all on function public.get_shared_tree(text) from public, authenticated;
grant execute on function public.get_shared_tree(text) to anon;
