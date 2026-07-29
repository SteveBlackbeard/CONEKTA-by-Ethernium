import { NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getErrorMessage } from '@/lib/errors';
import { resolveLinkedDirectory } from '@/lib/runtimePaths';
import { appendEvent } from '@/lib/eventChain';
import { requireLocalFilesystemRequest } from '@/lib/filesystemSecurity';

const EXCLUDE = ['.git', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'dist', '.next', '.egg-info'];

export async function POST(request: Request) {
  const denied = requireLocalFilesystemRequest(request);
  if (denied) return denied;
  try {
    const { projectPath } = await request.json();

    if (!projectPath || typeof projectPath !== 'string') {
      return NextResponse.json({ success: false, error: 'No project path provided' }, { status: 400 });
    }

    const resolvedRoot = resolveLinkedDirectory(projectPath);
    if (!resolvedRoot) {
      return NextResponse.json({ success: false, error: `Directory not found: ${projectPath}` }, { status: 404 });
    }
    if (!statSync(resolvedRoot).isDirectory()) {
      return NextResponse.json({ success: false, error: `Not a directory: ${projectPath}` }, { status: 400 });
    }

    const entries: { name: string; type: 'file' | 'dir'; size?: number }[] = [];
    try {
      const items = readdirSync(resolvedRoot);
      for (const item of items) {
        if (EXCLUDE.some(ex => item.includes(ex))) continue;
        if (item.startsWith('.')) continue;

        const fullPath = join(resolvedRoot, item);
        try {
          const stats = statSync(fullPath);
          entries.push({
            name: item,
            type: stats.isDirectory() ? 'dir' : 'file',
            size: stats.isDirectory() ? undefined : stats.size,
          });
        } catch {
          // Skip inaccessible files
        }
      }
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: `Cannot read directory: ${getErrorMessage(err)}` }, { status: 500 });
    }

    // Chronolith: record the scan as a forensic event.
    await appendEvent('SYSTEM_SCAN', {
      rootPath: resolvedRoot,
      entryCount: entries.length,
    }).catch(() => {});

    return NextResponse.json({ success: true, entries, rootPath: resolvedRoot });

  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
