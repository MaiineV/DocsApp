-- Migration: Personal Access Tokens (PAT) + rate-limiting de la API.
--
-- PAT: claves estables/revocables para `/api/v1`, independientes del método de
-- login (sirven para cuentas de Google sin password). Guardamos SOLO el hash
-- SHA-256 del token; el valor crudo (`dapp_…`) se muestra UNA vez al crear.
-- La RESOLUCIÓN del token (por hash, sin sesión) va por la RPC SECURITY DEFINER
-- `consume_api_token`; la administración (crear/listar/revocar desde la web) usa
-- las policies RLS own-only de abajo.
--
-- Rate-limiting: contador fixed-window en `private.api_rate_limits`, incrementado
-- atómicamente por la RPC `hit_rate_limit` (SECURITY DEFINER). Se aplica a toda la
-- API, keyed por usuario (auth.uid() del JWT real o del JWT minteado del PAT).

-- ---------------------------------------------------------------------------
-- api_tokens: 1 fila por token. RLS own-only (espeja `profiles`).
-- ---------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 100),
  token_hash   text not null unique,          -- sha256(hex) del token crudo
  token_prefix text not null,                 -- primeros chars (dapp_xxxx…) para mostrar
  scope        text not null default 'read_write' check (scope in ('read', 'read_write')),
  expires_at   timestamptz,                   -- null = sin vencimiento
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
comment on table public.api_tokens is 'Personal Access Tokens de la API. Solo se guarda el hash del token.';

create index if not exists api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;

create policy api_tokens_select_own on public.api_tokens
  for select to authenticated using ( user_id = (select auth.uid()) );
create policy api_tokens_insert_own on public.api_tokens
  for insert to authenticated with check ( user_id = (select auth.uid()) );
create policy api_tokens_update_own on public.api_tokens
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );
create policy api_tokens_delete_own on public.api_tokens
  for delete to authenticated using ( user_id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- consume_api_token: resuelve un token por su hash SIN contexto de usuario
-- (el request PAT no trae JWT). SECURITY DEFINER para leer/escribir api_tokens
-- saltando RLS. Devuelve la fila solo si no está vencido; throttlea last_used_at
-- (≤1×/min) para no escribir en cada request. Grant SOLO a anon: la resolución es
-- pre-auth (se llama con la anon key) y el token (256 bits) no es enumerable;
-- nunca expone la tabla, solo (token_id, user_id, scope). (El WARN del linter por
-- "SECURITY DEFINER ejecutable por anon" es intencional, igual que en las RPCs de
-- invitaciones/bootstrap.)
-- ---------------------------------------------------------------------------
create or replace function public.consume_api_token(p_hash text)
returns table (token_id uuid, user_id uuid, scope text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_user  uuid;
  v_scope text;
begin
  select t.id, t.user_id, t.scope
    into v_id, v_user, v_scope
  from public.api_tokens t
  where t.token_hash = p_hash
    and (t.expires_at is null or t.expires_at > now());

  if v_id is null then
    return;  -- inválido/vencido → 0 filas
  end if;

  update public.api_tokens
    set last_used_at = now()
    where id = v_id
      and (last_used_at is null or last_used_at < now() - interval '1 minute');

  return query select v_id, v_user, v_scope;
end;
$$;

revoke all on function public.consume_api_token(text) from public, authenticated;
grant execute on function public.consume_api_token(text) to anon;

-- ---------------------------------------------------------------------------
-- Rate limiting: contador fixed-window. La tabla vive en `private` (no expuesta
-- por PostgREST); la RPC en `public` la escribe vía SECURITY DEFINER.
--
-- El bucket se deriva de `auth.uid()` DENTRO de la función (no es parámetro), así
-- un caller solo puede incrementar SU propio contador: cierra el vector de que un
-- usuario infle el bucket de otro. La API siempre la llama como `authenticated`
-- (JWT Bearer real, o el JWT minteado del PAT) → grant solo a authenticated.
-- Rate-limit por USUARIO (todas sus PATs + su JWT comparten presupuesto).
-- ---------------------------------------------------------------------------
create table if not exists private.api_rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.hit_rate_limit(p_limit int, p_window_seconds int)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := coalesce((select auth.uid())::text, 'anon');
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count int;
begin
  insert into private.api_rate_limits (bucket, window_start, count)
    values (v_bucket, v_window, 1)
    on conflict (bucket, window_start)
    do update set count = private.api_rate_limits.count + 1
    returning count into v_count;

  -- limpieza oportunista de ventanas viejas (mantiene la tabla chica)
  delete from private.api_rate_limits where window_start < now() - interval '1 hour';

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.hit_rate_limit(int, int) from public, anon;
grant execute on function public.hit_rate_limit(int, int) to authenticated;
