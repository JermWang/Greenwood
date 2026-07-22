'use client';

import { usePathname } from 'next/navigation';

const EXCLUDED_ROUTES = new Set(['/', '/demo', '/app/floor', '/app/docs', '/cinematic-capture']);

/** Built by scripts/build-cinematic-stills.mjs. Must stay in step with the
 *  gpu-broll-fade keyframes, which hold each still for a fifth of the cycle. */
const STILLS = [
  '/media/gpu-fab-still-01.webp',
  '/media/gpu-fab-still-02.webp',
  '/media/gpu-fab-still-03.webp',
  '/media/gpu-fab-still-04.webp',
  '/media/gpu-fab-still-05.webp',
];
const CYCLE_SECONDS = 75;

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
      {STILLS.map((src, index) => {
        // Negative delays start every still mid-cycle, so the sequence is already
        // running at first paint instead of fading up from an empty backdrop.
        const offset = `${-index * (CYCLE_SECONDS / STILLS.length)}s`;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            className="gpu-broll-still"
            style={{ animationDelay: `${offset}, ${offset}` }}
            src={src}
            alt=""
            loading={index === 0 ? undefined : 'lazy'}
            decoding="async"
          />
        );
      })}
      <span className="gpu-broll-grade" />
      <span className="gpu-broll-grain" />
    </div>
  );
}
