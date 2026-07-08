-- Migration: orden manual de documentos (drag & drop de la sidebar).
--
-- `position` double precision con fractional indexing: mover = 1 UPDATE de UNA
-- fila (midpoint entre vecinos), sin reescritura en cascada ni carreras entre
-- moves concurrentes. Float64 aguanta ~50 bisecciones consecutivas en el mismo
-- gap; cuando el midpoint pierde precisión, resequence_sibling_positions()
-- renormaliza el grupo de hermanos (lazy, rarísimo).

alter table public.documents
  add column if not exists position double precision;

comment on column public.documents.position is
  'Orden manual entre hermanos (fractional indexing, menor = más arriba). Midpoint al insertar entre vecinos; resequence_sibling_positions() renormaliza cuando el gap se agota.';

-- Backfill: preserva el orden visible actual (alfabético por título dentro de
-- cada grupo de hermanos — el criterio que usaba buildDocTree). Gap 1024.
-- Incluye docs en papelera para que un restore vuelva a un lugar estable.
update public.documents d
set position = sub.rn * 1024
from (
  select id,
         row_number() over (
           partition by team_id, parent_id
           order by title asc, id asc
         ) as rn
  from public.documents
) sub
where d.id = sub.id;

alter table public.documents
  alter column position set not null;

-- Default para docs nuevos: al final de sus hermanos. Trigger (no DEFAULT) porque
-- necesita mirar otras filas. Cubre createDocument y la API v1 sin app-code.
-- SECURITY DEFINER: lee hermanos sin RLS (el BEFORE trigger corre antes del
-- check NOT NULL, así que un INSERT sin position es válido).
create or replace function private.set_document_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(d.position), 0) + 1024
      into new.position
      from public.documents d
     where d.team_id = new.team_id
       and d.parent_id is not distinct from new.parent_id;
  end if;
  return new;
end;
$$;

create trigger documents_set_position
  before insert on public.documents
  for each row execute function private.set_document_position();

-- Sirve el max() del trigger y el orden de hermanos.
create index if not exists documents_team_parent_position_idx
  on public.documents (team_id, parent_id, position);

-- Renormalización lazy: reescribe el grupo de hermanos activos a 1024*n cuando el
-- midpoint se queda sin precisión float64. SECURITY INVOKER → la RLS de UPDATE
-- (editor+) sigue gateando: un viewer afecta 0 filas. Nota: bumpea updated_at de
-- los hermanos (trigger genérico) — aceptable, la renormalización es rarísima.
create or replace function public.resequence_sibling_positions(
  p_team_id uuid,
  p_parent_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.documents d
  set position = sub.rn * 1024
  from (
    select id,
           row_number() over (order by position asc, title asc, id asc) as rn
    from public.documents
    where team_id = p_team_id
      and parent_id is not distinct from p_parent_id
      and deleted_at is null
  ) sub
  where d.id = sub.id;
$$;

revoke all on function public.resequence_sibling_positions(uuid, uuid) from public, anon;
grant execute on function public.resequence_sibling_positions(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_shared_tree ahora devuelve position: el nav público usa el mismo
-- buildDocTree que la sidebar → sin esto el orden público divergiría del
-- workspace. Cambia el return type → DROP + CREATE (no alcanza or replace).
-- ---------------------------------------------------------------------------
drop function if exists public.get_shared_tree(text);
create function public.get_shared_tree(p_token text)
returns table (id uuid, title text, parent_id uuid, "position" double precision)
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
    select d.id, d.title, d.parent_id, d.position
    from public.documents d
    where d.id = v_root and d.deleted_at is null;

  if v_sub then
    return query
    with recursive sub as (
      select d.id, d.title, d.parent_id, d.position
        from public.documents d
       where d.parent_id = v_root and d.deleted_at is null
      union all
      select d.id, d.title, d.parent_id, d.position
        from public.documents d
        join sub on d.parent_id = sub.id
       where d.deleted_at is null
    )
    select sub.id, sub.title, sub.parent_id, sub."position" from sub;
  end if;
end;
$$;

revoke all on function public.get_shared_tree(text) from public, authenticated;
grant execute on function public.get_shared_tree(text) to anon;
