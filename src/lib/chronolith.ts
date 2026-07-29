// CHRONOLITH — the forensic chronicler.
//
// Reads the hash-linked EVENT_CHAIN and presents it as a verifiable timeline:
// every entry carries a per-event verification flag derived from a full
// chain re-verification, and the auditable export is itself digest-sealed so
// a copy can be checked for tampering offline.
import crypto from 'crypto';
import { ChainEvent, ChainVerification, getEventSnapshot, verifyEventSnapshot } from '@/lib/eventChain';
import { getRuntimeRoot } from '@/lib/runtimePaths';

export interface TimelineEntry {
  seq: number;
  type: string;
  timestamp: string;
  chain_hash: string;
  parent_hash: string;
  /** true when the chain is verified up to and including this event */
  verified: boolean;
  /** compact, display-safe view of the payload */
  summary: string;
}

export interface ChronolithTimeline {
  intact: boolean;
  error?: string;
  brokenAtSeq?: number;
  total: number;
  entries: TimelineEntry[];
  generated_at: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
  return String(value);
}

function summarizePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload.slice(0, 120);
  if (typeof payload !== 'object') return String(payload).slice(0, 120);
  const parts = Object.entries(payload as Record<string, unknown>)
    .slice(0, 4)
    // String(value) on a nested object yields "[object Object]" — a summary
    // that tells the reader nothing. JSON-encode non-primitives instead.
    // Latent until a payload nests, which is exactly when the summary matters.
    .map(([key, value]) => `${key}=${formatValue(value).slice(0, 48)}`);
  return parts.join(' // ').slice(0, 160);
}

function isEventVerified(event: ChainEvent, verification: ChainVerification): boolean {
  if (verification.intact) return true;
  if (typeof verification.brokenAtSeq !== 'number') return false;
  return event.seq < verification.brokenAtSeq;
}

/** Newest-first timeline with per-event verification flags. */
export async function getTimeline(limit = 20): Promise<ChronolithTimeline> {
  const events = await getEventSnapshot();
  const verification = verifyEventSnapshot(events);

  const entries = events
    .slice(-Math.max(1, limit))
    .reverse()
    .map((event) => ({
      seq: event.seq,
      type: event.type,
      timestamp: event.timestamp,
      chain_hash: event.chain_hash,
      parent_hash: event.parent_hash,
      verified: isEventVerified(event, verification),
      summary: summarizePayload(event.payload),
    }));

  return {
    intact: verification.intact,
    error: verification.error,
    brokenAtSeq: verification.brokenAtSeq,
    total: events.length,
    entries,
    generated_at: new Date().toISOString(),
  };
}

export interface ChronolithExport {
  chronolith_export: 1;
  generated_at: string;
  runtime_root: string;
  verification: ChainVerification;
  total_events: number;
  chain: ChainEvent[];
  /** sha256 over the canonical JSON of `chain` — verify a copy offline. */
  export_digest: string;
}

/** Full auditable history: the raw chain plus verification and a seal digest. */
export async function exportHistory(): Promise<ChronolithExport> {
  const events = await getEventSnapshot();
  const verification = verifyEventSnapshot(events);
  const chainJson = JSON.stringify(events);
  const exportDigest = crypto.createHash('sha256').update(chainJson).digest('hex');

  return {
    chronolith_export: 1,
    generated_at: new Date().toISOString(),
    runtime_root: getRuntimeRoot(),
    verification,
    total_events: events.length,
    chain: events,
    export_digest: exportDigest,
  };
}
