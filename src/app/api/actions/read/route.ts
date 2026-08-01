import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { basename } from 'path';
import { getErrorMessage } from '@/lib/errors';
import { resolveWithinRuntimeRoot } from '@/lib/runtimePaths';
import { resolveRegisteredSystemFile } from '@/lib/linkedSystemsRegistry';
import { requireLocalFilesystemRequest } from '@/lib/filesystemSecurity';

const TEXT_EXTENSIONS = ['.md', '.json', '.py', '.ts', '.tsx', '.yml', '.yaml', '.toml', '.txt', '.css', '.js', '.html', '.ps1'];
const MAX_CONTENT_CHARS = 10000;

export async function POST(request: Request) {
  const denied = requireLocalFilesystemRequest(request);
  if (denied) return denied;
  try {
    const { filePath, systemId } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ success: false, error: 'No file path provided' }, { status: 400 });
    }

    // Resolve inside an explicitly linked system root, or inside the runtime
    // root. Anything escaping those boundaries (path traversal) is rejected.
    let fullPath: string | null = null;
    if (systemId && typeof systemId === 'string') {
      fullPath = await resolveRegisteredSystemFile(systemId, filePath);
    } else {
      fullPath = resolveWithinRuntimeRoot(filePath);
    }

    if (!fullPath) {
      return NextResponse.json({ success: false, error: 'Path outside registered roots' }, { status: 403 });
    }

    const dotIndex = fullPath.lastIndexOf('.');
    const ext = dotIndex >= 0 ? fullPath.slice(dotIndex).toLowerCase() : '';
    if (!TEXT_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ success: false, error: `Binary file type not supported: ${ext || 'unknown'}` }, { status: 400 });
    }

    let content: string;
    try {
      // This path is selected at runtime only after the registered-root and
      // loopback checks above. It is not a build dependency and must not widen
      // Next's output trace to the whole checkout.
      content = await fs.readFile(/* turbopackIgnore: true */ fullPath, 'utf-8');
    } catch {
      return NextResponse.json({ success: false, error: `File not found: ${basename(fullPath)}` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      fileName: basename(fullPath),
      content: content.substring(0, MAX_CONTENT_CHARS),
      truncated: content.length > MAX_CONTENT_CHARS,
    });

  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
