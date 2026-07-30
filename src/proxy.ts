import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasOperatorToken(request: NextRequest) {
  const expected = (process.env.CONEKTA_API_TOKEN || '').trim();
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return Boolean(expected && supplied) && equalSecret(expected, supplied);
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || hasOperatorToken(request) || isSameOrigin(request)) {
    return NextResponse.next();
  }
  return NextResponse.json(
    { success: false, error: 'CONEKTA_MUTATION_ORIGIN_REQUIRED' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const config = { matcher: '/api/:path*' };
