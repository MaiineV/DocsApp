-- Migration: RLS y autorización
-- Funciones helper SECURITY DEFINER (clave anti-recursión), RLS y policies
-- para teams/memberships/documents, + salvaguarda del último owner.
--
-- ANTI-RECURSIÓN: una policy sobre `memberships` que hiciera un subquery a
-- `memberships` re-dispararía la policy -> "infinite recursion". Lo evitamos
-- llamando a funciones SECURITY DEFINER: corren como su owner (la tabla NO
-- está en FORCE RLS), por lo que el subquery interno saltea RLS y no recursa.
-- Por eso usamos ENABLE (no FORCE) ROW LEVEL SECURITY.

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER. search_path = '' + nombres calificados = seguro.
-- ---------------------------------------------------------------------------
create or replace function private.role_rank(p_role private.team_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner'  then 40
    when 'admin'  then 30
    when 'editor' then 20
    when 'viewer' then 10
  end;
$$;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.team_id = p_team_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.get_user_role(p_team_id uuid)
returns private.team_role
language sql
security definer
stable
set search_path = ''
as $$
  select m.role from public.memberships m
  where m.team_id = p_team_id
    and m.user_id = (select auth.uid());
$$;

create or replace function private.has_min_role(p_team_id uuid, p_min private.team_role)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    private.role_rank(private.get_user_role(p_team_id)) >= private.role_rank(p_min),
    false
  );
$$;

-- Grants: solo authenticated puede ejecutar; anon/public no.
revoke all on function private.role_rank(private.team_role)          from public, anon;
revoke all on function private.is_team_member(uuid)                  from public, anon;
revoke all on function private.get_user_role(uuid)                   from public, anon;
revoke all on function private.has_min_role(uuid, private.team_role) from public, anon;

grant execute on function private.role_rank(private.team_role)          to authenticated;
grant execute on function private.is_team_member(uuid)                  to authenticated;
grant execute on function private.get_user_role(uuid)                   to authenticated;
grant execute on function private.has_min_role(uuid, private.team_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Habilitar RLS (sin FORCE, ver nota de cabecera).
-- ---------------------------------------------------------------------------
alter table public.teams       enable row level security;
alter table public.memberships enable row level security;
alter table public.documents   enable row level security;

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create policy teams_select on public.teams
  for select to authenticated
  using ( private.is_team_member(id) );

-- El membership owner lo crea la RPC de bootstrap; el insert directo solo
-- te deja crear teams a tu nombre.
create policy teams_insert on public.teams
  for insert to authenticated
  with check ( created_by = (select auth.uid()) );

create policy teams_update on public.teams
  for update to authenticated
  using ( private.has_min_role(id, 'admin') )
  with check ( private.has_min_role(id, 'admin') );

create policy teams_delete on public.teams
  for delete to authenticated
  using ( private.get_user_role(id) = 'owner' );

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select to authenticated
  using ( private.is_team_member(team_id) );

-- owner/admin invitan; solo un owner puede crear otro owner.
-- (El bootstrap NO pasa por acá: va por la RPC SECURITY DEFINER.)
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    private.has_min_role(team_id, 'admin')
    and (role <> 'owner' or private.get_user_role(team_id) = 'owner')
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using ( private.has_min_role(team_id, 'admin') )
  with check (
    private.has_min_role(team_id, 'admin')
    and (role <> 'owner' or private.get_user_role(team_id) = 'owner')
  );

-- owner/admin remueven a otros; cualquiera puede removerse a sí mismo
-- (el trigger de abajo protege contra dejar el team sin owner).
create policy memberships_delete on public.memberships
  for delete to authenticated
  using ( private.has_min_role(team_id, 'admin') or user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated
  using ( private.is_team_member(team_id) );          -- cualquier rol, incl. viewer

create policy documents_insert on public.documents
  for insert to authenticated
  with check ( private.has_min_role(team_id, 'editor') and created_by = (select auth.uid()) );

create policy documents_update on public.documents
  for update to authenticated
  using ( private.has_min_role(team_id, 'editor') )
  with check ( private.has_min_role(team_id, 'editor') );

create policy documents_delete on public.documents
  for delete to authenticated
  using ( private.has_min_role(team_id, 'editor') );

-- ---------------------------------------------------------------------------
-- Salvaguarda: no dejar un team sin owner (RLS no ve agregados -> trigger).
-- ---------------------------------------------------------------------------
create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := coalesce(old.team_id, new.team_id);
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from public.memberships
        where team_id = v_team and role = 'owner' and id <> old.id) = 0 then
      raise exception 'No se puede dejar el team sin owner';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function private.prevent_last_owner_removal();
