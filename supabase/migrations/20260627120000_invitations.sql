-- Migration: Fase 3 — invitaciones por link con token
-- Tabla de invitaciones (admin-only via RLS) + RPCs SECURITY DEFINER para los
-- caminos del invitado (preview/accept) y el listado de miembros con email.
-- Reusa los helpers de Fase 0 (has_min_role / is_team_member / role_rank).

-- ---------------------------------------------------------------------------
-- invitations: una invitación pendiente por (team, email). El token (256 bits,
-- generado en el server) es la capability del link; con confirm-email el binding
-- al email es el control real. Se consume (borra) al aceptar; revocar = borrar.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role        private.team_role not null default 'viewer' check (role <> 'owner'),
  token       text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  check (expires_at > created_at),
  unique (team_id, email)
);
create index invitations_team_id_idx    on public.invitations (team_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
comment on table public.invitations is
  'Invitaciones por link con token (Fase 3). token = capability; email + confirm-email = binding real. Una pendiente por (team,email); se borra al aceptar/revocar.';

alter table public.invitations enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: todo admin-only. El invitado NO es miembro todavía → no ve nada por RLS;
-- sus caminos (preview/accept) van por las RPCs SECURITY DEFINER de abajo.
-- ---------------------------------------------------------------------------
create policy invitations_select on public.invitations
  for select to authenticated
  using ( private.has_min_role(team_id, 'admin') );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    private.has_min_role(team_id, 'admin')
    and role <> 'owner'
    and invited_by = (select auth.uid())
  );

create policy invitations_update on public.invitations   -- habilita el upsert de re-invite
  for update to authenticated
  using ( private.has_min_role(team_id, 'admin') )
  with check (
    private.has_min_role(team_id, 'admin')
    and role <> 'owner'
    and invited_by = (select auth.uid())
  );

create policy invitations_delete on public.invitations   -- revoke
  for delete to authenticated
  using ( private.has_min_role(team_id, 'admin') );

-- ---------------------------------------------------------------------------
-- RPCs SECURITY DEFINER. auth.uid() adentro = el LLAMANTE (lee el JWT), por eso
-- los gates de membership/email son contra el usuario que invoca.
-- ---------------------------------------------------------------------------

-- Preview para la página /invite: SOLO por token (token inválido → vacío,
-- indistinguible → sin enumeración). Devuelve campos mínimos, sin token ni email
-- crudo (email enmascarado para UX).
create or replace function public.invitation_preview(p_token text)
returns table (
  team_name    text,
  role         private.team_role,
  expired      boolean,
  email_match  boolean,
  masked_email text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where token = p_token;
  if not found then
    return;  -- token inválido: vacío, indistinguible
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  return query select
    (select t.name from public.teams t where t.id = v_inv.team_id),
    v_inv.role,
    v_inv.expires_at <= now(),
    v_inv.email = v_email,
    regexp_replace(v_inv.email, '^(.).*(@.*)$', '\1***\2');
end;
$$;

-- Acepta la invitación: valida token + email del llamante, inserta membership
-- (idempotente, NO degrada a un miembro existente) y consume la invitación.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  select * into v_inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'Invitación inválida o ya utilizada' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then
    delete from public.invitations where id = v_inv.id;
    raise exception 'La invitación expiró' using errcode = 'P0003';
  end if;
  if v_inv.email <> v_email then
    -- NO borrar: dejar reintentar con la cuenta correcta.
    raise exception 'Esta invitación es para otra dirección de email' using errcode = 'P0004';
  end if;
  if v_inv.role = 'owner' then
    raise exception 'Rol inválido' using errcode = '22023';  -- defensa: el CHECK ya lo impide
  end if;

  insert into public.memberships (team_id, user_id, role)
  values (v_inv.team_id, v_user, v_inv.role)
  on conflict (team_id, user_id) do nothing;  -- ya miembro → no cambia su rol

  delete from public.invitations where id = v_inv.id;  -- un solo uso
  return v_inv.team_id;
end;
$$;

-- Lista miembros con email para la página de gestión. Gate: solo miembros del
-- team. Es el único lugar que expone emails de compañeros (aceptable).
create or replace function public.list_team_members(p_team_id uuid)
returns table (
  user_id uuid,
  email   text,
  role    private.team_role
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
    select m.user_id, u.email::text, m.role
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team_id
    order by private.role_rank(m.role) desc, u.email;
end;
$$;

revoke all on function public.invitation_preview(text) from public, anon;
revoke all on function public.accept_invitation(text)  from public, anon;
revoke all on function public.list_team_members(uuid)  from public, anon;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text)  to authenticated;
grant execute on function public.list_team_members(uuid)  to authenticated;
