"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { LinkedSystem } from '@/lib/graphData';
import { ChainEventSnapshot, DashboardSignals, PhysicsSnapshot } from '@/lib/telemetry';
import { translateModeLabel, translateReason, translateSeverity, translateTrust, tt } from '@/lib/i18n';
import { QualityTier } from './types';
import { ChronolithTimeline } from './ChronolithTimeline';

// SOVEREIGN SIDE RAIL
export function WaveMonitor({
  drift,
  eta,
  merkle,
  logs,
  chainEvents,
  signals,
  sessionStart,
  dictionary,
  physics,
  linkedSystems,
  primaryLinkedSystem,
  activeVectorText,
  qualityTier,
  audioArmed,
  reducedMotion,
  open,
  onToggle,
  stateLatencyMs,
}: {
  drift: number;
  eta: number;
  merkle: string;
  logs: { id: number; msg: string }[];
  chainEvents: ChainEventSnapshot[];
  signals: DashboardSignals;
  sessionStart: number;
  dictionary: Record<string, string>;
  physics: PhysicsSnapshot;
  linkedSystems: LinkedSystem[];
  primaryLinkedSystem: LinkedSystem | null;
  activeVectorText: string;
  qualityTier: QualityTier;
  audioArmed: boolean;
  reducedMotion: boolean;
  open: boolean;
  onToggle: () => void;
  stateLatencyMs: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1440);
  const normalizedEta = Math.max(0, Math.min(1, eta));
  const quadrantSync = Math.max(0, Math.min(100, normalizedEta * 100));
  const latencyLabel = stateLatencyMs === null ? '--' : `${stateLatencyMs}ms`;
  const palette = signals.palette;
  const latestChainEvent = chainEvents[0];
  const syncColor = quadrantSync < 80 ? palette.warning : quadrantSync < 92 ? palette.secondary : palette.emphasis;
  const glowText = { color: palette.emphasis, textShadow: `0 0 18px ${palette.secondary}22` } as const;
  const softText = { color: 'rgba(255,255,255,0.76)', textShadow: `0 0 12px ${palette.secondary}18` } as const;
  const faintText = { color: 'rgba(255,255,255,0.52)' } as const;
  const isTablet = viewportWidth < 1180;
  const isPhone = viewportWidth < 780;
  const railTop = isPhone ? 104 : isTablet ? 132 : 148;
  const railBottom = isPhone ? 14 : 18;
  const tabWidth = isPhone ? 34 : 38;
  const railWidth = isPhone ? 220 : isTablet ? 252 : 286;
  const canvasHeight = isPhone ? 84 : isTablet ? 96 : 112;
  const canvasWidth = isPhone ? 188 : isTablet ? 214 : 248;
  const modeLabelText = translateModeLabel(signals.modeLabel, dictionary);
  const modeReasonText = translateReason(signals.modeReason, dictionary);
  const chainTrustText = translateTrust(signals.chainTrustLabel, dictionary);
  const severityText = translateSeverity(signals.severityLabel, dictionary);
  const entropyBars = useMemo(
    () => Array.from({ length: 14 }, (_, index) => Math.abs(Math.sin(elapsedSeconds * 0.22 + index * 0.78 + physics.eta * 2.8))),
    [elapsedSeconds, physics.eta],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((Date.now() - sessionStart) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    // The waveform canvas is hidden while the rail is collapsed; skip the
    // animation loop entirely instead of burning frames off-screen.
    if (!open) return;
    let frame = 0;
    let disposed = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const render = () => {
      if (disposed) return;
      const liveCanvas = canvasRef.current;
      if (!liveCanvas) return;
      const { width, height } = liveCanvas;
      ctx.clearRect(0, 0, width, height);
      const t = Date.now() / 1000;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.strokeStyle = signals.mode === 'INCIDENT' ? palette.warning : palette.secondary;
      ctx.lineWidth = 3.5;
      ctx.shadowBlur = 18;
      ctx.shadowColor = palette.secondary;
      ctx.globalAlpha = 0.18;
      for (let x = 0; x < width; x++) {
        const field = Math.sin(x * 0.045 + t * 1.3) * (height * 0.18) + Math.cos(x * 0.012 - t * 0.86) * (6 + drift * 12);
        const y = height * 0.5 + field;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = palette.emphasis;
      ctx.lineWidth = 2.2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = palette.emphasis;
      ctx.globalAlpha = 0.88;
      for (let x = 0; x < width; x++) {
        const wobble = Math.sin(x * 0.08 + t * 4.2) * (8 + eta * 10);
        const noise = Math.cos(x * 0.03 - t * 1.4) * drift * 8;
        const y = height * 0.5 + wobble + noise;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22;
      for (let x = 0; x < width; x++) {
        const y = height * 0.5 + Math.cos(x * (0.06 + eta * 0.03) + t * 3.2) * (5 + eta * 6);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (!disposed) frame = requestAnimationFrame(render);
    };

    render();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [drift, eta, open, palette.emphasis, palette.line, palette.secondary, palette.warning, signals.mode]);

  return (
    <div style={{ position: 'absolute', top: railTop, right: 0, bottom: railBottom, width: railWidth + tabWidth, zIndex: 500, pointerEvents: 'none' }}>
      <button
        onClick={onToggle}
        className="btn-nexus"
        style={{
          position: 'absolute',
          right: railWidth - 1,
          top: '50%',
          transform: 'translateY(-50%)',
          transformOrigin: 'center',
          pointerEvents: 'auto',
          writingMode: 'vertical-lr',
          padding: isPhone ? '10px 7px' : '12px 8px',
          fontSize: '0.46rem',
          letterSpacing: '3px',
          minWidth: `${tabWidth - 6}px`,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: '10px',
          borderBottomRightRadius: '10px',
          boxShadow: '0 12px 26px rgba(0,0,0,0.2)',
        }}
      >
        {open ? tt(dictionary, 'common.hide', 'HIDE') : tt(dictionary, 'common.open', 'OPEN')}
      </button>

      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: railWidth,
          transform: open ? 'translateX(0)' : `translateX(${railWidth + 24}px)`,
          transition: 'transform 0.34s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: open ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: isPhone ? '8px' : '10px',
          padding: isPhone ? '10px' : '12px',
          border: `1px solid ${palette.border}`,
          background: palette.panel,
          boxShadow: '0 18px 54px rgba(0,0,0,0.22)',
          overflowY: 'auto',
        }}
        className="hide-scrollbar"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div style={{ ...glowText, fontSize: isPhone ? '0.54rem' : '0.62rem', letterSpacing: '3px', fontWeight: 800 }}>{modeLabelText}</div>
            <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px', lineHeight: 1.4, marginTop: '4px' }}>{modeReasonText}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '10px', textAlign: 'right' }}>
            <div>
              <div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>{tt(dictionary, 'common.sync', 'SYNC')}</div>
              <div style={{ color: syncColor, fontSize: '0.62rem', fontWeight: 800 }}>{quadrantSync.toFixed(0)}%</div>
            </div>
            <div>
              <div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>{tt(dictionary, 'common.trust', 'TRUST')}</div>
              <div style={{ ...glowText, fontSize: '0.62rem', fontWeight: 800 }}>{chainTrustText}</div>
            </div>
            <div>
              <div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>{tt(dictionary, 'common.load', 'LOAD')}</div>
              <div style={{ ...glowText, fontSize: '0.62rem', fontWeight: 800 }}>{Math.round(signals.activity * 100)}%</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} style={{ width: '100%', height: `${canvasHeight}px`, border: `1px solid ${palette.border}`, background: 'rgba(255,255,255,0.015)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={{ ...faintText, fontSize: '0.42rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.wave.system_uptime', 'SYSTEM_UP_TIME')}</div>
              <div style={{ ...glowText, fontSize: '0.92rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{elapsedSeconds.toFixed(0)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...faintText, fontSize: '0.42rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.wave.latency', 'LATENCY')}</div>
              <div style={{ ...glowText, fontSize: '0.8rem', fontWeight: 800 }}>{latencyLabel}</div>
            </div>
          </div>
        </div>

        <div style={{ paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '3px', marginBottom: '8px' }}>{tt(dictionary, 'core.context_entropy_bars', 'CONTEXT_ENTROPY_BARS')}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '26px' }}>
            {entropyBars.map((value, index) => (
              <div
                key={`rail-entropy-${index}`}
                style={{
                  width: index % 3 === 0 ? '6px' : '5px',
                  height: `${Math.max(6, value * 26)}px`,
                  background: index % 4 === 0 ? palette.accent : palette.emphasis,
                  opacity: 0.2 + value * 0.56,
                  borderRadius: '999px',
                  boxShadow: `0 0 12px ${index % 4 === 0 ? palette.accent : palette.emphasis}22`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginTop: '10px' }}>
            <div><div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>REQUESTS</div><div style={{ ...glowText, fontSize: '0.68rem', fontWeight: 700 }}>{physics.N}</div></div>
            <div><div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>BYPASS</div><div style={{ ...glowText, fontSize: '0.68rem', fontWeight: 700 }}>{(physics.eta * 100).toFixed(1)}%</div></div>
            <div><div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>L3/L4</div><div style={{ ...glowText, fontSize: '0.68rem', fontWeight: 700 }}>{physics.H}</div></div>
            <div><div style={{ ...faintText, fontSize: '0.4rem', letterSpacing: '2px' }}>P95</div><div style={{ ...glowText, fontSize: '0.68rem', fontWeight: 700 }}>{physics.W ? `${physics.W}ms` : '--'}</div></div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.active_system', 'ACTIVE_SYSTEM')}: {primaryLinkedSystem?.name || tt(dictionary, 'common.idle', 'IDLE')}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.link_mode', 'LINK_MODE')}: {primaryLinkedSystem ? tt(dictionary, `hud.access.${primaryLinkedSystem.accessMode || 'runtime'}`, (primaryLinkedSystem.accessMode || 'runtime').toUpperCase()) : tt(dictionary, 'common.idle', 'IDLE')}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.system_count', 'SYSTEM_COUNT')}: {linkedSystems.length}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.active_vector', 'ACTIVE_VECTOR')}: {activeVectorText}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'common.severity', 'SEVERITY')}: {severityText}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.wave.merkle_log', 'MERKLE_LOG')}: {merkle.slice(0, 10).toUpperCase()}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.audio_bus', 'AUDIO_BUS')}: {audioArmed ? tt(dictionary, 'core.audio.armed', 'ARMED') : tt(dictionary, 'core.audio.standby', 'STANDBY')} {'//'} {tt(dictionary, 'core.motion', 'MOTION')}: {reducedMotion ? tt(dictionary, 'core.motion.reduced', 'REDUCED') : tt(dictionary, 'core.motion.full', 'FULL')}</div>
          <div style={{ ...softText, fontSize: '0.46rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.quality_profile', 'QUALITY_PROFILE')}: {qualityTier.toUpperCase()}</div>
          {latestChainEvent && <div style={{ color: palette.accent, fontSize: '0.44rem', letterSpacing: '2px' }}>{tt(dictionary, 'core.recent_chain_event', 'RECENT_CHAIN_EVENT')}: {latestChainEvent.type}</div>}
        </div>

        <ChronolithTimeline signals={signals} dictionary={dictionary} active={open} compact={isPhone} />

        <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ ...softText, fontSize: '0.44rem', letterSpacing: '3px' }}>{tt(dictionary, 'core.wave.event_chain_stream', 'EVENT_CHAIN_STREAM')}</div>
          {logs.slice(0, 2).map((log) => (
            <div key={log.id} style={{ color: palette.secondary, fontSize: '0.46rem', letterSpacing: '1.4px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {log.msg}
            </div>
          ))}
          {logs.length === 0 && <div style={{ ...faintText, fontSize: '0.44rem', fontStyle: 'italic' }}>{tt(dictionary, 'core.wave.stream_idle', 'STREAM_IDLE')}</div>}
        </div>
      </div>
    </div>
  );
}
