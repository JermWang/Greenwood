'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Flask, ShieldCheck } from '@phosphor-icons/react';
import WalletButton from '@/components/ui/WalletButton';
import { api, type GlobalProfile } from '@/lib/api-client';
import { CHAIN } from '@/lib/config';
import { carryOverLocal } from '@/lib/legacy-keys';
import WorldPicker from '@/components/ui/WorldPicker';
import { useWalletStore } from '@/lib/store';

/*
 * ssr: false because the scene builds three.js objects at render scope, and a
 * throw inside a Canvas subtree during the server pass takes the whole scene
 * with it — black canvas, empty console. Same reason the title screen does it;
 * see docs/iso-conventions.md.
 */
const RegionCinematic = dynamic(() => import('@/components/iso/RegionCinematic'), { ssr: false });

const localProfileKey = (wallet: string) => `evergreen:operator-profile:${wallet.toLowerCase()}`;

export default function StartCompanyPage() {
  const router = useRouter();
  const wallet = useWalletStore((state) => state.wallet);
  const [profile, setProfile] = useState<GlobalProfile | null>(null);
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setProfile(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setError(null);
    void api.profile(wallet)
      .then((result) => {
        if (cancelled) return;
        setConfigured(result.configured);
        setProfile(result.profile);
        if (result.profile?.displayName) {
          router.replace('/app');
          return;
        }
        if (!result.configured) {
          carryOverLocal(localProfileKey(wallet));
          const localName = window.localStorage.getItem(localProfileKey(wallet));
          if (localName) {
            router.replace('/app');
            return;
          }
        }
        setChecking(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not check fund profile');
        setChecking(false);
      });
    return () => { cancelled = true; };
  }, [router, wallet]);

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!wallet || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    try {
      if (configured) await api.updateProfile(wallet, name.trim());
      else window.localStorage.setItem(localProfileKey(wallet), name.trim());
      router.push('/app');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profile creation failed');
      setSaving(false);
    }
  };

  return (
    <>
      {/*
        The settlement, live, behind the fund setup and the world picker.

        THE GROUNDS RATHER THAN THE DEEP FOREST, which the title screen uses.
        This screen is where you choose which world to join, and the Grounds
        ARE the world you join — the hub every shard drops you into, with the
        Machine Room and the Trading Floor in frame. The forest is where you go
        later. Two screens running the identical shot would also read as a bug
        rather than as a house style.

        Outside <main> and fixed, not inside it. The scrim that makes this
        legible is `.eg-onboarding-screen`'s own translucent background, and an
        element's background paints BEHIND its children — so a cinematic
        mounted inside would sit on top of the scrim meant to darken it.
      */}
      <div className="eg-onboarding-world" aria-hidden>
        <RegionCinematic region="grounds" />
      </div>
      {/* No `.eg-onboarding-grid` here any more. It was a flat 42px lattice
          standing in for texture on an empty screen; there is a settlement
          behind this one now, with its own isometric tile grid, and two grids
          at two different angles read as noise rather than as depth. The demo
          screen still uses it — it has no world behind it. */}
      <main className="eg-onboarding-screen">
      <header className="eg-onboarding-top">
        <Link href="/" aria-label="Return to title screen"><ArrowLeft size={18} /> Title screen</Link>
        <span>FUND SETUP // {CHAIN.name.toUpperCase()}</span>
      </header>

      <section className="eg-onboarding-card">
        <div className="eg-onboarding-step">{wallet ? (checking ? '02 / CHECK' : '03 / IDENTIFY') : '01 / LINK'}</div>
        {!wallet ? (
          <>
            <h1>Link a fund.</h1>
            <p>Your wallet is your portable fund account. Connecting is free and does not approve, transfer, or spend any token.</p>
            <div className="eg-onboarding-wallet"><WalletButton /></div>
            <div className="eg-safety-note"><ShieldCheck size={20} weight="duotone" /><span><b>No transaction on connect</b><small>A connection proves wallet ownership only. Paid actions always show a separate itemized preview.</small></span></div>
          </>
        ) : checking ? (
          <div className="eg-profile-check"><span /><h1>Checking fund registry.</h1><p>Looking for an existing fund profile tied to this wallet.</p></div>
        ) : (
          <>
            {/*
              THIS IS THE USERNAME, and it now says so.

              It asked for a "fund name" and never mentioned that the answer is
              what everybody else sees — on the Exchange beside your listings,
              in world chat, on the leaderboard. People typed a throwaway and
              then had no idea where the name following them around had come
              from. Naming the places it appears is the whole fix; it is the
              same field it always was, and it has always been required.
            */}
            <h1>Choose your name.</h1>
            <p>
              This is your username — the name other funds see on your listings, in world
              chat and on the leaderboard. It is off-chain, and setting it costs no
              approval, payment or gas.
            </p>
            <form onSubmit={createProfile} className="eg-profile-form">
              <label htmlFor="company-name">Username · your fund name</label>
              <input id="company-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={32} autoFocus placeholder="Evergreen Capital" />
              <button type="submit" disabled={saving || name.trim().length < 2}>{saving ? 'Creating fund…' : 'Create fund'}</button>
            </form>
            {/* Chosen on the way in, beside naming the fund, because both are
                things you decide once and then walk through the door. */}
            <WorldPicker />
            {profile && <small className="eg-profile-existing">Wallet registry found. Complete the name to finish setup.</small>}
          </>
        )}
        {error && <div className="eg-onboarding-error">{error}</div>}
      </section>

      <aside className="eg-demo-invite">
        <Flask size={22} weight="duotone" />
        <span><b>Not ready to connect?</b><small>Start outside Evergreen and build a fund from nothing.</small></span>
        <Link href="/demo">Play demo</Link>
      </aside>
      </main>
    </>
  );
}
