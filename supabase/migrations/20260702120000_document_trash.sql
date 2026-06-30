-- Papelera (soft-delete) de documentos. `deleted_at` null = activo.
alter table public.documents add column if not exists deleted_at timestamptz;

-- Índice parcial para los listados de documentos ACTIVOS (lo más consultado).
create index if not exists documents_active_idx
  on public.documents (team_id, updated_at desc)
  where deleted_at is null;
