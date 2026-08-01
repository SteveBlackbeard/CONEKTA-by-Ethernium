import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let testRoot = '';

afterEach(async () => {
  delete process.env.CONEKTA_RUNTIME_ROOT;
  delete process.env.CONTINUITY_FRUGAL_ENABLED;
  vi.resetModules();
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

async function prepare() {
  testRoot = await fs.mkdtemp(join(tmpdir(), 'conekta-integration-'));
  process.env.CONEKTA_RUNTIME_ROOT = join(testRoot, 'runtime');
  process.env.CONTINUITY_FRUGAL_ENABLED = 'false';
}

describe('CONEKTA runtime integration', () => {
  it('serializes concurrent events into a valid sequence', async () => {
    await prepare();
    const chain = await import('./eventChain');
    await Promise.all(Array.from({ length: 12 }, (_, index) => chain.appendEvent('CONCURRENT', { index })));
    const events = await chain.getEventSnapshot();
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect((await chain.verifyChain()).intact).toBe(true);
  });

  it('lets Seneschal answer temporal and linked-system questions locally', async () => {
    await prepare();
    const registry = await import('./linkedSystemsRegistry');
    await registry.registerLinkedSystem({ id: 'system-alpha', name: 'Alpha', accessMode: 'structural', entryCount: 3 });
    const chain = await import('./eventChain');
    await chain.appendEvent('SYSTEM_SCAN', { name: 'Alpha' });
    const scriptsDir = join(process.env.CONEKTA_RUNTIME_ROOT!, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(join(scriptsDir, 'audit_comparison.py'), '# available\n', 'utf-8');
    const { askSeneschal } = await import('./seneschal');

    const status = await askSeneschal('¿estado?');
    expect(status.source).toBe('local');
    expect(status.reply).toContain('SISTEMAS_VINCULADOS: 1');
    expect(status.reply).toContain('Alpha');
    expect(status.reply).toContain('ACCIONES: 1/3 disponibles');
    expect(status.reply).toContain('501: CRYSTALLIZE, SEAL');

    const activity = await askSeneschal('¿qué pasó en la última hora?');
    expect(activity.intent).toBe('activity-window');
    expect(activity.reply).toContain('SYSTEM_SCAN');
  });

  it('reads a file only through a registered runtime system ID', async () => {
    await prepare();
    const project = join(testRoot, 'project');
    await fs.mkdir(project);
    await fs.writeFile(join(project, 'README.md'), 'registered content', 'utf-8');
    const registry = await import('./linkedSystemsRegistry');
    await registry.registerLinkedSystem({ id: 'system-read', name: 'Read', rootPath: project, accessMode: 'runtime' });
    const { POST } = await import('@/app/api/actions/read/route');

    const allowed = await POST(new Request('http://localhost/api/actions/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId: 'system-read', filePath: 'README.md' }),
    }));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).content).toBe('registered content');

    const denied = await POST(new Request('http://localhost/api/actions/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemId: 'unknown', filePath: 'README.md' }),
    }));
    expect(denied.status).toBe(403);
  });
});
