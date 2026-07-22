import { NextResponse } from 'next/server';
import { forwardBridgePayload, getAdapterStatuses, getAdapterConfig, invokeFrugalChat, invokeOllamaChat } from '@/lib/localAdapters';
import { getErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveProvider(input?: string | null) {
  const raw = (input || process.env.CONTINUITY_CHAT_PROVIDER || 'frugal').toLowerCase().trim();
  if (raw === 'ollama') return 'ollama' as const;
  if (raw === 'moltbot') return 'moltbot' as const;
  if (raw === 'openclaw') return 'openclaw' as const;
  return 'frugal' as const;
}

export async function GET() {
  const provider = resolveProvider();
  return NextResponse.json({
    success: true,
    provider,
    adapters: getAdapterStatuses(),
    ready: getAdapterConfig(provider).enabled && Boolean(getAdapterConfig(provider).baseUrl),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = resolveProvider(body?.provider);
    const prompt = String(body?.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Missing prompt' }, { status: 400 });
    }

    if (provider === 'frugal') {
      const result = await invokeFrugalChat(prompt, { explain: Boolean(body?.explain) });
      const reply = [result?.response || 'NO_RESPONSE', result?.next ? `NEXT // ${result.next}` : '']
        .filter(Boolean)
        .join('\n');
      return NextResponse.json({
        success: true,
        provider,
        reply,
        status: result?.status || 'success',
        mode: result?.mode || null,
        raw: result,
      });
    }

    if (provider === 'ollama') {
      const result = await invokeOllamaChat([
        {
          role: 'system',
          content:
            'You are Clawdbot operating inside Continuity Legacy. Be concise, operational, and use local tool-calling emulation when available.',
        },
        { role: 'user', content: prompt },
      ]);

      return NextResponse.json({
        success: true,
        provider,
        reply:
          result?.message?.content ||
          result?.response ||
          result?.content ||
          'NO_RESPONSE',
        raw: result,
      });
    }

    const result = await forwardBridgePayload(
      provider,
      {
        prompt,
        source: 'continuity-legacy-dashboard',
        toolCalling: 'emulated',
      },
      '',
    );

    return NextResponse.json({
      success: true,
      provider,
      reply:
        result?.reply ||
        result?.message ||
        result?.content ||
        result?.text ||
        JSON.stringify(result),
      raw: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'CHAT_BRIDGE_FAILURE') },
      { status: 500 },
    );
  }
}
