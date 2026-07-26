import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { basename, isAbsolute, resolve } from 'path';
import { getErrorMessage } from '@/lib/errors';
import { isWithin, resolveLinkedDirectory, resolveWithinRuntimeRoot } from '@/lib/runtimePaths';

const TEXT_EXTENSIONS = ['.md', '.json', '.py', '.ts', '.tsx', '.yml', '.yaml', '.toml', '.txt', '.css', '.js', '.html', '.ps1'];
const MAX_CONTENT_CHARS = 10000;

export async function POST(request: Request) {
  try {
    const { filePath, systemRoot } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ success: false, error: 'No file path provided' }, { status: 400 });
    }

    // Resolve inside an explicitly linked system root, or inside the runtime
    // root. Anything escaping those boundaries (path traversal) is rejected.
    let fullPath: string | null = null;
    if (systemRoot && typeof systemRoot === 'string') {
      const linkedRoot = resolveLinkedDirectory(systemRoot);
      if (!linkedRoot) {
        return NextResponse.json({ success: false, error: 'Linked system root not found' }, { status: 404 });
      }
      const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(linkedRoot, filePath);
      fullPath = isWithin(linkedRoot, candidate) ? candidate : null;
    } else {
      fullPath = resolveWithinRuntimeRoot(filePath);
    }

    if (!fullPath) {
      return NextResponse.json({ success: false, error: 'Path outside permitted roots' }, { status: 403 });
    }

    const dotIndex = fullPath.lastIndexOf('.');
    const ext = dotIndex >= 0 ? fullPath.slice(dotIndex).toLowerCase() : '';
    if (!TEXT_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ success: false, error: `Binary file type not supported: ${ext || 'unknown'}` }, { status: 400 });
    }

    let content: string;
    try {
      // Operator-linked files are runtime data and must never become build
      // inputs for Next/Turbopack output tracing.
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
