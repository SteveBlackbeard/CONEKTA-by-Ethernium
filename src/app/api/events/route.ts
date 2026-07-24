import { NextResponse } from 'next/server';
import { getEvents, getEventCount } from '@/lib/eventChain';
import { getErrorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Return the page AND the true total. Returning only the page let the
    // client mistake one for the other and report a capped number as a count.
    const limit = 10;
    const [events, total] = await Promise.all([getEvents(limit), getEventCount()]);
    return NextResponse.json({ events, total, limit, truncated: total > events.length });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
