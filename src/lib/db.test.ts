// Where the game database is allowed to live.
//
// Every balance, node, crate, stake and settlement is in one SQLite file. If it
// resolves to container storage on Railway, the next deploy starts from an empty
// database and every operator's holdings are gone silently — so these assert the
// refusal to guess, not just the happy path.
import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';

const { resolveDataDir } = await import('./db');

const SAVED = {
  dir: process.env.OSR_DATA_DIR,
  railway: process.env.RAILWAY_ENVIRONMENT,
  volume: process.env.RAILWAY_VOLUME_MOUNT_PATH,
  vercel: process.env.VERCEL,
};

beforeEach(() => {
  delete process.env.OSR_DATA_DIR;
  delete process.env.RAILWAY_ENVIRONMENT;
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  delete process.env.VERCEL;
});

afterAll(() => {
  // Restore, or the suite's own OSR_DATA_DIR sandbox is lost for later files.
  for (const [key, value] of [
    ['OSR_DATA_DIR', SAVED.dir],
    ['RAILWAY_ENVIRONMENT', SAVED.railway],
    ['RAILWAY_VOLUME_MOUNT_PATH', SAVED.volume],
    ['VERCEL', SAVED.vercel],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('resolveDataDir', () => {
  test('uses the volume path on Railway', () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    process.env.OSR_DATA_DIR = '/data';
    expect(resolveDataDir()).toBe('/data');
  });

  test('accepts a subdirectory of the volume', () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    process.env.OSR_DATA_DIR = '/data/osr';
    expect(resolveDataDir()).toBe('/data/osr');
  });

  test('refuses to boot on Railway with no data dir configured', () => {
    // The one-variable mistake: without this the old fallback chain resolved to
    // cwd/data and the app came up serving an empty database.
    process.env.RAILWAY_ENVIRONMENT = 'production';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    expect(() => resolveDataDir()).toThrow(/OSR_DATA_DIR is not set/);
  });

  test('refuses a data dir outside the mounted volume', () => {
    process.env.RAILWAY_ENVIRONMENT = 'production';
    process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
    process.env.OSR_DATA_DIR = '/tmp/osr';
    expect(() => resolveDataDir()).toThrow(/outside the mounted volume/);
  });

  test('is unaffected off Railway, so local and CI keep working', () => {
    process.env.OSR_DATA_DIR = '/tmp/osr-local';
    expect(resolveDataDir()).toBe('/tmp/osr-local');
  });

  test('falls back to cwd/data only when nothing else applies', () => {
    expect(resolveDataDir()).toBe(path.join(process.cwd(), 'data'));
  });
});
