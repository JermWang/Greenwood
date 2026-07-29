'use client';

import { usePathname } from 'next/navigation';
import { useWalletStore } from '@/lib/store';
import { CHAIN } from '@/lib/config';

export default function DisclaimerModal() {
  const pathname = usePathname();
  const termsAcceptedAt = useWalletStore((state) => state.termsAcceptedAt);
  const acceptTerms = useWalletStore((state) => state.acceptTerms);
  const wallet = useWalletStore((state) => state.wallet);

  const isWalletFreeRoute = pathname === '/demo' || (pathname === '/start' && !wallet);
  if (pathname === '/' || pathname?.startsWith('/rarity-test') || isWalletFreeRoute || termsAcceptedAt) return null;

  return (
    <div className="gw-safety-overlay">
      <div className="gw-safety-modal">
        <div className="gw-safety-code"><span>SAFETY INTERLOCK</span><span>MAINNET / {CHAIN.id}</span></div>
        <div className="gw-safety-layout">
          <div className="gw-safety-desk" aria-hidden><span>!</span></div>
          <div>
            <h2 className="text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-[.92] tracking-[-.055em] text-white">Real network.<br />Exact review.</h2>
            <p className="mt-5 text-sm leading-relaxed text-emerald-100/58">
              You are entering Greenwood on <strong>{CHAIN.name}</strong> (chain {CHAIN.id}), an EVM L2 that settles with ETH gas. Connect MetaMask, Rabby, or Robinhood Wallet and sign a free message to prove it is yours. Mainnet transfers use real assets and cannot be reversed. Before any wallet prompt, Greenwood simulates the exact direct transfer and shows the amount, token, treasury, network, and zero native value. Greenwood never requests an unlimited token allowance. Greenwood is a game, not a financial product, and rewards are not guaranteed.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
          <button className="btn-secondary w-full sm:w-auto" onClick={() => window.location.replace('/')}>Exit to title</button>
          <button className="btn-primary w-full sm:w-auto" onClick={() => acceptTerms()}>{wallet ? 'Unlock fund controls' : 'Acknowledge & enter'}</button>
        </div>
      </div>
    </div>
  );
}
