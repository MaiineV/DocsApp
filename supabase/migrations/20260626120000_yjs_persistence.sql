-- Migration: Fase 2 — persistencia Yjs + Realtime Authorization
-- Agrega el snapshot CRDT a documents y autoriza el canal Realtime `doc:<id>`
-- (Broadcast/Presence) con RLS sobre realtime.messages, reusando los helpers
-- SECURITY DEFINER de Fase 0 (mismo patrón anti-recursión).

-- ---------------------------------------------------------------------------
-- documents: snapshot del Y.Doc (base64) + versión para optimistic concurrency.
-- content pasa a ser cache denormalizada; la fuente de verdad es ydoc_state.
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists ydoc_state   text,
  add column if not exists ydoc_version integer not null default 0;

comment on column public.documents.ydoc_state is
  'Fase 2: snapshot del Y.Doc (CRDT) en base64. Fuente de verdad del contenido colaborativo. NULL = doc legacy aún no migrado (se siembra desde content al primer open).';
comment on column public.documents.ydoc_version is
  'Fase 2: versión para optimistic concurrency (CAS) al persistir el snapshot Yjs.';
comment on column public.documents.content is
  'Cache denormalizada (JSON de bloques BlockNote) derivada del Y.Doc para SSR/listado/search. Fuente de verdad: ydoc_state. Legacy: texto plano (Fase 0) / JSON (Fase 1) hasta el primer open colaborativo.';

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER para autorizar el canal por documento.
--   topic_doc_id: parsea `doc:<uuid>` de forma null-safe (topic malformado -> null,
--                 nunca rompe la evaluación de la policy).
--   doc_team_id:  mapea documento -> team sin filtrar cross-tenant.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Realtime Authorization: RLS sobre realtime.messages para topics `doc:<id>`.
-- (realtime.messages ya tiene RLS habilitada por defecto en Supabase.)
--   - receive (SELECT):           cualquier miembro del team del doc.
--   - send broadcast (INSERT):    editor+ -> un viewer no puede inyectar updates.
--   - send presence (INSERT):     cualquier miembro -> los viewers figuran "online".
-- Múltiples policies INSERT se combinan con OR (permissive): un broadcast de viewer
-- no matchea ninguna y queda denegado.
-- ---------------------------------------------------------------------------
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
