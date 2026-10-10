-- Buckets: a public bucket served via CDN public URLs, and a private bucket accessed via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-assets', 'public-assets', true, 10485760,
   array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']),
  ('private-files', 'private-files', false, 52428800, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS: authenticated users may only touch objects under their own top-level folder: <bucket>/<auth.uid()>/...
-- Anonymous users have no API access; public-assets objects are still readable through the public CDN URL.
create policy "owner can list/read own objects"
on storage.objects for select to authenticated
using (
  bucket_id in ('public-assets', 'private-files')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owner can upload into own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('public-assets', 'private-files')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owner can update own objects"
on storage.objects for update to authenticated
using (
  bucket_id in ('public-assets', 'private-files')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('public-assets', 'private-files')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owner can delete own objects"
on storage.objects for delete to authenticated
using (
  bucket_id in ('public-assets', 'private-files')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
