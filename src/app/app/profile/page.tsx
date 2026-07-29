'use client';

import { useCallback, useEffect, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import { useWalletStore } from '@/lib/store';
import { api, type ActivityItem, type GlobalProfile } from '@/lib/api-client';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { CHAIN } from '@/lib/config';

const eventLabels: Record<string, string> = {
  profile_created: 'Fund profile created',
  session_started: 'New session started',
  node_minted: 'Desk opened',
  node_upgraded: 'Desk upgraded',
  crate_opened: 'Allocation opened',
  rewards_claimed: 'Rewards claimed',
  compound_upgraded: 'Portfolio upgraded',
  component_equipped: 'Instrument equipped',
  component_unequipped: 'Instrument unequipped',
};

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 8)}…${wallet.slice(-6)}`;
}

function displayNumber(value: number, digits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function ProfilePage() {
  const wallet = useWalletStore((state) => state.wallet);
  const [profile, setProfile] = useState<GlobalProfile | null>(null);
  const [history, setHistory] = useState<ActivityItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const saveName = async () => {
    if (!wallet) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await api.updateProfile(wallet, nameDraft.trim() || null);
      setProfile(res.profile);
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async (file: File | null) => {
    if (!wallet || !file) return;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await api.uploadAvatar(wallet, file);
      setProfile(updated);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.profile(wallet);
      setConfigured(result.configured);
      setProfile(result.profile);
      setHistory(result.history);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Profile service unavailable');
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!wallet) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const normalized = wallet.toLowerCase();
    const channel = supabase
      .channel(`gw-operator-profile-${normalized}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `wallet=eq.${normalized}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_history',
          filter: `wallet=eq.${normalized}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [wallet, load]);

  return (
    <PageShell title="Fund Profile" subtitle="Your persistent fund identity, portfolio record, and network history." maxWidth="max-w-[1360px]">
      {!wallet ? (
        <div className="panel p-6 text-sm text-steel-300">
          Sign in with Privy or link an external wallet to load your persistent online profile.
        </div>
      ) : !configured ? (
        <div className="panel border-amber-500/40 p-6 text-sm text-amber-300">
          The global profile database has not been configured for this environment yet.
        </div>
      ) : error ? (
        <div className="panel border-red-500/40 p-6 text-sm text-red-400">{error}</div>
      ) : loading && !profile ? (
        <p className="text-sm text-steel-400">Loading global profile…</p>
      ) : profile ? (
        <div className="operator-layout">
          <section className="operator-pass">
            <div className="operator-pass-head">
              <span className="operator-pass-code">GREENWOOD / FUND CREDENTIAL</span>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {/* Avatar: uploaded image, or the wallet's aura-tinted initial. */}
                  <label
                    className="group relative block h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-full border border-amber-500/40 bg-ink-800"
                    title="Change profile picture"
                  >
                    {profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center font-mono text-xl font-bold text-amber-400">
                        {(profile.displayName || profile.wallet.slice(2, 3)).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="absolute inset-0 hidden items-center justify-center bg-ink-900/70 font-mono text-[9px] uppercase tracking-widest text-amber-300 group-hover:flex">
                      Edit
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={saving}
                      onChange={(e) => void pickAvatar(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <div>
                    <div className="flex items-center gap-2">
                      {editing ? (
                        <input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          maxLength={28}
                          placeholder="Fund name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveName();
                            if (e.key === 'Escape') setEditing(false);
                          }}
                          className="rounded border border-amber-500/60 bg-ink-900 px-2 py-1 font-mono text-lg font-bold text-white outline-none"
                        />
                      ) : (
                        <h2 className="font-mono text-lg font-bold text-white">
                          {profile.displayName || shortWallet(profile.wallet)}
                        </h2>
                      )}
                      {editing ? (
                        <button
                          className="btn-primary !px-2.5 !py-1 text-xs"
                          disabled={saving}
                          onClick={() => void saveName()}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      ) : (
                        <button
                          className="rounded border border-steel-500/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-steel-400 transition hover:border-amber-500 hover:text-amber-400"
                          onClick={() => {
                            setNameDraft(profile.displayName ?? '');
                            setEditing(true);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <span className={profile.online ? 'text-emerald-400' : 'text-steel-500'}>
                        ● {profile.online ? 'online' : 'offline'}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-steel-400">
                      {profile.wallet}
                    </p>
                    {editError && (
                      <p className="mt-1 text-[11px] text-red-400">{editError}</p>
                    )}
                  </div>
                </div>
                <a
                  href={`${CHAIN.explorer}/address/${profile.wallet}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-steel-500/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-steel-300 hover:border-amber-500 hover:text-amber-400"
                >
                  View wallet ↗
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-ink-600 sm:grid-cols-4">
              <Stat label="Portfolio tier" value={`L${profile.compoundLevel}`} />
              <Stat label="Desks" value={String(profile.nodeCount)} />
              <Stat label="BNTY earned" value={`${displayNumber(profile.totalProduced)} BNTY`} />
              <Stat label="Fund sessions" value={displayNumber(profile.totalSessions, 0)} />
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-ink-600 p-4 text-xs text-steel-400 sm:grid-cols-2">
              <p>
                Joined <span className="text-steel-200">{new Date(profile.joinedAt).toLocaleString()}</span>
              </p>
              <p>
                Last seen{' '}
                <span className="text-steel-200">{new Date(profile.lastSeenAt).toLocaleString()}</span>
              </p>
            </div>
          </section>

          <section className="operator-trace">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-white">
                Fund activity
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                Live
              </span>
            </div>
            <div className="panel divide-y divide-ink-600 overflow-hidden">
              {history.length === 0 ? (
                <p className="p-5 text-sm text-steel-400">No activity has been recorded yet.</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-steel-100">
                        {eventLabels[item.eventType] || item.eventType.replaceAll('_', ' ')}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-steel-500">
                        {item.source === 'onchain' ? 'Verified on-chain' : 'Greenwood network'}{' '}
                        ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {item.amount != null && (
                      <span className="font-mono text-sm text-amber-400">
                        {displayNumber(item.amount)} {item.assetSymbol || ''}
                      </span>
                    )}
                    {item.txHash && (
                      <a
                        href={`${CHAIN.explorer}/tx/${item.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] text-emerald-400 hover:underline"
                      >
                        Receipt ↗
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="panel p-6 text-sm text-steel-300">
          Your fund profile is being initialized. Visit the Trading Floor once, then refresh this page.
        </div>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-800 p-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-steel-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
