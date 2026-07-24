"use client";
import React, { startTransition, useCallback, useState } from 'react';
import SovereignHUD from '@/components/SovereignHUD';
import NexusCore from '@/components/NexusCore';
import { LinkedSystem } from '@/lib/graphData';
import { Language } from '@/lib/i18n';
import { ChainEventSnapshot, ChainStatusSnapshot, StateSnapshot } from '@/lib/telemetry';

function samePhysics(left?: StateSnapshot['physics'], right?: StateSnapshot['physics']) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.H === right.H
    && left.H_max === right.H_max
    && left.eta === right.eta
    && left.N === right.N
    && left.W === right.W
    && left.gini === right.gini;
}

function sameStateSnapshot(left: StateSnapshot | null, right: StateSnapshot | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.merkle_root === right.merkle_root
    && left.drift_kl === right.drift_kl
    && left.crystallizer_version === right.crystallizer_version
    && samePhysics(left.physics, right.physics);
}

function sameChainStatus(left: ChainStatusSnapshot | null, right: ChainStatusSnapshot | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.intact === right.intact && left.error === right.error;
}

function sameChainEvents(left: ChainEventSnapshot[], right: ChainEventSnapshot[]) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    return entry.seq === candidate?.seq
      && entry.type === candidate?.type
      && entry.timestamp === candidate?.timestamp
      && entry.chain_hash === candidate?.chain_hash;
  });
}

// Reschedules a polling callback with backoff on failure. The first fetch
// always runs; subsequent polls pause while the tab is hidden and resume
// immediately when it becomes visible again.
function usePolling(poll: () => Promise<boolean>, baseIntervalMs: number, maxIntervalMs: number) {
  React.useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failureStreak = 0;

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelled) return;
        if (typeof document !== 'undefined' && document.hidden) {
          schedule(baseIntervalMs);
          return;
        }
        void run();
      }, delay);
    };

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      let ok = false;
      try {
        ok = await poll();
      } catch {
        ok = false;
      }
      inFlight = false;
      if (cancelled) return;
      failureStreak = ok ? 0 : Math.min(failureStreak + 1, 4);
      schedule(ok ? baseIntervalMs : Math.min(maxIntervalMs, baseIntervalMs * 2 ** failureStreak));
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void run();
      }
    };

    void run();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [baseIntervalMs, maxIntervalMs, poll]);
}

export default function Home() {
  const [linkedSystems, setLinkedSystems] = useState<LinkedSystem[]>([]);
  const [activeLinkedSystemId, setActiveLinkedSystemId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('EN');
  const [systemState, setSystemState] = useState<StateSnapshot | null>(null);
  const [chainEvents, setChainEvents] = useState<ChainEventSnapshot[]>([]);
  // The page above is capped by the API's limit. This is how many exist.
  const [chainEventTotal, setChainEventTotal] = useState(0);
  const [chainStatus, setChainStatus] = useState<ChainStatusSnapshot | null>(null);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [stateLatencyMs, setStateLatencyMs] = useState<number | null>(null);

  const refreshSystemState = useCallback(() => {
    const startedAt = performance.now();
    return fetch('/api/state')
      .then(r => r.json())
      .then((nextState: StateSnapshot) => {
        setStateLatencyMs(Math.max(1, Math.round(performance.now() - startedAt)));
        startTransition(() => {
          setSystemState((previous) => sameStateSnapshot(previous, nextState) ? previous : nextState);
        });
        return nextState.available !== false;
      })
      .catch(() => {
        setStateLatencyMs(null);
        return false;
      });
  }, []);

  const refreshChainEvents = useCallback(() => {
    return fetch('/api/events')
      .then(r => r.json())
      .then((payload) => {
        const nextEvents = payload.events || [];
        const nextTotal = Number(payload.total ?? nextEvents.length);
        startTransition(() => {
          setChainEvents((previous) => sameChainEvents(previous, nextEvents) ? previous : nextEvents);
          setChainEventTotal((previous) => previous === nextTotal ? previous : nextTotal);
        });
        return true;
      })
      .catch(() => false);
  }, []);

  const refreshChainStatus = useCallback(() => {
    return fetch('/api/events/verify', { method: 'POST' })
      .then(r => r.json())
      .then((nextStatus: ChainStatusSnapshot) => {
        startTransition(() => {
          setChainStatus((previous) => sameChainStatus(previous, nextStatus) ? previous : nextStatus);
        });
        return true;
      })
      .catch(() => false);
  }, []);

  usePolling(refreshSystemState, 3500, 30000);
  usePolling(refreshChainEvents, 7000, 45000);
  usePolling(refreshChainStatus, 18000, 90000);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      <div className="ethernium-dashboard-bg" aria-hidden="true">
        <div className="ethernium-dashboard-bg__shade" />
        <div className="ethernium-dashboard-bg__dots" />
        <div className="ethernium-dashboard-bg__vignette" />
      </div>
      {/* Dynamic 3D Layer */}
      <NexusCore 
        linkedSystems={linkedSystems}
        activeLinkedSystemId={activeLinkedSystemId}
        language={language}
        setLinkedSystems={setLinkedSystems}
        setActiveLinkedSystemId={setActiveLinkedSystemId}
        physics={systemState?.physics}
        drift={systemState?.drift_kl}
        merkle={systemState?.merkle_root}
        chainEvents={chainEvents}
        chainStatus={chainStatus}
        activeCommand={activeCommand}
        stateLatencyMs={stateLatencyMs}
      />

      {/* Primary UI Layer */}
      <SovereignHUD 
        linkedSystems={linkedSystems}
        activeLinkedSystemId={activeLinkedSystemId}
        setLinkedSystems={setLinkedSystems}
        setActiveLinkedSystemId={setActiveLinkedSystemId}
        language={language}
        setLanguage={setLanguage}
        externalState={systemState}
        chainEvents={chainEvents}
        chainEventTotal={chainEventTotal}
        chainStatus={chainStatus}
        setChainStatus={setChainStatus}
        activeCommand={activeCommand}
        setActiveCommand={setActiveCommand}
        refreshChainEvents={refreshChainEvents}
        refreshSystemState={refreshSystemState}
      />

    </main>
  );
}
