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
let lastEventCache: ChainEvent | null = null;

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getStateHash(): Promise<string> {
  try {
    const stateStr = await fs.readFile(getStateFilePath(), 'utf-8');
    return computeHash(stateStr.trim());
  } catch {
    return '0'.repeat(64);
  }
}

async function readLastEvent(): Promise<ChainEvent | null> {
  if (lastEventCache) return lastEventCache;
  try {
    const content = await fs.readFile(getEventChainFilePath(), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    lastEventCache = JSON.parse(lines[lines.length - 1]) as ChainEvent;
    return lastEventCache;
  } catch {
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

  // Ensure consistent property ordering for JSON hashing
  const deterministicStr = JSON.stringify(eventCore, Object.keys(eventCore).sort());
  const chain_hash = computeHash(deterministicStr);

  const newEvent: ChainEvent = { ...eventCore, chain_hash };

  await fs.appendFile(getEventChainFilePath(), JSON.stringify(newEvent) + '\n', 'utf-8');
  lastEventCache = newEvent;
  return newEvent;
}

export function appendEvent(type: string, payload: unknown): Promise<ChainEvent> {
  const next = appendQueue.then(() => appendEventUnsafe(type, payload));
  appendQueue = next.catch(() => {});
  return next;
}

export async function verifyChain(): Promise<{ intact: boolean; error?: string }> {
  try {
    const content = await fs.readFile(getEventChainFilePath(), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    let expectedParentHash = '0'.repeat(64);
    let expectedInputHash = '0'.repeat(64);
    
    for (let i = 0; i < lines.length; i++) {
      const event = JSON.parse(lines[i]) as ChainEvent;
      
      if (event.seq !== i) return { intact: false, error: `Sequence mismatch at seq ${i}` };
      if (event.parent_hash !== expectedParentHash) return { intact: false, error: `Parent chain broken at seq ${i}` };
      
      // State Transition Verification: input_hash[n] must match output_hash[n-1]
      if (i > 0 && event.input_hash !== expectedInputHash) {
        return { intact: false, error: `State transition tampered at seq ${i}` };
      }
      
      const { chain_hash, ...core } = event;
      const deterministicStr = JSON.stringify(core, Object.keys(core).sort());
      const computed = computeHash(deterministicStr);
      
      if (computed !== chain_hash) return { intact: false, error: `Hash tampered at seq ${i}` };
      
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
    const content = await fs.readFile(getEventChainFilePath(), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    // Only parse the tail we actually return.
    return lines.slice(-limit).map((line) => JSON.parse(line)).reverse();
  } catch {
    return [];
  }
}
