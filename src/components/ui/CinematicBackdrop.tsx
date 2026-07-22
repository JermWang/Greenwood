'use client';

import { usePathname } from 'next/navigation';

const EXCLUDED_ROUTES = new Set(['/', '/demo', '/app/floor', '/app/docs', '/cinematic-capture']);

function routeScene(pathname: string) {
  if (pathname.includes('market')) return 'exchange';
  if (pathname.includes('vault') || pathname.includes('tokenomics')) return 'treasury';
  if (pathname.includes('leaderboard') || pathname.includes('ops')) return 'telemetry';
  if (pathname.includes('inventory')) return 'inventory';
  return 'cleanroom';
}

export default function CinematicBackdrop() {
  const pathname = usePathname();
  if (EXCLUDED_ROUTES.has(pathname) || pathname.startsWith('/app/docs/')) return null;

  return (
    <div className={`gpu-cinematic-broll is-${routeScene(pathname)}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gpu-broll-motion" src="/media/gpu-fab-broll.webp" alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gpu-broll-poster" src="/media/gpu-fab-broll-poster.webp" alt="" />
      <span className="gpu-broll-grade" />
      <span className="gpu-broll-grain" />
    </div>
  );
}
