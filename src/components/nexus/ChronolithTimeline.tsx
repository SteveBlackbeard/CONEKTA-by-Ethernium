"use client";
import { useCallback, useEffect, useState } from 'react';
import { DashboardSignals } from '@/lib/telemetry';
import { tt } from '@/lib/i18n';

type TimelineEntry = {
  seq: number;
  type: string;
  timestamp: string;
  chain_hash: string;
  verified: boolean;
  summary: string;
};

type TimelineState = {
  intact: boolean;
  error?: string;
  total: number;
  entries: TimelineEntry[];
};

function formatAge(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return '--';
  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * CHRONOLITH — forensic timeline of the hash-linked EVENT_CHAIN.
 * Only polls while the rail is open; every entry carries its verification
 * state so tampering is visible per event, not just chain-wide.
 */
export function ChronolithTimeline({
  signals,
  dictionary,
  active,
  compact = false,
}: {
  signals: DashboardSignals;
  dictionary: Record<string, string>;
  active: boolean;
  compact?: boolean;
}) {
  const [timeline, setTimeline] = useState<TimelineState | null>(null);
  const [loading, setLoading] = useState(false);
  const palette = signals.palette;

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/chronolith?limit=12');
      const payload = await response.json();
      if (payload?.success) {
        setTimeline({
          intact: Boolean(payload.intact),
          error: payload.error,
          total: Number(payload.total || 0),
          entries: Array.isArray(payload.entries) ? payload.entries : [],
        });
      }
    } catch {
      // Leave the last known timeline in place.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadTimeline();
    const interval = setInterval(() => { void loadTimeline(); }, 10000);
    return () => clearInterval(interval);
  }, [active, loadTimeline]);

  const softText = { color: 'rgba(255,255,255,0.76)' } as const;
  const faintText = { color: 'rgba(255,255,255,0.52)' } as const;
  const entries = timeline?.entries || [];
  const visibleEntries = compact ? entries.slice(0, 4) : entries.slice(0, 8);

  return (
    <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '3px' }}>
          {tt(dictionary, 'chronolith.title', 'CHRONOLITH')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '0.38rem',
              letterSpacing: '1.4px',
              padding: '2px 5px',
              border: `1px solid ${timeline?.intact === false ? palette.warning : palette.border}`,
              color: timeline?.intact === false ? palette.warning : palette.emphasis,
            }}
          >
            {timeline?.intact === false ? 'BREACHED' : 'SEALED'}
          </span>
          <a
            href="/api/chronolith/export"
            download
            className="btn-nexus"
            style={{ padding: '4px 7px', fontSize: '0.38rem', letterSpacing: '1.4px', textDecoration: 'none', display: 'inline-block' }}
          >
            {tt(dictionary, 'chronolith.export', 'EXPORT')}
          </a>
        </div>
      </div>

      <div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '1.6px' }}>
        {tt(dictionary, 'chronolith.events', 'EVENTS')}: {timeline?.total ?? 0}
        {loading ? ' // SYNCING' : ''}
        {timeline?.error ? ` // ${timeline.error}` : ''}
      </div>

      {visibleEntries.length === 0 ? (
        <div style={{ ...faintText, fontSize: '0.44rem', fontStyle: 'italic' }}>
          {tt(dictionary, 'chronolith.empty', 'NO_CHRONICLED_EVENTS')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {visibleEntries.map((entry) => (
            <div
              key={`${entry.seq}-${entry.chain_hash.slice(0, 8)}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '6px',
                alignItems: 'center',
                fontSize: '0.42rem',
                letterSpacing: '1.3px',
                padding: '3px 5px',
                borderLeft: `2px solid ${entry.verified ? palette.secondary : palette.warning}`,
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <span style={{ color: entry.verified ? palette.secondary : palette.warning }}>
                {entry.verified ? '✓' : '✗'}
              </span>
              <span style={{ color: palette.emphasis, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                [{entry.seq}] {entry.type}
              </span>
              <span style={{ ...faintText }}>{formatAge(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
