-- Migration: Fase 4 — jerarquía de documentos (parent/child)
-- parent_id self-FK (orphan-to-root on delete) + índice + trigger de integridad
-- (mismo team, sin auto-padre, sin ciclos). Mismo patrón private/SECURITY DEFINER.

alter table public.documents
  add column if not exists parent_id uuid references public.documents (id) on delete set null;

create index if not exists documents_parent_id_idx on public.documents (parent_id);

comment on column public.documents.parent_id is
  'Padre en la jerarquía (mismo team). NULL = documento raíz. ON DELETE SET NULL: los hijos suben a raíz, nunca se borran en cascada.';

-- Integridad de la jerarquía: el padre existe, es del MISMO team, no auto-padre,
-- y no se forma un ciclo (un doc no puede ser su propio ancestro). SECURITY
-- DEFINER + search_path='' (mismo patrón anti-recursión que el resto).
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
