import { NextResponse } from 'next/server';
import { invokeFrugalGet } from '@/lib/localAdapters';
import { getErrorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

type FrugalTelemetry = {
  schema?: string;
  source?: string;
  routing?: Record<'total' | 'l1' | 'l2' | 'l3' | 'l4' | 'bypass_ratio', number>;
  latency_ms?: { p50?: number | null; p95?: number | null; sample_count?: number };
  mcp?: { connected_servers?: number; configured_servers?: number };
};

export async function GET() {
  try {
    const telemetry = await invokeFrugalGet<FrugalTelemetry>('/telemetry');
    const routing: Partial<NonNullable<FrugalTelemetry['routing']>> = telemetry.routing || {};
    const total = Math.max(0, Number(routing.total || 0));
    const neural = Math.max(0, Number(routing.l3 || 0) + Number(routing.l4 || 0));
    return NextResponse.json({
      available: true,
      source: telemetry.source || 'frugal',
      schema: telemetry.schema || 'ethernium.telemetry.snapshot/1',
      merkle_root: 'not_exposed_by_frugal_telemetry',
      last_check: new Date().toISOString(),
      physics: {
        H: neural,
        H_max: total,
        eta: Math.max(0, Math.min(1, Number(routing.bypass_ratio || 0))),
        N: total,
        W: Number(telemetry.latency_ms?.p95 || 0),
        gini: Number(telemetry.mcp?.connected_servers || 0),
      },
      drift_kl: null,
      drift_available: false,
      routing,
      latency_ms: telemetry.latency_ms || {},
      mcp: telemetry.mcp || {},
    });
  } catch (error: unknown) {
    return NextResponse.json({
      available: false,
      source: 'frugal',
      error: getErrorMessage(error, 'FRUGAL_TELEMETRY_UNAVAILABLE'),
      merkle_root: 'not_available',
      last_check: new Date().toISOString(),
      physics: { H: 0, H_max: 0, eta: 0, N: 0, W: 0, gini: 0 },
      drift_kl: null,
      drift_available: false,
      routing: { total: 0, l1: 0, l2: 0, l3: 0, l4: 0, bypass_ratio: 0 },
      latency_ms: {},
      mcp: {},
    });
  }
}
