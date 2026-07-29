import { NextResponse } from 'next/server';
import { listRegisteredSystems, registerLinkedSystem, unregisterLinkedSystem } from '@/lib/linkedSystemsRegistry';
import { requireLocalFilesystemRequest } from '@/lib/filesystemSecurity';
import { getErrorMessage } from '@/lib/errors';

export async function GET(request: Request) {
  const denied = requireLocalFilesystemRequest(request);
  if (denied) return denied;
  return NextResponse.json({ systems: await listRegisteredSystems() });
}

export async function POST(request: Request) {
  const denied = requireLocalFilesystemRequest(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body?.name || !['runtime', 'handle', 'structural'].includes(body.accessMode)) {
      return NextResponse.json({ success: false, error: 'Invalid linked system' }, { status: 400 });
    }
    const system = await registerLinkedSystem(body);
    return NextResponse.json({ success: true, system });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = requireLocalFilesystemRequest(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Missing system id' }, { status: 400 });
  return NextResponse.json({ success: await unregisterLinkedSystem(id) });
}
