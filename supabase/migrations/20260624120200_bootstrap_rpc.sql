-- Migration: bootstrap RPC
-- Crea el primer team + membership owner de forma atómica, resolviendo el
-- huevo-y-gallina (memberships_insert exige ser admin, pero el usuario aún no
-- tiene membership). SECURITY DEFINER -> saltea RLS adentro, sin service_role.
-- Es segura: valida auth.uid() explícitamente, el owner siempre es el llamante,
-- es atómica (rollback si falla), y execute solo para authenticated.

create or replace function public.create_team_with_owner(p_name text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_team public.teams;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'El nombre del team es obligatorio' using errcode = '22023';
  end if;

  insert into public.teams (name, created_by)
  values (trim(p_name), v_user)
  returning * into v_team;

  insert into public.memberships (team_id, user_id, role)
  values (v_team.id, v_user, 'owner');

  return v_team;
end;
$$;

revoke all on function public.create_team_with_owner(text) from public, anon;
grant execute on function public.create_team_with_owner(text) to authenticated;
