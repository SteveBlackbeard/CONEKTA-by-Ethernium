import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AdapterConfig = {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
};

export type AdapterStatus = {
  provider: 'frugal';
  authority: 'ethernium-frugal';
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  credentialSource: 'environment' | 'token-file' | 'missing';
};

export type FrugalChatResult = {
  status?: 'success' | 'degraded' | 'blocked';
  mode?: string;
  response?: string;
  result_class?: string;
  acted_on?: unknown[];
  next?: string;
};

type FrugalJson = Record<string, unknown>;

export type FrugalHttpResult<T extends FrugalJson = FrugalJson> = {
  ok: boolean;
  status: number;
  payload: T & { error?: string };
};

function readBool(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLoopbackUrl(value: string | undefined) {
  const parsed = new URL((value || 'http://127.0.0.1:3369').trim());
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('FRUGAL_BASE_URL_MUST_BE_LOOPBACK');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('FRUGAL_BASE_URL_PROTOCOL_NOT_ALLOWED');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function tokenFilePath() {
  const root = process.env.CONEKTA_FRUGAL_ROOT?.trim()
    ? resolve(process.env.CONEKTA_FRUGAL_ROOT)
    : resolve(process.cwd(), '..', 'FRUGAL');
  return resolve(root, '04_MEMORY', 'continuity', 'api_token');
}

function credentialSource(): AdapterStatus['credentialSource'] {
  if ((process.env.CONEKTA_FRUGAL_API_TOKEN || process.env.ETHERNIUM_API_TOKEN || '').trim()) {
    return 'environment';
  }
  return existsSync(tokenFilePath()) ? 'token-file' : 'missing';
}

function readFrugalToken() {
  const configured = (process.env.CONEKTA_FRUGAL_API_TOKEN || process.env.ETHERNIUM_API_TOKEN || '').trim();
  if (configured) return configured;
  try {
    const token = readFileSync(tokenFilePath(), 'utf8').trim();
    if (token) return token;
  } catch {
    // The caller receives a precise, value-free configuration error below.
  }
  throw new Error('FRUGAL_BEARER_NOT_CONFIGURED');
}

export function getAdapterConfig(): AdapterConfig {
  return {
    enabled: readBool(process.env.CONEKTA_FRUGAL_ENABLED, true),
    baseUrl: normalizeLoopbackUrl(
      process.env.CONEKTA_FRUGAL_BASE_URL || process.env.CONTINUITY_FRUGAL_BASE_URL,
    ),
    timeoutMs: readInt(
      process.env.CONEKTA_FRUGAL_TIMEOUT_MS || process.env.CONTINUITY_FRUGAL_TIMEOUT_MS,
      45000,
    ),
  };
}

export function getAdapterStatuses(): AdapterStatus[] {
  const config = getAdapterConfig();
  const source = credentialSource();
  return [{
    provider: 'frugal',
    authority: 'ethernium-frugal',
    enabled: config.enabled,
    configured: config.enabled && source !== 'missing',
    baseUrl: config.baseUrl,
    credentialSource: source,
  }];
}

function buildTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

export async function invokeFrugalResult<T extends FrugalJson = FrugalJson>(
  path: '/chat' | '/ecosystem/status' | '/ecosystem/seneschal/preflight' | '/ecosystem/chronolith/verify',
  body: FrugalJson = {},
): Promise<FrugalHttpResult<T>> {
  const config = getAdapterConfig();
  if (!config.enabled) throw new Error('FRUGAL_ADAPTER_NOT_ENABLED');

  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readFrugalToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    return { ok: response.ok, status: response.status, payload };
  } finally {
    timeout.dispose();
  }
}

export async function invokeFrugal<T extends FrugalJson = FrugalJson>(
  path: '/chat' | '/ecosystem/status' | '/ecosystem/seneschal/preflight' | '/ecosystem/chronolith/verify',
  body: FrugalJson = {},
): Promise<T & { error?: string }> {
  const result = await invokeFrugalResult<T>(path, body);
  if (!result.ok) {
    throw new Error(result.payload?.error || `FRUGAL_HTTP_${result.status}`);
  }
  return result.payload;
}

export async function invokeFrugalGet<T extends FrugalJson = FrugalJson>(
  path: '/telemetry' | '/health' | '/version',
): Promise<T & { error?: string }> {
  const config = getAdapterConfig();
  if (!config.enabled) throw new Error('FRUGAL_ADAPTER_NOT_ENABLED');

  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${readFrugalToken()}` },
      signal: timeout.signal,
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `FRUGAL_HTTP_${response.status}`);
    return payload;
  } finally {
    timeout.dispose();
  }
}

export async function invokeFrugalChat(
  message: string,
  options?: { explain?: boolean; mode?: string },
) {
  return invokeFrugal<FrugalChatResult & FrugalJson>('/chat', {
    message,
    mode: options?.mode || 'agent',
    explain: Boolean(options?.explain),
  });
}
