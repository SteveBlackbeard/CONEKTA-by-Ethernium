import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { getStateFilePath } from '@/lib/runtimePaths';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = await fs.readFile(getStateFilePath(), 'utf-8');
    const state = JSON.parse(raw);
    return NextResponse.json({ ...state, available: true });
  } catch {
    // No crystallized state yet. This is a normal condition for a standalone
    // CONEKTA install, so answer 200 with a flag instead of a 500 on every poll.
    return NextResponse.json({
      available: false,
      merkle_root: 'awaiting_crystallization',
      last_check: new Date().toISOString(),
      physics: { H: 0, H_max: 0, eta: 0, N: 0, W: 0, gini: 0 },
      drift_kl: 0,
      crystallizer_version: null,
    });
  }
}
