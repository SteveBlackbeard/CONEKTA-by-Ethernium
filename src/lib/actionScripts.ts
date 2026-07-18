import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { appendEvent } from '@/lib/eventChain';
import { getErrorMessage } from '@/lib/errors';
import { getRuntimeRoot, getScriptsDir } from '@/lib/runtimePaths';

const execFilePromise = promisify(execFile);

export interface ActionScriptSpec {
  scriptName: string;
  eventType: string;
  eventPayload: Record<string, unknown>;
  successMessage: string;
}

/**
 * Runs a Continuity runtime script if it is installed under the scripts dir.
 * A standalone CONEKTA install has no runtime scripts, so the honest answer
 * there is 501 SCRIPT_NOT_AVAILABLE instead of a failed exec against a path
 * that never existed.
 */
export async function runActionScript(spec: ActionScriptSpec): Promise<NextResponse> {
  try {
    const scriptPath = join(getScriptsDir(), spec.scriptName);

    if (!existsSync(scriptPath)) {
      return NextResponse.json({
        success: false,
        error: 'SCRIPT_NOT_AVAILABLE',
        detail: `Runtime script not installed: ${spec.scriptName}. Set CONEKTA_SCRIPTS_DIR or place it under the runtime root.`,
      }, { status: 501 });
    }

    const { stdout, stderr } = await execFilePromise('python', [scriptPath], { cwd: getRuntimeRoot() });

    if (stderr && !stderr.toLowerCase().includes('warning')) {
      return NextResponse.json({ success: false, error: stderr }, { status: 500 });
    }

    await appendEvent(spec.eventType, spec.eventPayload);

    return NextResponse.json({
      success: true,
      message: spec.successMessage,
      output: stdout,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
