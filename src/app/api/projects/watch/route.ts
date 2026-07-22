import { NextRequest, NextResponse } from 'next/server';
import chokidar from 'chokidar';
import path from 'path';
import { resolveLinkedDirectory } from '@/lib/runtimePaths';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const projectPath = req.nextUrl.searchParams.get('path');

  if (!projectPath) {
    return new NextResponse('Missing project path', { status: 400 });
  }

  const absolutePath = resolveLinkedDirectory(projectPath);
  if (!absolutePath) {
    return new NextResponse('Project path not found', { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const watcher = chokidar.watch(absolutePath, {
        persistent: true,
        ignoreInitial: true,
        depth: 1, // Only watch top-level for performance
      });

      // Named SSE events so the client can subscribe via addEventListener.
      const sendEvent = (event: string, data: Record<string, string>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      watcher
        .on('add', (filePath) => sendEvent('add', { name: path.basename(filePath), type: 'file' }))
        .on('addDir', (dirPath) => sendEvent('add', { name: path.basename(dirPath), type: 'dir' }))
        .on('unlink', (filePath) => sendEvent('unlink', { name: path.basename(filePath) }))
        .on('unlinkDir', (dirPath) => sendEvent('unlink', { name: path.basename(dirPath) }))
        .on('change', (filePath) => sendEvent('change', { name: path.basename(filePath) }));

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        void watcher.close();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
