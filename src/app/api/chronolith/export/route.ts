import { NextResponse } from 'next/server';
import { exportHistory } from '@/lib/chronolith';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await exportHistory();
    const fileName = `chronolith-export-${payload.generated_at.replace(/[:.]/g, '-')}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'CHRONOLITH_EXPORT_FAILURE') }, { status: 500 });
  }
}
