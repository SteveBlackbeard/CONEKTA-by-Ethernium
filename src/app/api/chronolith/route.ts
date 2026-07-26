import { NextRequest, NextResponse } from 'next/server';
import { getTimeline } from '@/lib/chronolith';
import { invokeFrugalResult } from '@/lib/localAdapters';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 20;
    const timeline = await getTimeline(limit);
    let verification: {
      connected: boolean;
      ok: boolean;
      status: number | null;
      verdict: unknown;
      detail?: unknown;
    };
    try {
      const result = await invokeFrugalResult('/ecosystem/chronolith/verify');
      verification = {
        connected: true,
        ok: result.ok,
        status: result.status,
        verdict: result.payload.verdict || (result.ok ? 'verified' : 'failed'),
        detail: result.payload,
      };
    } catch (error: unknown) {
      verification = {
        connected: false,
        ok: false,
        status: null,
        verdict: 'unavailable',
        detail: getErrorMessage(error, 'CHRONOLITH_UNAVAILABLE'),
      };
    }
    return NextResponse.json({
      success: true,
      authority: 'chronolith-read-only-via-frugal',
      localLedger: timeline,
      ...timeline,
      verification,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'CHRONOLITH_TIMELINE_FAILURE') }, { status: 500 });
  }
}
