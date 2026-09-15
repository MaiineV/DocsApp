-- Migration: calendario por equipo + integración opcional con Google Calendar.
--
-- team_events: eventos y deadlines de un team. RLS: miembros leen, editor+ escribe.
-- google_connections: 1 fila por usuario que conectó su Google (tokens CIFRADOS
--   por el server con AES-256-GCM; la DB nunca ve un token en claro). Own-only.
-- team_calendar_links: 1 por team. El calendario de Google del team vive en la
--   cuenta de un OWNER (el "host"); DocsApp lo crea como calendario secundario.
-- team_calendar_shares: miembros que pidieron ver ese calendario en su Google
--   (se comparte vía ACL de Google con el token del host).
--
-- El sync (pull/push) lo dispara cualquier miembro al abrir el calendario pero
-- usa las credenciales del host -> RPCs SECURITY DEFINER gated por membership.
-- Devuelven solo ciphertext: sin la clave del server no sirven.

-- ---------------------------------------------------------------------------
-- teams.color: color del equipo (hex). Null = paleta por defecto en la UI.
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- ---------------------------------------------------------------------------
-- team_events
-- all_day: starts_at = medianoche UTC del día, ends_at = medianoche UTC del día
-- siguiente (fin EXCLUSIVO, misma semántica que `date` en Google Calendar).
-- ---------------------------------------------------------------------------
create table if not exists public.team_events (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams (id) on delete cascade,
  title             text not null check (char_length(trim(title)) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 4000),
  kind              text not null default 'event' check (kind in ('event', 'deadline')),
  all_day           boolean not null default false,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  created_by        uuid references auth.users (id) on delete set null,
  google_event_id   text,
  google_updated_at timestamptz,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at >= starts_at)
);
comment on table public.team_events is 'Eventos y deadlines del calendario de un team.';
comment on column public.team_events.google_event_id is 'Id del evento en el calendario Google del team (null = todavía no pusheado).';
comment on column public.team_events.google_updated_at is '`updated` de Google tras el último push/pull: loop guard del sync.';
comment on column public.team_events.synced_at is 'Reloj local del último push/pull. updated_at > synced_at = cambio pendiente de subir a Google.';

create index if not exists team_events_team_starts_idx on public.team_events (team_id, starts_at);
create unique index if not exists team_events_google_idx
  on public.team_events (team_id, google_event_id) where google_event_id is not null;

create trigger team_events_set_updated_at
  before update on public.team_events
  for each row execute function private.set_updated_at();

alter table public.team_events enable row level security;

create policy team_events_select on public.team_events
  for select to authenticated
  using ( private.is_team_member(team_id) );
create policy team_events_insert on public.team_events
  for insert to authenticated
  with check ( private.has_min_role(team_id, 'editor') and created_by = (select auth.uid()) );
create policy team_events_update on public.team_events
  for update to authenticated
  using ( private.has_min_role(team_id, 'editor') )
  with check ( private.has_min_role(team_id, 'editor') );
create policy team_events_delete on public.team_events
  for delete to authenticated
  using ( private.has_min_role(team_id, 'editor') );

-- ---------------------------------------------------------------------------
-- google_connections
-- ---------------------------------------------------------------------------
create table if not exists public.google_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  google_email      text not null,
  refresh_token_enc text not null,
  access_token_enc  text,
  access_expires_at timestamptz,
  scope             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.google_connections is 'Conexión Google Calendar por usuario. Tokens cifrados por el server (AES-256-GCM).';

create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function private.set_updated_at();

alter table public.google_connections enable row level security;

create policy google_connections_select_own on public.google_connections
  for select to authenticated using ( user_id = (select auth.uid()) );
create policy google_connections_insert_own on public.google_connections
  for insert to authenticated with check ( user_id = (select auth.uid()) );
