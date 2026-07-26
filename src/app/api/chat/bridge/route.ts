import { NextResponse } from 'next/server';
import { getAdapterStatuses, invokeFrugalChat } from '@/lib/localAdapters';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [adapter] = getAdapterStatuses();
  return NextResponse.json({
    success: true,
    provider: 'frugal',
    authority: adapter.authority,
    adapters: [adapter],
    ready: adapter.configured,
    retiredProviders: ['ollama', 'openclaw', 'moltbot'],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedProvider = String(body?.provider || 'frugal').trim().toLowerCase();
    const prompt = String(body?.prompt || '').trim();

    if (requestedProvider !== 'frugal') {
      return NextResponse.json(
        {
          success: false,
          error: 'PARALLEL_COGNITIVE_PROVIDER_RETIRED',
          authority: 'ethernium-frugal',
        },
        { status: 410 },
      );
    }
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Missing prompt' }, { status: 400 });
    }
    if (prompt.length > 20000) {
      return NextResponse.json({ success: false, error: 'Prompt too large' }, { status: 413 });
    }

    const result = await invokeFrugalChat(prompt, { explain: Boolean(body?.explain) });
    const reply = [result?.response || 'NO_RESPONSE', result?.next ? `NEXT // ${result.next}` : '']
      .filter(Boolean)
      .join('\n');
    return NextResponse.json({
      success: true,
      provider: 'frugal',
      authority: 'ethernium-frugal',
      reply,
      status: result?.status || 'success',
      mode: result?.mode || null,
      raw: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'CHAT_BRIDGE_FAILURE') },
      { status: 502 },
    );
  }
}
