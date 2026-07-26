import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const bearer = 'conekta-physical-test-token-000000000000000000';
const observed = [];
let telemetryAvailable = true;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function waitFor(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Conekta exited early (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for Conekta');
}

function json(response) {
  return response.json();
}

test('production server enforces FRUGAL-only authority and real ecosystem delegation', async (t) => {
  const frugal = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    observed.push({
      path: request.url,
      authorization: request.headers.authorization,
      body,
    });

    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== `Bearer ${bearer}`) {
      response.writeHead(401);
      response.end(JSON.stringify({ error: 'Bearer token required' }));
      return;
    }
    if (request.url === '/ecosystem/seneschal/preflight') {
      if (String(body.text || '').includes('hostile')) {
        response.writeHead(422);
        response.end(JSON.stringify({ proceed: false, verdict: 'blocked-test-payload' }));
      } else {
        response.writeHead(200);
        response.end(JSON.stringify({ proceed: true, verdict: 'allowed' }));
      }
      return;
    }
    if (request.url === '/ecosystem/chronolith/verify') {
      response.writeHead(409);
      response.end(JSON.stringify({ ok: false, verdict: 'no_baseline' }));
      return;
    }
    if (request.url === '/telemetry') {
      if (!telemetryAvailable) {
        response.writeHead(503);
        response.end(JSON.stringify({ error: 'telemetry unavailable' }));
        return;
      }
      response.writeHead(200);
      response.end(JSON.stringify({
        schema: 'ethernium.telemetry.snapshot/1',
        source: 'frugal',
        routing: { total: 10, l1: 7, l2: 2, l3: 1, l4: 0, bypass_ratio: 0.9 },
        latency_ms: { p50: 4, p95: 12, sample_count: 10 },
        mcp: { connected_servers: 2, configured_servers: 2 },
      }));
      return;
    }
    if (request.url === '/chat') {
      response.writeHead(200);
      response.end(JSON.stringify({
        status: 'success',
        mode: 'L1',
        response: `FRUGAL:${String(body.message || '').slice(-32)}`,
      }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: 'not found' }));
  });
  const frugalPort = await listen(frugal);
  t.after(() => frugal.close());

  const portProbe = createServer();
  const conektaPort = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${conektaPort}`;
  const nextBin = join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(conektaPort)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CONEKTA_FRUGAL_BASE_URL: `http://127.0.0.1:${frugalPort}`,
      CONEKTA_FRUGAL_API_TOKEN: bearer,
      CONEKTA_RUNTIME_ROOT: join(repoRoot, 'runtime', 'physical-test'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
  });

  await waitFor(origin, child);

  const statusResponse = await fetch(`${origin}/api/chat/bridge`);
  assert.equal(statusResponse.status, 200);
  const status = await json(statusResponse);
  assert.equal(status.provider, 'frugal');
  assert.equal(status.authority, 'ethernium-frugal');
  assert.deepEqual(status.retiredProviders, ['ollama', 'openclaw', 'moltbot']);
  assert.equal(JSON.stringify(status).includes(bearer), false);

  const missingOrigin = await fetch(`${origin}/api/chat/bridge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello' }),
  });
  assert.equal(missingOrigin.status, 403);

  const hostileOrigin = await fetch(`${origin}/api/node-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' },
    body: JSON.stringify({ action: 'process-canonical-assets' }),
  });
  assert.equal(hostileOrigin.status, 403);

  const retired = await fetch(`${origin}/api/chat/bridge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ provider: 'ollama', prompt: 'bypass' }),
  });
  assert.equal(retired.status, 410);

  const delegated = await fetch(`${origin}/api/chat/bridge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ prompt: 'real delegation' }),
  });
  assert.equal(delegated.status, 200, logs);
  const delegatedPayload = await json(delegated);
  assert.equal(delegatedPayload.authority, 'ethernium-frugal');
  assert.match(delegatedPayload.reply, /^FRUGAL:/);

  const seneschal = await fetch(`${origin}/api/seneschal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ prompt: 'explain current posture' }),
  });
  assert.equal(seneschal.status, 200, logs);
  const seneschalPayload = await json(seneschal);
  assert.equal(seneschalPayload.source, 'frugal');
  assert.equal(seneschalPayload.status, 'success');

  const chatCallsBeforeBlock = observed.filter((entry) => entry.path === '/chat').length;
  const blocked = await fetch(`${origin}/api/seneschal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ prompt: 'hostile instruction' }),
  });
  assert.equal(blocked.status, 200);
  const blockedPayload = await json(blocked);
  assert.match(blockedPayload.reply, /^SENESCHAL_BLOCKED/);
  assert.equal(observed.filter((entry) => entry.path === '/chat').length, chatCallsBeforeBlock);

  const chronolith = await fetch(`${origin}/api/chronolith`);
  assert.equal(chronolith.status, 200, logs);
  const chronolithPayload = await json(chronolith);
  assert.equal(chronolithPayload.authority, 'chronolith-read-only-via-frugal');
  assert.equal(chronolithPayload.verification.connected, true);
  assert.equal(chronolithPayload.verification.verdict, 'no_baseline');

  const telemetry = await fetch(`${origin}/api/state`);
  assert.equal(telemetry.status, 200, logs);
  const telemetryPayload = await json(telemetry);
  assert.equal(telemetryPayload.available, true);
  assert.equal(telemetryPayload.source, 'frugal');
  assert.equal(telemetryPayload.physics.eta, 0.9);
  assert.equal(telemetryPayload.physics.H, 1);
  assert.equal(telemetryPayload.physics.N, 10);
  assert.equal(telemetryPayload.physics.W, 12);

  telemetryAvailable = false;
  const unavailableTelemetry = await fetch(`${origin}/api/state`);
  assert.equal(unavailableTelemetry.status, 200);
  const unavailablePayload = await json(unavailableTelemetry);
  assert.equal(unavailablePayload.available, false);
  assert.equal(unavailablePayload.source, 'frugal');
  assert.equal(unavailablePayload.physics.eta, 0);

  assert.ok(observed.length >= 5);
  assert.ok(observed.every((entry) => entry.authorization === `Bearer ${bearer}`));
});
