-- Retention: cap document history (10 versions, 30 days) and auto-empty the
-- trash after 30 days. Versions keep only the Yjs snapshot; `content` is a
-- fallback for legacy rows without ydoc_state.

-- ---------------------------------------------------------------------------
-- Version pruning. The newest version of each document always survives the
-- age cutoff, so a document that was edited long ago keeps one restore point.
-- ---------------------------------------------------------------------------
create or replace function private.prune_document_versions(
  p_doc  uuid,
  p_cap  integer,
  p_days integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.document_versions v
  where v.id in (
    select r.id from (
      select v2.id,
             v2.created_at,
             row_number() over (
               partition by v2.document_id order by v2.created_at desc, v2.id desc
             ) as rn
        from public.document_versions v2
       where p_doc is null or v2.document_id = p_doc
    ) r
    where r.rn > greatest(p_cap, 1)
       or (r.rn > 1 and r.created_at < now() - make_interval(days => greatest(p_days, 1)))
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.prune_document_versions(uuid, integer, integer) from public, anon, authenticated;

create or replace function private.capture_document_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ydoc_state is null then
    return null;
  end if;

  -- One version per editing burst (10-minute window per document).
  if exists (
    select 1 from public.document_versions v
    where v.document_id = old.id
      and v.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  insert into public.document_versions (document_id, title, ydoc_state, content, created_by)
  values (old.id, old.title, old.ydoc_state, old.content, (select auth.uid()));

  perform private.prune_document_versions(old.id, 10, 30);

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Versions with a Yjs snapshot never store the block cache.
-- ---------------------------------------------------------------------------
create or replace function private.strip_version_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ydoc_state is not null then
    new.content := '';
  end if;
  return new;
end;
$$;

drop trigger if exists document_versions_strip_content on public.document_versions;
create trigger document_versions_strip_content
  before insert or update of content, ydoc_state on public.document_versions
  for each row
  execute function private.strip_version_content();

-- ---------------------------------------------------------------------------
-- One-off cleanup of existing rows.
-- ---------------------------------------------------------------------------
update public.document_versions
   set content = ''
 where ydoc_state is not null
   and content <> '';

select private.prune_document_versions(null, 10, 30);

-- ---------------------------------------------------------------------------
-- Daily retention job (service role only, called by /api/cron/retention).
-- Hard-deletes documents trashed more than p_trash_days ago; versions and
-- shares go with them through ON DELETE CASCADE. Returns the purged ids with
-- their team so the caller can remove the Storage images.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_content(
  p_trash_days   integer default 30,
  p_version_days integer default 30,
  p_version_cap  integer default 10,
  p_limit        integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged   jsonb;
  v_versions integer;
begin
  with doomed as (
    delete from public.documents d
     where d.id in (
       select x.id from public.documents x
        where x.deleted_at is not null
          and x.deleted_at < now() - make_interval(days => greatest(p_trash_days, 1))
        order by x.deleted_at
        limit greatest(p_limit, 1)
     )
    returning d.id, d.team_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'team_id', team_id)), '[]'::jsonb)
    into v_purged
    from doomed;

  v_versions := private.prune_document_versions(null, p_version_cap, p_version_days);

  return jsonb_build_object('purged', v_purged, 'versions_deleted', v_versions);
end;
$$;

revoke all on function public.purge_expired_content(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_content(integer, integer, integer, integer) to service_role;
