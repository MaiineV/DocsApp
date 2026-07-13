-- Migration: Fase 14 — historial de versiones de documentos (estilo Notion).
--
-- Cada ráfaga de edición del cuerpo (ydoc_state) deja un checkpoint del estado
-- PREVIO en document_versions, capturado por trigger sobre documents con
-- coalescing de 10 minutos (el autosave del editor guarda cada ~2s; sin la
-- ventana habría una fila por guardado). Cubre los TRES paths de guardado
-- (server action, beacon pagehide y PATCH de la API v1) sin tocar app code.
-- El historial es INMUTABLE desde el cliente (sin policies UPDATE/DELETE); el
-- prune (últimas 50 por doc) corre dentro del trigger SECURITY DEFINER. El
-- hard-delete de la papelera limpia por ON DELETE CASCADE; el soft-delete
-- conserva el historial.

-- ---------------------------------------------------------------------------
-- document_versions: snapshots del documento (título + CRDT + cache de bloques).
-- ---------------------------------------------------------------------------
create table if not exists public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  title       text not null default '',
  ydoc_state  text,
  content     text not null default '',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.document_versions is
  'Checkpoints del documento (estado PRE-edición de cada ráfaga, coalescing 10 min, cap 50 por doc). ydoc_state = fuente de verdad; content = cache de bloques para preview.';
comment on column public.document_versions.ydoc_state is
  'Snapshot Yjs (base64) al momento de la captura. NULL solo si el doc aún no tenía estado colaborativo.';

create index if not exists document_versions_doc_created_idx
  on public.document_versions (document_id, created_at desc);

alter table public.document_versions enable row level security;

-- Lectura/creación solo editor+ del team del documento (mismo criterio que
-- document_shares: el historial puede exponer contenido ya borrado del doc).
-- El insert del cliente existe para el checkpoint pre-restore de la action;
-- la captura automática la hace el trigger SECURITY DEFINER (bypassa RLS).
create policy document_versions_select on public.document_versions
  for select to authenticated
  using ( private.has_min_role(private.doc_team_id(document_id), 'editor') );
create policy document_versions_insert on public.document_versions
  for insert to authenticated
  with check (
    private.has_min_role(private.doc_team_id(document_id), 'editor')
    and created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Captura automática: al primer guardado de cada ráfaga se persiste el estado
-- ANTERIOR (OLD) como checkpoint "antes de esta sesión de edición". AFTER (no
-- BEFORE): no puede corromper el write path; UPDATE OF ydoc_state ya excluye
-- persistTitle/persistIcon/move/trash. auth.uid() viene del JWT de PostgREST
-- en los tres paths (cookie session y JWT de PAT); NULL fuera de PostgREST.
-- ---------------------------------------------------------------------------
create or replace function private.capture_document_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Primer seed del ydoc: no hay "antes" que valga como versión.
  if old.ydoc_state is null then
    return null;
  end if;

  -- Coalescing: una versión por ráfaga (ventana de 10 minutos por documento).
  if exists (
    select 1 from public.document_versions v
    where v.document_id = old.id
      and v.created_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  insert into public.document_versions (document_id, title, ydoc_state, content, created_by)
  values (old.id, old.title, old.ydoc_state, old.content, (select auth.uid()));

  -- Prune oportunista (patrón api_rate_limits): quedan las 50 más nuevas.
  delete from public.document_versions v
  where v.document_id = old.id
    and v.id not in (
      select v2.id from public.document_versions v2
      where v2.document_id = old.id
      order by v2.created_at desc
      limit 50
    );

  return null;  -- AFTER trigger: el valor de retorno se ignora
end;
$$;

create trigger documents_capture_version
  after update of ydoc_state on public.documents
  for each row
  when (old.ydoc_state is distinct from new.ydoc_state)
  execute function private.capture_document_version();
