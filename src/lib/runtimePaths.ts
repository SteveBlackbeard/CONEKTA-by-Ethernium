// Central resolution of Conekta-owned runtime data.
//
// CONEKTA was extracted from the old monorepo, where runtime artifacts
// (STATE.json, EVENT_CHAIN.jsonl, .github/scripts/*.py) lived one level above
// the dashboard. That parent no longer exists, so every filesystem-facing API
// resolves through this module instead of `process.cwd()/..`.
//
// The runtime root defaults to `<repo>/runtime` and can be pointed at a real
// An operator may relocate it via CONEKTA_RUNTIME_ROOT; doing so never promotes
// that directory to cognitive authority.
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { existsSync, mkdirSync } from 'fs';

let ensuredRoot: string | null = null;

export function getRuntimeRoot(): string {
  const configured = process.env.CONEKTA_RUNTIME_ROOT?.trim();
  const root = configured && configured.length > 0
    ? resolve(configured)
    : join(process.cwd(), 'runtime');

  if (ensuredRoot !== root) {
    try {
      mkdirSync(root, { recursive: true });
      ensuredRoot = root;
    } catch {
      // Leave creation errors to the callers that actually write.
    }
  }
  return root;
}

export function getStateFilePath(): string {
  return join(getRuntimeRoot(), 'STATE.json');
}

export function getEventChainFilePath(): string {
  return join(getRuntimeRoot(), 'EVENT_CHAIN.jsonl');
}

export function getScriptsDir(): string {
  const configured = process.env.CONEKTA_SCRIPTS_DIR?.trim();
  if (configured && configured.length > 0) return resolve(configured);
  return join(getRuntimeRoot(), 'scripts');
}

export function isWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Resolves an untrusted relative path against the runtime root and rejects
 * anything that escapes it (path traversal, absolute paths).
 */
export function resolveWithinRuntimeRoot(untrustedPath: string): string | null {
  if (!untrustedPath || typeof untrustedPath !== 'string') return null;
  const root = getRuntimeRoot();
  const target = isAbsolute(untrustedPath) ? resolve(untrustedPath) : resolve(root, untrustedPath);
  return isWithin(root, target) ? target : null;
}

/**
 * Validates a directory path that the operator explicitly linked (absolute
 * paths are allowed here: linking external project folders is the product's
 * purpose). Returns the resolved path only if it exists.
 */
export function resolveLinkedDirectory(untrustedPath: string): string | null {
  if (!untrustedPath || typeof untrustedPath !== 'string') return null;
  const target = isAbsolute(untrustedPath)
    ? resolve(untrustedPath)
    : resolve(getRuntimeRoot(), untrustedPath);
  return existsSync(target) ? target : null;
}
