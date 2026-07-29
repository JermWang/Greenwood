'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { defineChain } from 'viem';
import {
  APP_NAME,
  CHAIN,
  PRIVY_APP_ID,
  PRIVY_CLIENT_ID,
  PRIVY_CONFIGURED,
} from '@/lib/config';

const robinhoodChain = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [CHAIN.rpcUrl] } },
  blockExplorers: { default: { name: 'Blockscout', url: CHAIN.explorer } },
});

export default function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  if (!PRIVY_CONFIGURED) return children;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={{
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
        // Wallet only. Email and Google were both non-wallet routes that minted
        // an embedded wallet on login.
        loginMethods: ['wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#f59e0b',
          logo: '/gw-mark.svg',
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-only',
          walletList: [
            'robinhood_wallet',
            'metamask',
            'detected_ethereum_wallets',
            'wallet_connect_qr',
          ],
        },
        embeddedWallets: {
          // Must not be 'all-users' now that wallet is the only login route.
          // PrivyWalletButton resolves the active account as
          // `wallets.find(walletClientType === 'privy') ?? wallets[0]`, so an
          // auto-minted embedded wallet would outrank the wallet the operator
          // actually connected with and bind their compound to an address they
          // never chose. Everyone arriving now already has a wallet, so this
          // creates nothing — and stays correct if a social login is re-added.
          ethereum: { createOnLogin: 'users-without-wallets' },
          showWalletUIs: true,
          priceDisplay: { primary: 'native-token', secondary: null },
        },
        mfa: { noPromptOnMfaRequired: false },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
