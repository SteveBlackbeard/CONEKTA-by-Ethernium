// SENESCHAL — the ecosystem steward.
//
// Operator agent behind CONEKTA's chat rail. Frugal philosophy: operational
// intents (status, chain verification, recent events) resolve locally and
// deterministically (L1) with zero LLM cost; everything else is forwarded to
// the Ethernium Frugal bridge enriched with real ecosystem context.
import { promises as fs } from 'fs';
import { appendEvent, getEvents, getEventCount, verifyChain, ChainEvent } from '@/lib/eventChain';
import { getAdapterConfig, getAdapterStatuses, invokeFrugalChat } from '@/lib/localAdapters';
import { getErrorMessage } from '@/lib/errors';
import { getRuntimeRoot, getScriptsDir, getStateFilePath } from '@/lib/runtimePaths';

export type SeneschalSource = 'local' | 'frugal';

export interface SeneschalReply {
  reply: string;
  source: SeneschalSource;
  intent: string;
  status: 'success' | 'degraded';
  raw?: unknown;
}

interface EcosystemContext {
  stateAvailable: boolean;
  merkleRoot: string;
  driftKl: number;
  eta: number;
  chainIntact: boolean;
  chainError?: string;
  /** Where verifyChain found the break, so "when did it break?" is answerable. */
  chainBrokenAtSeq?: number;
  eventCount: number;
  latestEvents: ChainEvent[];
  /** A wider slice than latestEvents, for temporal questions over the chain. */
  recentWindow: ChainEvent[];
  runtimeRoot: string;
  scriptsDir: string;
  /** Which scripted actions are actually runnable; the rest would 501. */
  actionsAvailable: Record<string, boolean>;
  frugalConfigured: boolean;
}

// The scripts each action shells out to. scriptsDir was collected into the
// context and never read — a dead field on a steward that could not answer
// "will AUDIT work?". Checking existence turns it into a real answer.
const ACTION_SCRIPTS: Record<string, string> = {
  AUDIT: 'audit_comparison.py',
  CRYSTALLIZE: 'crystalize.py',
  SEAL: 'setup_guardian.py',
};

