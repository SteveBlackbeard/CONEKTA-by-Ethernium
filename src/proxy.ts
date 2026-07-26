import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasOperatorToken(request: NextRequest) {
  const expected = (process.env.CONEKTA_API_TOKEN || '').trim();
  if (!expected) return false;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return Boolean(supplied) && equalSecret(expected, supplied);
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

/**
 * Local API mutation boundary.
 *
 * Browsers must originate mutations from this exact Conekta origin. Headless
 * operators may instead provide CONEKTA_API_TOKEN as a bearer credential.
 */
export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();
  if (hasOperatorToken(request) || isSameOrigin(request)) return NextResponse.next();

  return NextResponse.json(
    { success: false, error: 'CONEKTA_MUTATION_ORIGIN_REQUIRED' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const config = {
  matcher: '/api/:path*',
};
