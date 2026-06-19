import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/eventChain';
import { getErrorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = await getEvents(10);
    return NextResponse.json({ events });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
