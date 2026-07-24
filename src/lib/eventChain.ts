import { promises as fs } from 'fs';
import crypto from 'crypto';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { getEventChainFilePath, getStateFilePath } from '@/lib/runtimePaths';

export interface ChainEvent {
  seq: number;
  type: string;
  timestamp: string;
  input_hash: string;
  output_hash: string;
  parent_hash: string;
  payload: unknown;
  chain_hash: string;
}

// Serializes appends so two concurrent actions can't read the same tail and
// duplicate a sequence number.
let appendQueue: Promise<unknown> = Promise.resolve();
// Tail cache, guarded by the file size observed when it was populated. If the
// chain is rotated, truncated, or the runtime root changes underneath us, the
// size no longer matches and we re-read instead of appending onto a stale seq.
let lastEventCache: ChainEvent | null = null;
let lastEventCacheSize = -1;

// Same size-guard, applied to the whole-file readers. verifyChain, getEvents
// and getEventCount each re-read and re-split the entire chain, and with
// polling at 7s/18s plus a Seneschal context per message that is several O(n)
// reads per cycle over a log that only grows. The guard is the file size: if
// it has not changed, the lines cannot have.
let linesCache: string[] | null = null;
let linesCacheSize = -1;

async function readChainLines(): Promise<string[]> {
  let size = -1;
  try {
    size = (await fs.stat(getEventChainFilePath())).size;
  } catch {
    linesCache = null;
    linesCacheSize = -1;
    return [];
  }
  if (linesCache && size === linesCacheSize) return linesCache;
  try {
    const content = await fs.readFile(getEventChainFilePath(), 'utf-8');
    linesCache = content.trim().split('\n').filter(Boolean);
    linesCacheSize = size;
    return linesCache;
  } catch {
    linesCache = null;
    linesCacheSize = -1;
    return [];
  }
}

/** Drop the cache after a write, so the next read sees the new tail. */
function invalidateLinesCache(): void {
  linesCache = null;
  linesCacheSize = -1;
}

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Canonical JSON: object keys sorted recursively, so the same logical value
 * always produces the same string.
 *
 * NOTE: do not replace this with `JSON.stringify(value, Object.keys(value).sort())`.
 * An array replacer is a *recursive key allowlist*, not a sort order — nested
 * payload keys are absent from the top-level key list, so payloads serialized
 * to `{}` and were silently excluded from the chain hash, letting anyone edit
 * event payloads without breaking verification.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`);
  return `{${entries.join(',')}}`;
}

async function getStateHash(): Promise<string> {
  try {
    const stateStr = await fs.readFile(getStateFilePath(), 'utf-8');
    return computeHash(stateStr.trim());
  } catch {
    return '0'.repeat(64);
  }
}

async function currentChainSize(): Promise<number> {
  try {
    return (await fs.stat(getEventChainFilePath())).size;
  } catch {
    return -1;
  }
}

async function readLastEvent(): Promise<ChainEvent | null> {
  const size = await currentChainSize();
  if (lastEventCache && size === lastEventCacheSize) return lastEventCache;

  if (size <= 0) {
    lastEventCache = null;
    lastEventCacheSize = size;
    return null;
  }

  try {
    const content = await fs.readFile(getEventChainFilePath(), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      lastEventCache = null;
      lastEventCacheSize = size;
      return null;
    }
    lastEventCache = JSON.parse(lines[lines.length - 1]) as ChainEvent;
    lastEventCacheSize = size;
    return lastEventCache;
  } catch {
    lastEventCache = null;
    lastEventCacheSize = -1;
    return null;
  }
}

async function appendEventUnsafe(type: string, payload: unknown): Promise<ChainEvent> {
  const lastEvent = await readLastEvent();
  const seq = lastEvent ? lastEvent.seq + 1 : 0;
  const parent_hash = lastEvent ? lastEvent.chain_hash : '0'.repeat(64);
  const previous_output_hash = lastEvent ? lastEvent.output_hash : '0'.repeat(64);

  const timestamp = new Date().toISOString();
  const output_hash = await getStateHash();

  const eventCore = {
    seq,
    type,
    timestamp,
    input_hash: seq === 0 ? output_hash : previous_output_hash,
    output_hash,
    parent_hash,
    payload
  };

  const chain_hash = computeHash(canonicalize(eventCore));

  const newEvent: ChainEvent = { ...eventCore, chain_hash };

  await fs.appendFile(getEventChainFilePath(), JSON.stringify(newEvent) + '\n', 'utf-8');
  lastEventCache = newEvent;
  lastEventCacheSize = await currentChainSize();
  // The file just grew: the readers' cached lines are now one event short.
  invalidateLinesCache();
  return newEvent;
}

export function appendEvent(type: string, payload: unknown): Promise<ChainEvent> {
  const next = appendQueue.then(() => appendEventUnsafe(type, payload));
  appendQueue = next.catch(() => {});
  return next;
}

export interface ChainVerification {
  intact: boolean;
  error?: string;
  /** First sequence number where the chain breaks, when not intact. */
  brokenAtSeq?: number;
}

export async function verifyChain(): Promise<ChainVerification> {
  try {
    const lines = await readChainLines();

    let expectedParentHash = '0'.repeat(64);
    let expectedInputHash = '0'.repeat(64);

    for (let i = 0; i < lines.length; i++) {
      const event = JSON.parse(lines[i]) as ChainEvent;

      if (event.seq !== i) return { intact: false, error: `Sequence mismatch at seq ${i}`, brokenAtSeq: i };
      if (event.parent_hash !== expectedParentHash) return { intact: false, error: `Parent chain broken at seq ${i}`, brokenAtSeq: i };

      // State Transition Verification: input_hash[n] must match output_hash[n-1]
      if (i > 0 && event.input_hash !== expectedInputHash) {
        return { intact: false, error: `State transition tampered at seq ${i}`, brokenAtSeq: i };
      }

      const { chain_hash, ...core } = event;
      const computed = computeHash(canonicalize(core));

      if (computed !== chain_hash) return { intact: false, error: `Hash tampered at seq ${i}`, brokenAtSeq: i };

      expectedParentHash = chain_hash;
      expectedInputHash = event.output_hash;
    }

    return { intact: true };
  } catch (error: unknown) {
    if (getErrorCode(error) === 'ENOENT') return { intact: true }; // Empty is intact
    return { intact: false, error: getErrorMessage(error) };
  }
}

export async function getEvents(limit = 10): Promise<ChainEvent[]> {
  try {
    const lines = await readChainLines();
    // Only parse the tail we actually return.
    return lines.slice(-limit).map((line) => JSON.parse(line)).reverse();
  } catch {
    return [];
  }
}

/**
 * How many events the chain actually holds.
 *
 * `getEvents(n).length` is a page size, never a count: with 9 events and a
 * limit of 5 it returns 5. seneschal.ts reported that 5 as EVENTOS_RECIENTES,
 * so a module named after an honest steward told a false number. Callers that
 * need the quantity use this; those that need the latest few use getEvents.
 * Counting lines avoids parsing the whole file.
 */
export async function getEventCount(): Promise<number> {
  try {
    return (await readChainLines()).length;
  } catch {
    return 0;
  }
}
