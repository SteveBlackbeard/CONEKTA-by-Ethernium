import { NextRequest, NextResponse } from 'next/server';
import { getTimeline } from '@/lib/chronolith';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 20;
    const timeline = await getTimeline(limit);
    return NextResponse.json({ success: true, ...timeline });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'CHRONOLITH_TIMELINE_FAILURE') }, { status: 500 });
  }
}
