// The asset builder, gated to local development.
//
// Gated on the same flag as the wallet bypass rather than on a password. This
// page reads nothing secret — every model it draws is already shipped in the
// client bundle — so the risk is not disclosure, it is that a workbench with
// edit affordances shows up in a real deployment. DEV_WALLET_BYPASS is false in
// any production build and on any deployed environment, which is exactly the
// set of places this should not exist.
//
// notFound() rather than a "come back later" page: a 404 is the honest answer
// for a route that does not exist in this build.

import { notFound } from 'next/navigation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import AssetBrowser from './AssetBrowser';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Asset Builder — Evergreen',
  // Belt and braces: even if it somehow rendered, it should never be indexed.
  robots: { index: false, follow: false },
};

export default function AssetBuilderPage() {
  if (!DEV_WALLET_BYPASS) notFound();
  return <AssetBrowser />;
}
