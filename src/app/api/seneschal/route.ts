import { NextResponse } from 'next/server';
import { askSeneschal, getSeneschalStatus } from '@/lib/seneschal';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getSeneschalStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'SENESCHAL_STATUS_FAILURE') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Missing prompt' }, { status: 400 });
    }

    const result = await askSeneschal(prompt);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'SENESCHAL_FAILURE') },
      { status: 500 },
    );
  }
}
