'use client';

// The Outfitter as a full page.
//
// The same component is docked over the Trading Floor, where it is reachable by
// walking to the stall. This route exists so it is also reachable the way every
// other module is — from the nav, without loading a 3D scene first.

import PageShell from '@/components/ui/PageShell';
import CosmeticsShop from '@/components/ui/CosmeticsShop';
import { useOperation } from '@/lib/useOperation';

export default function OutfitterPage() {
  const wallet = useOperation((state) => state.wallet);
  const op = useOperation((state) => state.op);

  return (
    <PageShell
      title="The Outfitter"
      subtitle="Buy a look, then refine it. Nothing here changes what your desks pay."
    >
      <CosmeticsShop wallet={wallet} balance={op?.osrBalance} />
    </PageShell>
  );
}
