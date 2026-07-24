// The deploy window is enforced server-side, not just shown in the banner.
import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-deploy-guard-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { deployWindowActive, requireNoActiveDeploy } = await import('./deploy-guard');
const { setProtocolValue } = await import('./db');

afterEach(() => setProtocolValue('deploy_notice_until', '0'));

describe('deploy window guard', () => {
  test('no window: actions pass', () => {
    setProtocolValue('deploy_notice_until', '0');
    expect(deployWindowActive()).toBe(false);
    expect(() => requireNoActiveDeploy()).not.toThrow();
  });

  test('open window: actions are refused with 503', () => {
    setProtocolValue('deploy_notice_until', String(Date.now() + 60_000));
    expect(deployWindowActive()).toBe(true);
    expect(() => requireNoActiveDeploy()).toThrow(/update in progress/i);
    try {
      requireNoActiveDeploy();
    } catch (e) {
      expect((e as { status?: number }).status).toBe(503);
    }
  });

  test('expired window: actions pass again', () => {
    setProtocolValue('deploy_notice_until', String(Date.now() - 1_000));
    expect(deployWindowActive()).toBe(false);
    expect(() => requireNoActiveDeploy()).not.toThrow();
  });
});