create policy google_connections_update_own on public.google_connections
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );
create policy google_connections_delete_own on public.google_connections
  for delete to authenticated using ( user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- team_calendar_links: el calendario Google del team, hospedado por un owner.
-- host_user_id -> google_connections: desconectar Google des-hospeda en cascada.
-- ---------------------------------------------------------------------------
create table if not exists public.team_calendar_links (
  team_id            uuid primary key references public.teams (id) on delete cascade,
  host_user_id       uuid not null references public.google_connections (user_id) on delete cascade,
  google_calendar_id text not null,
  sync_token         text,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now()
);
comment on table public.team_calendar_links is 'Calendario secundario de Google del team, en la cuenta del owner que lo hospeda.';

alter table public.team_calendar_links enable row level security;

create policy team_calendar_links_select on public.team_calendar_links
  for select to authenticated
  using ( private.is_team_member(team_id) );
create policy team_calendar_links_insert on public.team_calendar_links
  for insert to authenticated
  with check (
    private.get_user_role(team_id) = 'owner'
    and host_user_id = (select auth.uid())
  );
create policy team_calendar_links_delete on public.team_calendar_links
  for delete to authenticated
  using ( host_user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- team_calendar_shares: "ver el calendario del team en MI Google".
-- ---------------------------------------------------------------------------
create table if not exists public.team_calendar_shares (
  team_id       uuid not null references public.team_calendar_links (team_id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  google_acl_id text not null,
  created_at    timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.team_calendar_shares enable row level security;

create policy team_calendar_shares_select_own on public.team_calendar_shares
  for select to authenticated using ( user_id = (select auth.uid()) );
create policy team_calendar_shares_insert_own on public.team_calendar_shares
  for insert to authenticated
  with check ( user_id = (select auth.uid()) and private.is_team_member(team_id) );
create policy team_calendar_shares_delete_own on public.team_calendar_shares
  for delete to authenticated using ( user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- get_team_calendar_credentials: credenciales (cifradas) del host del team.
-- Solo miembros. Vacío si el team no está hospedado.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_calendar_credentials(p_team_id uuid)
returns table (
  host_user_id       uuid,
  host_email         text,
  google_calendar_id text,
  sync_token         text,
  last_synced_at     timestamptz,
  refresh_token_enc  text,
  access_token_enc   text,
  access_expires_at  timestamptz
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
    select l.host_user_id, c.google_email, l.google_calendar_id, l.sync_token, l.last_synced_at,
           c.refresh_token_enc, c.access_token_enc, c.access_expires_at
    from public.team_calendar_links l
    join public.google_connections c on c.user_id = l.host_user_id
    where l.team_id = p_team_id;
end;
$$;

revoke all on function public.get_team_calendar_credentials(uuid) from public, anon;
grant execute on function public.get_team_calendar_credentials(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- store_google_access_token: cachea el access token refrescado del host de un
-- team (lo refresca quien dispara el sync, que puede no ser el host).
-- ---------------------------------------------------------------------------
create or replace function public.store_google_access_token(
  p_team_id uuid,
  p_access_enc text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_team_member(p_team_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.google_connections c
    set access_token_enc = p_access_enc, access_expires_at = p_expires_at
  from public.team_calendar_links l
  where l.team_id = p_team_id and c.user_id = l.host_user_id;
end;
$$;

revoke all on function public.store_google_access_token(uuid, text, timestamptz) from public, anon;
grant execute on function public.store_google_access_token(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_event_synced: registra el id/updated de Google tras un push. Miembro-
-- gated (el push pendiente lo puede correr un viewer al abrir el calendario).
-- ---------------------------------------------------------------------------
create or replace function public.mark_event_synced(
  p_event_id uuid,
  p_google_event_id text,
  p_google_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.team_events where id = p_event_id;
  if v_team is null or not private.is_team_member(v_team) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.team_events
    set google_event_id = p_google_event_id,
        google_updated_at = p_google_updated_at,
        synced_at = now()
    where id = p_event_id;
end;
$$;

revoke all on function public.mark_event_synced(uuid, text, timestamptz) from public, anon;
grant execute on function public.mark_event_synced(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_google_sync: aplica un pull incremental de Google al team.
-- p_upserts: [{google_event_id, title, description, kind, all_day, starts_at,
--   ends_at, google_updated_at}]. Solo pisa una fila si el `updated` de Google
--   es más nuevo que el guardado (loop guard contra nuestros propios pushes).
-- p_deleted_google_ids: eventos cancelados en Google -> se borran acá.
-- p_sync_token: nuevo syncToken (null = no cambiar).
-- ---------------------------------------------------------------------------
create or replace function public.apply_google_sync(
  p_team_id uuid,
  p_upserts jsonb,
  p_deleted_google_ids text[],
  p_sync_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  r      jsonb;
begin
  if not private.is_team_member(p_team_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select host_user_id into v_host from public.team_calendar_links where team_id = p_team_id;
  if v_host is null then
    raise exception 'El team no tiene calendario de Google' using errcode = 'P0002';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    insert into public.team_events as e
      (team_id, title, description, kind, all_day, starts_at, ends_at, created_by,
       google_event_id, google_updated_at, synced_at)
    values
      (p_team_id,
       left(coalesce(nullif(trim(r->>'title'), ''), '(sin título)'), 200),
       left(coalesce(r->>'description', ''), 4000),
       case when r->>'kind' = 'deadline' then 'deadline' else 'event' end,
       coalesce((r->>'all_day')::boolean, false),
       (r->>'starts_at')::timestamptz,
       (r->>'ends_at')::timestamptz,
       v_host,
       r->>'google_event_id',
       (r->>'google_updated_at')::timestamptz,
       now())
    on conflict (team_id, google_event_id) where google_event_id is not null
    do update set
      title             = excluded.title,
      description       = excluded.description,
      kind              = excluded.kind,
      all_day           = excluded.all_day,
      starts_at         = excluded.starts_at,
      ends_at           = excluded.ends_at,
      google_updated_at = excluded.google_updated_at,
      synced_at         = now()
    where e.google_updated_at is null or excluded.google_updated_at > e.google_updated_at;
  end loop;

  if p_deleted_google_ids is not null and array_length(p_deleted_google_ids, 1) > 0 then
    delete from public.team_events
      where team_id = p_team_id and google_event_id = any (p_deleted_google_ids);
  end if;

  update public.team_calendar_links
    set sync_token = coalesce(p_sync_token, sync_token), last_synced_at = now()
    where team_id = p_team_id;
end;
$$;

revoke all on function public.apply_google_sync(uuid, jsonb, text[], text) from public, anon;
grant execute on function public.apply_google_sync(uuid, jsonb, text[], text) to authenticated;
