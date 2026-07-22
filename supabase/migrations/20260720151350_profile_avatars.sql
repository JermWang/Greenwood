-- Player-editable identity: avatar image URL on the profile row.
alter table public.profiles
  add column if not exists avatar_url text
  check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url like 'https://%'));

-- Public-read bucket for avatar images. Writes go through the app server with
-- the service key only, so no storage RLS policies for anon writes are needed.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone may read avatar objects (public bucket serves via CDN URL anyway).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
