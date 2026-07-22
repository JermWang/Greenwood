-- Record a constraint that was widened directly against the database and never
-- captured as a migration, so a fresh project built from this repo matches the
-- deployed schema instead of rejecting rows production accepts.
--
-- 'legacy_local' marks activity imported from the pre-Supabase local-only build.
-- Nothing writes it any more — recordActivity only ever sends 'app' or
-- 'onchain' — but the value stays allowed so historical rows remain insertable
-- by a restore from backup.

alter table public.activity_history
  drop constraint if exists activity_source;

alter table public.activity_history
  add constraint activity_source
  check (source in ('app', 'onchain', 'legacy_local'));
