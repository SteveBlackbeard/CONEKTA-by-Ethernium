import { NextResponse } from 'next/server';
import { verifyChain } from '@/lib/eventChain';
import { getErrorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await verifyChain();
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ intact: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
