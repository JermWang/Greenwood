// The web app manifest.
//
// Without one, "Add to Home Screen" on Android produces a bookmark that opens
// in a browser tab with the URL bar visible — which costs a game that already
// fights for vertical room about 90px of the screen, and reads as a shortcut to
// a website rather than a thing you installed.
//
// `display: standalone` is the whole point: launched from the home screen the
// game gets the full viewport and no chrome, which is what makes 100svh mean
// what the layout assumes it means.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Evergreen — Real-World Yield',
    // What actually fits under an icon. "Evergreen — Real-World Yield" is
    // truncated to about eight characters by every launcher.
    short_name: 'Evergreen',
    description:
      'An idle yield game on Robinhood Chain. Open desks, fit instruments, compound BNTY, ' +
      'and take what you earn out past the fence.',
    start_url: '/',
    display: 'standalone',
    // Matches the page background, not the brand colour. This is the splash
    // screen and the letterboxing around the app; painting it Robin Neon would
    // flash a full screen of #CCFF00 on every launch.
    background_color: '#17160f',
    theme_color: '#17160f',
    orientation: 'any',
    categories: ['games'],
    icons: [
      {
        // The generated route, not the SVG. Android's installer wants a raster
        // and silently falls back to a letter tile without one.
        src: '/icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // `maskable` lets a launcher crop to its own shape — circle, squircle,
        // rounded square — without clipping the tree, because the mark already
        // has generous padding inside its tile.
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
