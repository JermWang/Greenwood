// Receives one exported .glb from /dev/export and puts it on disk.
//
// Dev-only, and gated on DEV_WALLET_BYPASS rather than on NODE_ENV alone —
// that flag is already the codebase's answer to "is this a real deployment",
// and this route writes files into the working tree, which is the one thing a
// deployed build must never be talked into doing.
//
// `id` is checked against the manifest instead of being sanitised. A slug filter
// would still accept a plausible-looking name that is not ours, and there is no
// reason to accept one: the only legitimate caller is iterating EXPORT_ITEMS.
// Path traversal stops being a question you have to get right.

import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import { EXPORT_ITEMS } from '@/app/dev/export/manifest';

export const dynamic = 'force-dynamic';

const OUT_DIR = path.join(process.cwd(), 'tmp', 'glb');

export async function POST(req: Request) {
  if (!DEV_WALLET_BYPASS) return new NextResponse('Not found', { status: 404 });

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!EXPORT_ITEMS.some((i) => i.id === id)) {
    return new NextResponse(`unknown asset id: ${id}`, { status: 400 });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (body.byteLength === 0) return new NextResponse('empty body', { status: 400 });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, `${id}.glb`), body);

  return NextResponse.json({ ok: true, id, bytes: body.byteLength });
}
