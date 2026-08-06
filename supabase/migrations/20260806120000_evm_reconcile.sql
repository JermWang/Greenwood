-- Bring the deployed project onto the EVM schema this repo has assumed since
-- the move to Robinhood Chain.
--
-- WHAT WAS WRONG.
--
-- The project was created in the Solana era and the repo's later migrations
-- were never applied to it, so the live database still validated base58
-- addresses while every wallet the app produces is a 0x EVM address. Three
-- separate things rejected them:
--
--   profiles_wallet_solana        CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
--   privy_identity_wallet_solana  same, on privy_identities
--   touch_profile()               raised 'invalid wallet address' on the same test
--
-- and activity_history carried `tx_signature` (with a base58 CHECK) where the
-- app writes `tx_hash`.
--
-- The effect was total and silent: profile sync failed for EVERY player, so no
-- profile row was ever created, so the global leaderboard, avatars, fund names
-- and activity history had no data to show. It surfaced only as one line in the
-- server log — "profile sync failed, serving operation anyway" — because the
-- operation route deliberately swallows it to keep the game playable.
--
-- The repo's own migrations could not have fixed this on their own: they lead
-- with `create table if not exists`, which does nothing to a table that already
-- exists, so the stale CHECKs would have survived them untouched. Constraints
-- have to be dropped by name, which is what this does.
--
-- WHY NOT VALID.
--
-- One profile row predates the chain move and holds a base58 address. It can
-- never be updated again — no EVM wallet will ever match it — but validating
-- the new constraint against it would abort this migration. NOT VALID enforces
-- the rule on every future write while tolerating what is already there, which
-- is the correct trade for a row that is inert. Deleting it is a judgement
-- about somebody's data and does not belong in a schema migration.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_wallet_solana;

alter table public.profiles
  drop constraint if exists profiles_wallet_evm;

alter table public.profiles
  add constraint profiles_wallet_evm check (wallet ~ '^0x[0-9a-f]{40}$') not valid;

-- ---------------------------------------------------------------------------
-- privy_identities
--
-- Privy itself is gone — replaced by wallet-signature auth — and nothing writes
-- this table any more. The constraint is corrected rather than the table
-- dropped, because a stale rule that contradicts the rest of the schema is the
-- thing that caused this migration to be necessary in the first place.
-- ---------------------------------------------------------------------------
alter table public.privy_identities
  drop constraint if exists privy_identity_wallet_solana;

alter table public.privy_identities
  drop constraint if exists privy_identity_wallet_evm;

alter table public.privy_identities
  add constraint privy_identity_wallet_evm check (wallet ~ '^0x[0-9a-f]{40}$') not valid;

-- ---------------------------------------------------------------------------
-- activity_history: tx_signature -> tx_hash
--
-- Renamed rather than added-and-dropped so any existing rows keep their value.
-- Guarded so this migration is safe to re-run and safe on a project that was
-- built from the repo (where the column is already tx_hash).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'activity_history'
       and column_name = 'tx_signature'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'activity_history'
       and column_name = 'tx_hash'
  ) then
    alter table public.activity_history rename column tx_signature to tx_hash;
  end if;
end $$;

alter table public.activity_history
  drop constraint if exists activity_tx_signature;

alter table public.activity_history
  drop constraint if exists activity_tx_hash;

alter table public.activity_history
  add constraint activity_tx_hash
  check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$') not valid;

-- ---------------------------------------------------------------------------
-- touch_profile: the same base58 test, in the function body.
--
-- Replaced wholesale from 20260718190000_global_profiles.sql rather than
-- patched, so there is exactly one definition of this function in the repo and
-- a fresh project and this one cannot drift apart again.
-- ---------------------------------------------------------------------------
create or replace function public.touch_profile(
  p_wallet text,
  p_compound_level integer default 1,
  p_node_count integer default 0,
  p_max_node_level integer default 0,
  p_sum_node_levels integer default 0,
  p_production_rate double precision default 0,
  p_total_produced double precision default 0,
  p_total_burned double precision default 0
) returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  existing public.profiles;
  saved public.profiles;
  new_session boolean := false;
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  select * into existing from public.profiles where wallet = p_wallet for update;
  if not found then
    insert into public.profiles (
      wallet, joined_at, last_seen_at, compound_level, node_count,
      max_node_level, sum_node_levels, production_rate, total_produced, total_burned
    ) values (
      p_wallet, now_ms, now_ms, greatest(1, p_compound_level), greatest(0, p_node_count),
      greatest(0, p_max_node_level), greatest(0, p_sum_node_levels),
      greatest(0, p_production_rate), greatest(0, p_total_produced), greatest(0, p_total_burned)
    ) returning * into saved;

    insert into public.activity_history (wallet, event_type, source, metadata)
    values (p_wallet, 'profile_created', 'app', jsonb_build_object('compoundLevel', saved.compound_level));
    return saved;
  end if;

  new_session := now_ms - existing.last_seen_at >= 1800000;
  update public.profiles set
    last_seen_at = now_ms,
    total_sessions = total_sessions + case when new_session then 1 else 0 end,
    compound_level = greatest(compound_level, p_compound_level),
    node_count = greatest(0, p_node_count),
    max_node_level = greatest(0, p_max_node_level),
    sum_node_levels = greatest(0, p_sum_node_levels),
    production_rate = greatest(0, p_production_rate),
    total_produced = greatest(total_produced, p_total_produced),
    total_burned = greatest(total_burned, p_total_burned),
    updated_at = now()
  where wallet = p_wallet
  returning * into saved;

  if new_session then
    insert into public.activity_history (wallet, event_type, source)
    values (p_wallet, 'session_started', 'app');
  end if;
  return saved;
end;
$$;

revoke all on function public.touch_profile(text, integer, integer, integer, integer, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.touch_profile(text, integer, integer, integer, integer, double precision, double precision, double precision) to service_role;
