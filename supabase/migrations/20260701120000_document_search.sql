-- Búsqueda full-text de documentos (título + contenido del JSON de bloques).

-- Proyección de texto plano para indexar.
alter table public.documents add column if not exists search_text text;

-- Extrae el texto del content (JSON de bloques BlockNote). Si content no es JSON
-- válido (docs legacy de Fase 0), usa el texto tal cual. Immutable → trigger+backfill.
create or replace function private.doc_search_text(p_title text, p_content text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  extracted text;
begin
  begin
    select string_agg(t.value #>> '{}', ' ')
      into extracted
      from jsonb_path_query(p_content::jsonb, '$.**.text') as t(value);
  exception when others then
    extracted := p_content; -- content no es JSON → usarlo crudo
  end;
  return btrim(coalesce(p_title, '') || ' ' || coalesce(extracted, ''));
end;
$$;

-- Mantener search_text fresco en cada escritura de title/content.
create or replace function private.documents_set_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := private.doc_search_text(new.title, new.content);
  return new;
end;
$$;

drop trigger if exists documents_set_search_text on public.documents;
create trigger documents_set_search_text
  before insert or update of title, content on public.documents
  for each row execute function private.documents_set_search_text();

-- Índice FTS por expresión ('simple' = sin stemming, seguro para es/en mezclados).
create index if not exists documents_search_idx
  on public.documents
  using gin (to_tsvector('simple', search_text));

-- Backfill de los existentes SIN bumpear updated_at (se desactiva su trigger).
alter table public.documents disable trigger documents_set_updated_at;
update public.documents set search_text = private.doc_search_text(title, content);
alter table public.documents enable trigger documents_set_updated_at;
