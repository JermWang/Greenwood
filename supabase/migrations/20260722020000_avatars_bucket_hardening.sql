-- Constrain the avatars bucket at the storage layer, and stop it being listable.
--
-- The upload route already checks size, MIME type and magic bytes, but it is not
-- the only thing holding the service key — anything that ever gets that key can
-- write to the bucket directly. Repeating the limits here means the storage
-- layer enforces them regardless of which code path did the upload.
--
-- The broad SELECT policy on storage.objects is dropped rather than narrowed. A
-- public bucket serves objects through the public CDN URL without consulting
-- RLS at all, so the policy bought nothing and cost the ability for anyone to
-- LIST the bucket — which enumerates every wallet that has set an avatar.

update storage.buckets
   set file_size_limit = 1000000,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'avatars';

drop policy if exists "avatars_public_read" on storage.objects;
