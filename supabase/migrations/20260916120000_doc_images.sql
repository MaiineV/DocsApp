-- Document images. Objects live at <team_id>/<doc_id>/<uuid>.<ext>. Only the
-- service role writes (signed upload URLs minted after an editor+ check), so
-- there are no storage.objects policies for authenticated/anon. Public reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'doc-images',
    'doc-images',
    true,
    10485760, -- 10 MiB
    array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Bytes used per bucket, for the daily storage-alert cron (service role only).
create or replace function public.storage_bytes_used()
returns table (bucket_id text, bytes bigint)
language sql
security definer
set search_path = ''
as $$
  select o.bucket_id, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes
    from storage.objects o
    group by o.bucket_id
    order by o.bucket_id;
$$;

revoke all on function public.storage_bytes_used() from public, anon, authenticated;
grant execute on function public.storage_bytes_used() to service_role;
