// SENESCHAL — the ecosystem steward.
//
// Operator agent behind CONEKTA's chat rail. Frugal philosophy: operational
// intents (status, chain verification, recent events) resolve locally and
// deterministically (L1) with zero LLM cost; everything else is forwarded to
// the Ethernium Frugal bridge enriched with real ecosystem context.
import { promises as fs } from 'fs';
import { appendEvent, getEvents, verifyChain, ChainEvent } from '@/lib/eventChain';
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
  eventCount: number;
  latestEvents: ChainEvent[];
  runtimeRoot: string;
  scriptsDir: string;
  frugalConfigured: boolean;
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
  const latestEvents = await getEvents(5);
  const frugal = getAdapterConfig('frugal');

  return {
    stateAvailable,
    merkleRoot,
    driftKl,
    eta,
    chainIntact: chain.intact,
    chainError: chain.error,
    eventCount: latestEvents.length,
    latestEvents,
    runtimeRoot: getRuntimeRoot(),
    scriptsDir: getScriptsDir(),
    frugalConfigured: Boolean(frugal.enabled && frugal.baseUrl),
  };
}

function normalizeIntent(prompt: string) {
  return prompt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function formatEvents(events: ChainEvent[]) {
  if (!events.length) return 'EVENT_CHAIN vacía — aún no se ha registrado ninguna acción.';
  return events
    .map((event) => `[${event.seq}] ${event.type} // ${event.timestamp} // ${event.chain_hash.slice(0, 10)}`)
    .join('\n');
}

function buildStatusReport(context: EcosystemContext) {
  const lines = [
    `ESTADO_RUNTIME: ${context.stateAvailable ? 'CRISTALIZADO' : 'STANDALONE (sin STATE.json)'}`,
    `MERKLE_ROOT: ${context.merkleRoot.slice(0, 16)}`,
    `DRIFT_KL: ${context.driftKl.toFixed(4)} // ETA: ${context.eta.toFixed(3)}`,
    `CADENA: ${context.chainIntact ? 'INTACTA' : `COMPROMETIDA (${context.chainError || 'sin detalle'})`}`,
    `EVENTOS_RECIENTES: ${context.eventCount}`,
    `RUNTIME_ROOT: ${context.runtimeRoot}`,
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

  if (/^(verify|verifica|verificar|check)\b/.test(intent) && /(chain|cadena|integridad)?/.test(intent)) {
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

  if (/^(ayuda|help|comandos|commands)\b/.test(intent) || intent === '?') {
    return {
      reply: [
        'SENESCHAL // comandos locales (sin coste LLM):',
        '  status   — reporte del ecosistema (estado, cadena, drift, bridge)',
        '  verify   — verificación de integridad de la EVENT_CHAIN',
        '  eventos  — últimos eventos de la cadena',
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
