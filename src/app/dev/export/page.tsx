// The GLB export bench, gated exactly like the asset builder next door.
//
// Same reasoning as /dev/assets: nothing here is secret — it draws models that
// already ship in the client bundle — but a page that writes files into the repo
// has no business existing in a deployed build. DEV_WALLET_BYPASS is false in
// any production build and on any deployed environment.

import { notFound } from 'next/navigation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import GlbExporter from './GlbExporter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'GLB Export — Evergreen',
  robots: { index: false, follow: false },
};

export default function GlbExportPage() {
  if (!DEV_WALLET_BYPASS) notFound();
  return <GlbExporter />;
}
