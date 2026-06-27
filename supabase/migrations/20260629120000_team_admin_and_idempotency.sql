-- Migration: gestión de equipo (rename/delete) + idempotency keys
-- (rename/delete reusan RLS existente: teams_update=admin+, teams_delete=owner).
--
-- CP1 acá: fix del trigger del "último owner" para que NO bloquee el cascade al
-- borrar el propio team. Al borrar un team, el FK on delete cascade borra sus
-- memberships; la del owner dispararía prevent_last_owner_removal. Si el team ya
-- no existe (se está borrando), no tiene sentido proteger → permitir.

create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := coalesce(old.team_id, new.team_id);
begin
  -- El team ya se borró (cascade): permitir la baja de su membership owner.
  if not exists (select 1 from public.teams where id = v_team) then
    return coalesce(new, old);
  end if;

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

-- ---------------------------------------------------------------------------
-- CP2: idempotency keys en creación (documents, teams). Una key por submit; el
-- índice único (created_by, key) dedupea un doble-submit en el server. Parcial
-- (where key is not null) → las filas viejas / sin key no se ven afectadas.
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists idempotency_key uuid;
alter table public.teams add column if not exists idempotency_key uuid;

create unique index if not exists documents_idem_idx
  on public.documents (created_by, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists teams_idem_idx
  on public.teams (created_by, idempotency_key)
  where idempotency_key is not null;

-- RPC de bootstrap con dedup por idempotency key. Drop del overload viejo (text)
-- para evitar ambigüedad con el nuevo (text, uuid default).
drop function if exists public.create_team_with_owner(text);

create or replace function public.create_team_with_owner(p_name text, p_key uuid default null)
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

  -- Idempotencia: si ya existe un team de este usuario con esta key, devolverlo
  -- (no crear otro ni otra membership).
  if p_key is not null then
    select * into v_team from public.teams
      where created_by = v_user and idempotency_key = p_key;
    if found then
      return v_team;
    end if;
  end if;

  insert into public.teams (name, created_by, idempotency_key)
  values (trim(p_name), v_user, p_key)
  on conflict (created_by, idempotency_key) where idempotency_key is not null do nothing
  returning * into v_team;

  -- Carrera: otro request con la misma key ganó el insert → devolver el suyo.
  if v_team.id is null then
    select * into v_team from public.teams
      where created_by = v_user and idempotency_key = p_key;
    return v_team;
  end if;

  insert into public.memberships (team_id, user_id, role)
  values (v_team.id, v_user, 'owner');

  return v_team;
end;
$$;

revoke all on function public.create_team_with_owner(text, uuid) from public, anon;
grant execute on function public.create_team_with_owner(text, uuid) to authenticated;