async function probeActions(scriptsDir: string): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    Object.entries(ACTION_SCRIPTS).map(async ([action, script]) => {
      try {
        await fs.access(`${scriptsDir}/${script}`);
        return [action, true] as const;
      } catch {
        return [action, false] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function buildEcosystemContext(): Promise<EcosystemContext> {
  let stateAvailable = false;
  let merkleRoot = 'awaiting_crystallization';
  let driftKl = 0;
  let eta = 0;
  try {
    const raw = await fs.readFile(getStateFilePath(), 'utf-8');
    const state = JSON.parse(raw);
    stateAvailable = true;
    merkleRoot = String(state.merkle_root || merkleRoot);
    driftKl = Number(state.drift_kl || 0);
    eta = Number(state.physics?.eta || 0);
  } catch {
    // No crystallized state — normal for a standalone install.
  }

  const chain = await verifyChain();
  // One read serves both: the 5 shown in status and the wider window temporal
  // questions need. readChainLines caches, so this is not an extra disk hit.
  const recentWindow = await getEvents(200);
  const latestEvents = recentWindow.slice(0, 5);
  // The real total, not the page. latestEvents is capped at 5, so its length
  // reported EVENTOS_RECIENTES: 5 when the chain held 9 — the exact telemetry
  // lie the audit flagged, in the module named after an honest steward.
  const eventTotal = await getEventCount();
  const scriptsDir = getScriptsDir();
  const actionsAvailable = await probeActions(scriptsDir);
  const frugal = getAdapterConfig('frugal');

  return {
    stateAvailable,
    merkleRoot,
    driftKl,
    eta,
    chainIntact: chain.intact,
    chainError: chain.error,
    chainBrokenAtSeq: chain.brokenAtSeq,
    eventCount: eventTotal,
    latestEvents,
    recentWindow,
    runtimeRoot: getRuntimeRoot(),
    scriptsDir,
    actionsAvailable,
    frugalConfigured: Boolean(frugal.enabled && frugal.baseUrl),
  };
}

function normalizeIntent(prompt: string) {
  return prompt
    .toLowerCase()
    .normalize('NFD')
    // Combining diacriticals by codepoint, not by literal characters. The
    // literal form works until the file is re-encoded or a tool normalizes
    // it, and then it silently stops stripping accents.
    .replace(/[\u0300-\u036f]/g, '')
    // Strip leading punctuation before trimming. Every intent below is
    // anchored with ^, and "\u00bfcuando se rompio la cadena?" normalizes with the
    // opening \u00bf still attached \u2014 so natural Spanish missed EVERY local intent
    // and fell through to the paid bridge. Found by running the matcher, not
    // by reading it.
    .replace(/^[\u00bf\u00a1?!\s"'`]+/, '')
    .trim();
}

function formatEvents(events: ChainEvent[]) {
  if (!events.length) return 'EVENT_CHAIN vacía — aún no se ha registrado ninguna acción.';
  return events
    .map((event) => `[${event.seq}] ${event.type} // ${event.timestamp} // ${event.chain_hash.slice(0, 10)}`)
    .join('\n');
}

function formatActions(available: Record<string, boolean>) {
  const entries = Object.entries(available);
  if (!entries.length) return 'sin acciones registradas';
  const ready = entries.filter(([, ok]) => ok).map(([name]) => name);
  const missing = entries.filter(([, ok]) => !ok).map(([name]) => name);
  const parts = [`${ready.length}/${entries.length} disponibles`];
  if (ready.length) parts.push(`OK: ${ready.join(', ')}`);
  // Naming what will 501 is the point: an action that fails on click is worse
  // than one the steward warned about up front.
  if (missing.length) parts.push(`501: ${missing.join(', ')}`);
  return parts.join(' // ');
}

function buildStatusReport(context: EcosystemContext) {
  const lines = [
    `ESTADO_RUNTIME: ${context.stateAvailable ? 'CRISTALIZADO' : 'STANDALONE (sin STATE.json)'}`,
    `MERKLE_ROOT: ${context.merkleRoot.slice(0, 16)}`,
    `DRIFT_KL: ${context.driftKl.toFixed(4)} // ETA: ${context.eta.toFixed(3)}`,
    `CADENA: ${context.chainIntact ? 'INTACTA' : `COMPROMETIDA (${context.chainError || 'sin detalle'})`}`,
    `EVENTOS_RECIENTES: ${context.eventCount}`,
    `RUNTIME_ROOT: ${context.runtimeRoot}`,
    `ACCIONES: ${formatActions(context.actionsAvailable)}`,
    `FRUGAL_BRIDGE: ${context.frugalConfigured ? 'CONFIGURADO' : 'NO_DISPONIBLE'}`,
  ];
  return lines.join('\n');
}

/**
 * Deterministic L1 resolution for operational intents. Returns null when the
 * prompt is not an operational command (and should go to Frugal).
 */
function resolveLocalIntent(prompt: string, context: EcosystemContext): SeneschalReply | null {
  const intent = normalizeIntent(prompt);

  if (/^(status|estado|estatus|reporte|report|salud|health)\b/.test(intent) || intent === 's') {
    return {
      reply: buildStatusReport(context),
      source: 'local',
      intent: 'status',
      status: 'success',
    };
  }

  // The second test used to be /(chain|cadena|integridad)?/ — a fully optional
  // group matches the empty string, so it was always true and the && was dead.
  // Dropped: the verb alone is the intent, and any qualifier is optional.
  if (/^(verify|verifica|verificar|check)\b/.test(intent)) {
    return {
      reply: context.chainIntact
        ? `CADENA_INTACTA // verificación hash-a-hash completada sin discrepancias.`
        : `CADENA_COMPROMETIDA // ${context.chainError || 'discrepancia detectada'}`,
      source: 'local',
      intent: 'verify-chain',
      status: context.chainIntact ? 'success' : 'degraded',
    };
  }

  if (/^(eventos|events|historial|history|log|chain)\b/.test(intent)) {
    return {
      reply: formatEvents(context.latestEvents),
      source: 'local',
      intent: 'events',
      status: 'success',
    };
  }

  // "What happened in the last hour?" — the steward querying the chronicle.
  // Chronolith records and Seneschal answers, but until now neither could ask
  // the other a temporal question, so the operator had to read raw events.
  // ultimo/ultimos too: minutes and days are masculine in Spanish, so
  // "ultimos 30 minutos" missed a matcher that only knew ultima/ultimas.
  const windowMatch = intent.match(/(?:ultim[oa]s?|last)\s+(\d+)?\s*(hora|horas|hour|hours|min|minuto|minutos|minute|minutes|dia|dias|day|days)/);
  if (windowMatch || /^(que paso|que ha pasado|what happened|actividad|activity)\b/.test(intent)) {
    const amount = Number(windowMatch?.[1] || 1);
    const unit = windowMatch?.[2] || 'hora';
    const msPerUnit = /min/.test(unit) ? 60_000 : /dia|day/.test(unit) ? 86_400_000 : 3_600_000;
    const since = Date.now() - amount * msPerUnit;
    const inWindow = context.recentWindow.filter((event) => {
      const at = Date.parse(event.timestamp);
      return Number.isFinite(at) && at >= since;
    });
    const label = `${amount} ${unit}`;
    return {
      reply: inWindow.length
        ? [`ACTIVIDAD // ultimas ${label} // ${inWindow.length} de ${context.eventCount} eventos`, formatEvents(inWindow)].join('\n')
        : `SIN_ACTIVIDAD // ninguno de los ${context.eventCount} eventos cae en las ultimas ${label}.`,
      source: 'local',
      intent: 'activity-window',
      status: 'success',
    };
  }

  // "When did the chain break?" — verifyChain already knows the sequence; it
  // was never surfaced as an answer the operator could ask for.
  if (/^(cuando|when)\b.*(rompio|rompe|break|broke|roto|broken)/.test(intent)
      || /^(diagnostico|diagnose|donde fallo|where broke)\b/.test(intent)) {
    if (context.chainIntact) {
      return {
        reply: `CADENA_INTACTA // ${context.eventCount} eventos verificados, sin rupturas.`,
        source: 'local',
        intent: 'chain-diagnosis',
        status: 'success',
      };
    }
    const at = context.chainBrokenAtSeq;
    const culprit = at !== undefined ? context.recentWindow.find((event) => event.seq === at) : undefined;
    return {
      reply: [
        `CADENA_COMPROMETIDA // ${context.chainError || 'discrepancia detectada'}`,
        at !== undefined ? `RUPTURA_EN_SEQ: ${at}` : 'RUPTURA_EN_SEQ: no determinada',
        culprit ? `EVENTO: [${culprit.seq}] ${culprit.type} // ${culprit.timestamp}` : '',
      ].filter(Boolean).join('\n'),
      source: 'local',
      intent: 'chain-diagnosis',
      status: 'degraded',
    };
  }

  if (/^(ayuda|help|comandos|commands)\b/.test(intent) || intent === '?') {
    return {
      reply: [
        'SENESCHAL // comandos locales (sin coste LLM):',
        '  status   — reporte del ecosistema (estado, cadena, drift, bridge)',
        '  verify   — verificación de integridad de la EVENT_CHAIN',
        '  eventos  — últimos eventos de la cadena',
        '  que paso en la ultima hora — actividad en una ventana temporal',
        '  cuando se rompio la cadena — diagnóstico con la seq exacta',
        'Cualquier otra consulta se enruta a ETHERNIUM FRUGAL con contexto del ecosistema.',
      ].join('\n'),
      source: 'local',
      intent: 'help',
      status: 'success',
    };
  }

  return null;
}

function buildFrugalEnvelope(prompt: string, context: EcosystemContext) {
  return [
    '[SENESCHAL_CONTEXT]',
    buildStatusReport(context),
    '[/SENESCHAL_CONTEXT]',
    'Eres SENESCHAL, mayordomo operador del ecosistema CONEKTA/Continuity. Responde de forma operativa y concisa usando el contexto anterior cuando sea relevante.',
    `Consulta del operador: ${prompt}`,
  ].join('\n');
}

export async function askSeneschal(prompt: string): Promise<SeneschalReply> {
  const context = await buildEcosystemContext();

  const local = resolveLocalIntent(prompt, context);
  if (local) return local;

  if (!context.frugalConfigured) {
    return {
      reply: [
        'FRUGAL_BRIDGE_NO_DISPONIBLE — solo comandos locales activos (escribe "ayuda").',
        '',
        buildStatusReport(context),
      ].join('\n'),
      source: 'local',
      intent: 'fallback-status',
      status: 'degraded',
    };
  }

  let result;
  try {
    result = await invokeFrugalChat(buildFrugalEnvelope(prompt, context));
  } catch (error: unknown) {
    // The bridge is configured but unreachable (service down, timeout). Stay
    // useful: report the failure and fall back to the local status report.
    return {
      reply: [
        `FRUGAL_BRIDGE_INALCANZABLE // ${getErrorMessage(error, 'BRIDGE_ERROR')}`,
        'Comandos locales siguen disponibles (escribe "ayuda").',
        '',
        buildStatusReport(context),
      ].join('\n'),
      source: 'local',
      intent: 'bridge-unreachable',
      status: 'degraded',
    };
  }

  const reply = [result?.response || 'NO_RESPONSE', result?.next ? `NEXT // ${result.next}` : '']
    .filter(Boolean)
    .join('\n');

  // Chronolith: only escalations are chronicled — L1 answers are free and
  // would otherwise flood the chain with noise.
  await appendEvent('SENESCHAL_CONSULT', {
    prompt: prompt.slice(0, 160),
    mode: result?.mode || 'chat',
    status: result?.status || 'success',
  }).catch(() => {});

  return {
    reply,
    source: 'frugal',
    intent: result?.mode || 'chat',
    status: result?.status === 'success' ? 'success' : 'degraded',
    raw: result,
  };
}

export async function getSeneschalStatus() {
  const context = await buildEcosystemContext();
  return {
    report: buildStatusReport(context),
    context: {
      stateAvailable: context.stateAvailable,
      chainIntact: context.chainIntact,
      eventCount: context.eventCount,
      frugalConfigured: context.frugalConfigured,
    },
    adapters: getAdapterStatuses(),
  };
}
