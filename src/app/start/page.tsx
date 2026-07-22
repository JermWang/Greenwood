'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Flask, ShieldCheck } from '@phosphor-icons/react';
import DisclaimerModal from '@/components/ui/DisclaimerModal';
import WalletButton from '@/components/ui/WalletButton';
import { api, type GlobalProfile } from '@/lib/api-client';
import { CHAIN } from '@/lib/config';
import { useWalletStore } from '@/lib/store';

const localProfileKey = (wallet: string) => `gpu:operator-profile:${wallet.toLowerCase()}`;

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
        setError(cause instanceof Error ? cause.message : 'Could not check operator profile');
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
    <main className="gpu-onboarding-screen">
      <div className="gpu-onboarding-grid" aria-hidden />
      <header className="gpu-onboarding-top">
        <Link href="/" aria-label="Return to title screen"><ArrowLeft size={18} /> Title screen</Link>
        <span>OPERATOR INITIALIZATION // {CHAIN.name.toUpperCase()}</span>
      </header>

      <section className="gpu-onboarding-card">
        <div className="gpu-onboarding-step">{wallet ? (checking ? '02 / CHECK' : '03 / IDENTIFY') : '01 / LINK'}</div>
        {!wallet ? (
          <>
            <h1>Link an operator.</h1>
            <p>Your wallet is your portable company account. Connecting is free and does not approve, transfer, or spend any token.</p>
            <div className="gpu-onboarding-wallet"><WalletButton /></div>
            <div className="gpu-safety-note"><ShieldCheck size={20} weight="duotone" /><span><b>No transaction on connect</b><small>A connection proves wallet ownership only. Paid actions always show a separate itemized preview.</small></span></div>
          </>
        ) : checking ? (
          <div className="gpu-profile-check"><span /><h1>Checking company registry.</h1><p>Looking for an existing operator profile tied to this wallet.</p></div>
        ) : (
          <>
            <h1>Name your company.</h1>
            <p>This profile record is off-chain. Creating it requires no token approval, payment, or gas transaction.</p>
            <form onSubmit={createProfile} className="gpu-profile-form">
              <label htmlFor="company-name">Company / operator name</label>
              <input id="company-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={32} autoFocus placeholder="Silicon Valley Labs" />
              <button type="submit" disabled={saving || name.trim().length < 2}>{saving ? 'Creating company…' : 'Create company'}</button>
            </form>
            {profile && <small className="gpu-profile-existing">Wallet registry found. Complete the name to finish setup.</small>}
          </>
        )}
        {error && <div className="gpu-onboarding-error">{error}</div>}
      </section>

      <aside className="gpu-demo-invite">
        <Flask size={22} weight="duotone" />
        <span><b>Not ready to connect?</b><small>Tour a fully stocked fab and try building first.</small></span>
        <Link href="/demo">Play demo</Link>
      </aside>
      <DisclaimerModal />
    </main>
  );
}
