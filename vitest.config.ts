import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest's default `exclude` covers node_modules and dist but not .claude,
    // which holds agent worktrees — full copies of this repo, test files and
    // all. Without this the suite discovers and runs every test twice, doubling
    // the wall clock and putting enough load on the box that the slower hooks
    // start timing out. The duplicates also report failures against paths
    // inside a checkout nobody is editing.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**'],
    // Loading viem and the Next runtime takes longer than the 10s default on a
    // cold cache, and a hook that times out reads as a broken test rather than
    // a slow import.
    hookTimeout: 30_000,
  },
});
