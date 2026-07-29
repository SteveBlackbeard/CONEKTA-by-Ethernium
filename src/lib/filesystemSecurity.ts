import { NextResponse } from 'next/server';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function requireLocalFilesystemRequest(request: Request): NextResponse | null {
  if (process.env.CONEKTA_ALLOW_REMOTE_FILESYSTEM === 'true') return null;

  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || request.headers.get('host') || new URL(request.url).host;
  const hostname = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0];

  if (LOOPBACK_HOSTS.has(hostname.toLowerCase())) return null;
  return NextResponse.json(
    {
      success: false,
      error: 'Filesystem operations are local-only. Set CONEKTA_ALLOW_REMOTE_FILESYSTEM=true only behind trusted authentication.',
    },
    { status: 403 },
  );
}
