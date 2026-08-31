# Relaunching on a new token

The order below is the whole document. Everything else here is the argument for
one of the steps, and every step exists because doing it out of order costs
something that cannot be got back.

## The order

1. **Pause payouts.** `payouts_paused = 1` in `protocol`. A claim settled
   against the old token while you are mid-migration is a real transfer you
   cannot unwind, and the wipe deliberately preserves this flag so it stays
   paused across the reset.
2. **Back up, and check the backup.** `POST /api/admin/backup`, then
   `listSnapshots()` / `verifySnapshot()`. The reset takes its own snapshot and
   refuses to run if it cannot, but that one lands on the same volume as the
   database it is protecting. Pull a copy off the box.
3. **Unset the old token.** Clear `NEXT_PUBLIC_OSR_TOKEN` on Railway and let it
   deploy. This is what makes step 4 legal rather than forced — see below.
4. **Wipe.** `POST /api/admin/reset` with the admin bearer and
   `{"confirm":"WIPE-ALL-GAME-STATE"}`. Send `{"dryRun":true}` first; it reports
   exactly which tables would be emptied, using the same code the wipe uses.
5. **Check it took.** The response carries `before`/`after` per table,
   `tablesWiped`, `tablesKept`, and `registry` — the Supabase side. `after`
   should be zero everywhere and `registry` should account for every profile.
6. **Point at the new token.** Set `NEXT_PUBLIC_OSR_TOKEN` to the new address
   AND `NEXT_PUBLIC_GPU_TOKEN_SYMBOL` to whatever the new contract's `symbol()`
   actually returns. Both, in the same deploy.
7. **Fund the treasury** — gas *and* tokens. `GET /api/admin/solvency`.
8. **Unpause payouts**, and only then.

## Why the token comes off before the wipe

`/api/admin/reset` refuses to run while `TOKEN_LIVE`, and there is an override
(`OSR_ALLOW_RESET=yes-wipe-a-live-game`) that exists for testnets. Reaching for
the override during a relaunch is the wrong move, and not for a rule-following
reason: while the old token is still configured, the balances in the database
are still redeemable against it, so wiping them destroys value somebody holds.
Unsetting the address first makes the guard pass **honestly** — between steps 3
and 6 the game genuinely holds nothing real, which is the condition the guard
was written to detect.

## Why the symbol moves with the address

`EXPECTED_TOKEN_SYMBOL` (`NEXT_PUBLIC_GPU_TOKEN_SYMBOL`, defaulting to `BNTY`)
is not branding. `settlement-client` reads `symbol()` off the deployed contract
and **refuses to build a transfer when the two disagree**. Change the address
without the symbol and every on-chain action in the game stops with a mismatch;
change the symbol without the address and you have described a token you are not
using. They are one change.

No code edit is needed for either — both are environment variables. They do need
a deploy, because `NEXT_PUBLIC_*` is inlined at build time.

## What the wipe covers, and what it does not

`lib/reset` reads the schema at runtime and empties **everything it is not
explicitly told to keep**. That default is inverted on purpose: the previous
version carried a hand-written list of ten tables against a schema of
twenty-two, so twelve survived — levels, cosmetics, quest claims, packs, loot
piles, tree respawns, expedition positions. A table added after this is written
gets wiped without anyone remembering to come back here.

Kept deliberately, each with its reason in the source:

| Kept | Why |
|---|---|
| `protocol` (the table) | half game counters, half operator settings; cleared key by key instead |
| `payouts_paused`, `payouts_paused_reason` | an operator paused on purpose; a wipe must not resume |
| `deploy_notice_*` | a maintenance notice outlives the data it warned about |
| `last_backup_at` | backup scheduling, not game state |

The Supabase half — `profiles`, `activity_history`, `privy_identities` — is
cleared in the same call. A wipe that left those standing would launch a fresh
world with a populated leaderboard of funds that no longer exist.

**Avatar images in storage are not deleted.** Nothing references them once the
profile rows are gone, so they are inert; the count comes back in the response
as `avatars_left_in_storage` so it is a visible leftover rather than a forgotten
one. Clear the bucket by hand if you want them gone.

## The thing that is not a launch-sequence problem but looks like one

Desks created before the token is configured keep accruing, and those accruals
become real payouts afterwards. The wipe is what handles it, which is why it
happens **before** step 6 and not after. There is no rate limit or balance check
that substitutes for doing it in this order.
