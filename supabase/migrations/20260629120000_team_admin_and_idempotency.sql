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
