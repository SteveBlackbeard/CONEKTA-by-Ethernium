import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AdapterProvider = 'ollama' | 'openclaw' | 'moltbot' | 'frugal';

type AdapterConfig = {
  enabled: boolean;
  baseUrl: string | null;
  model?: string | null;
  apiKey?: string | null;
  timeoutMs: number;
};

export type AdapterStatus = {
  provider: AdapterProvider;
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  model?: string | null;
  hasApiKey: boolean;
};

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function readBool(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

function normalizeLoopbackUrl(value: string | undefined) {
  const parsed = new URL(value || 'http://127.0.0.1:3369');
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('FRUGAL_BASE_URL_MUST_BE_LOOPBACK');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('FRUGAL_BASE_URL_PROTOCOL_NOT_ALLOWED');
  }
  return parsed.toString().replace(/\/$/, '');
}

function frugalTokenFile() {
  const root = process.env.CONEKTA_FRUGAL_ROOT?.trim()
    ? resolve(process.env.CONEKTA_FRUGAL_ROOT)
    : resolve(process.cwd(), '..', 'ETHERNIUM-FRUGAL-by-Ethernium');
  return resolve(root, '04_MEMORY', 'continuity', 'api_token');
}

function readFrugalToken(required = true) {
  const configured = (
    process.env.CONEKTA_FRUGAL_API_TOKEN
    || process.env.ETHERNIUM_API_TOKEN
    || ''
  ).trim();
  if (configured) return configured;
  try {
    const token = readFileSync(frugalTokenFile(), 'utf8').trim();
    if (token) return token;
  } catch {
    // Report a value-free configuration error only when a request needs it.
  }
  if (required) throw new Error('FRUGAL_BEARER_NOT_CONFIGURED');
  return '';
}

export function getAdapterConfig(provider: AdapterProvider): AdapterConfig {
  if (provider === 'ollama') {
    return {
      enabled: readBool(process.env.CONTINUITY_OLLAMA_ENABLED, true),
      baseUrl: normalizeUrl(process.env.CONTINUITY_OLLAMA_BASE_URL) || 'http://127.0.0.1:11434',
      model: process.env.CONTINUITY_OLLAMA_MODEL || 'llama3.1',
      timeoutMs: readInt(process.env.CONTINUITY_OLLAMA_TIMEOUT_MS, 45000),
    };
  }

  if (provider === 'frugal') {
    return {
      enabled: readBool(process.env.CONTINUITY_FRUGAL_ENABLED, true),
      baseUrl: normalizeLoopbackUrl(
        process.env.CONEKTA_FRUGAL_BASE_URL || process.env.CONTINUITY_FRUGAL_BASE_URL,
      ),
      apiKey: readFrugalToken(false),
      timeoutMs: readInt(process.env.CONTINUITY_FRUGAL_TIMEOUT_MS, 45000),
    };
  }

  if (provider === 'openclaw') {
    return {
      enabled: readBool(process.env.CONTINUITY_OPENCLAW_ENABLED, false),
      baseUrl: normalizeUrl(process.env.CONTINUITY_OPENCLAW_BASE_URL),
      apiKey: process.env.CONTINUITY_OPENCLAW_API_KEY || null,
      timeoutMs: readInt(process.env.CONTINUITY_OPENCLAW_TIMEOUT_MS, 45000),
    };
  }

  return {
    enabled: readBool(process.env.CONTINUITY_MOLTBOT_ENABLED, false),
    baseUrl: normalizeUrl(process.env.CONTINUITY_MOLTBOT_BASE_URL),
    apiKey: process.env.CONTINUITY_MOLTBOT_API_KEY || null,
    timeoutMs: readInt(process.env.CONTINUITY_MOLTBOT_TIMEOUT_MS, 45000),
  };
}

export function getAdapterStatuses(): AdapterStatus[] {
  return (['frugal', 'ollama', 'openclaw', 'moltbot'] as AdapterProvider[]).map((provider) => {
    const config = getAdapterConfig(provider);
    return {
      provider,
      enabled: config.enabled,
      configured: Boolean(config.baseUrl),
      baseUrl: config.baseUrl,
      model: config.model || null,
      hasApiKey: Boolean(config.apiKey),
    };
  });
}

function buildTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

export type FrugalChatResult = {
  status?: 'success' | 'degraded' | 'blocked';
  mode?: string;
  response?: string;
  result_class?: string;
  acted_on?: unknown[];
  next?: string;
};

/**
 * Talks to a local Ethernium Frugal instance (POST /chat on its interface
 * server). Frugal answers most intents locally (L1/L2) and only escalates to
 * a neural model when needed, so this is the cheapest bridge provider.
 */
export async function invokeFrugalChat(message: string, options?: { explain?: boolean; mode?: string }) {
  const config = getAdapterConfig('frugal');
  if (!config.enabled || !config.baseUrl) {
    throw new Error('FRUGAL_ADAPTER_NOT_ENABLED');
  }

  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readFrugalToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        mode: options?.mode || 'agent',
        explain: Boolean(options?.explain),
      }),
      signal: timeout.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as FrugalChatResult & { error?: string };
    if (!response.ok) {
      throw new Error(payload?.error || `FRUGAL_HTTP_${response.status}`);
    }
    return payload;
  } finally {
    timeout.dispose();
  }
}

export async function invokeFrugalGet<T extends object>(
  path: '/telemetry' | '/health' | '/version',
) {
  const config = getAdapterConfig('frugal');
  if (!config.enabled || !config.baseUrl) throw new Error('FRUGAL_ADAPTER_NOT_ENABLED');
  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
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

export async function invokeOllamaChat(messages: OllamaChatMessage[]) {
  const config = getAdapterConfig('ollama');
  if (!config.enabled || !config.baseUrl) {
    throw new Error('OLLAMA_ADAPTER_NOT_ENABLED');
  }

  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages,
      }),
      signal: timeout.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `OLLAMA_HTTP_${response.status}`);
    }
    return payload;
  } finally {
    timeout.dispose();
  }
}

export async function forwardBridgePayload(provider: 'openclaw' | 'moltbot', payload: unknown, path?: string) {
  const config = getAdapterConfig(provider);
  if (!config.enabled || !config.baseUrl) {
    throw new Error(`${provider.toUpperCase()}_ADAPTER_NOT_ENABLED`);
  }

  const timeout = buildTimeoutSignal(config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path || ''}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload || {}),
      signal: timeout.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `${provider.toUpperCase()}_HTTP_${response.status}`);
    }
    return data;
  } finally {
    timeout.dispose();
  }
}
