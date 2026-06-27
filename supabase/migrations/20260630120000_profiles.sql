-- Migration: perfiles de usuario (nickname + avatar) + Storage de avatares.
-- profiles: 1:1 con auth.users. RLS own-only (los miembros del equipo se leen vía
-- el RPC list_team_members que es SECURITY DEFINER; la presencia la broadcastea
-- cada cliente con su propio nick → no hace falta leer perfiles ajenos por RLS).

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text check (char_length(nickname) <= 50),
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ( id = (select auth.uid()) );
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ( id = (select auth.uid()) );
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Auto-provisión: crear el profile al alta del usuario (patrón Supabase).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Función de trigger: no se llama por RPC. Revocar EXECUTE la saca de la API
-- (PostgREST) sin romper el trigger (los triggers no chequean EXECUTE).
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Backfill de usuarios ya existentes.
insert into public.profiles (id)
  select id from auth.users on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: bucket público `avatars`; escritura solo en la carpeta propia <uid>/.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy avatars_update_own on storage.objects
  for update to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text )
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text );
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text );

-- ---------------------------------------------------------------------------
-- list_team_members: ahora devuelve también nickname + avatar_url (left join
-- profiles). Drop+create porque cambia el return type.
-- ---------------------------------------------------------------------------
drop function if exists public.list_team_members(uuid);

create or replace function public.list_team_members(p_team_id uuid)
returns table (
  user_id    uuid,
  email      text,
  role       private.team_role,
  nickname   text,
  avatar_url text
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
    select m.user_id, u.email::text, m.role, p.nickname, p.avatar_url
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id
    order by private.role_rank(m.role) desc, u.email;
end;
$$;

revoke all on function public.list_team_members(uuid) from public, anon;
grant execute on function public.list_team_members(uuid) to authenticated;
