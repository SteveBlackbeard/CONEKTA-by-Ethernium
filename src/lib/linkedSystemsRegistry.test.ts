import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let testRoot = '';

afterEach(async () => {
  delete process.env.CONEKTA_RUNTIME_ROOT;
  vi.resetModules();
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

describe('linked system registry', () => {
  it('persists metadata and resolves files only through the registered ID', async () => {
    testRoot = await fs.mkdtemp(join(tmpdir(), 'conekta-registry-'));
    const linkedRoot = join(testRoot, 'project');
    await fs.mkdir(linkedRoot);
    await fs.writeFile(join(linkedRoot, 'README.md'), 'safe', 'utf-8');
    process.env.CONEKTA_RUNTIME_ROOT = join(testRoot, 'runtime');

    const registry = await import('./linkedSystemsRegistry');
    const system = await registry.registerLinkedSystem({
      id: 'system-test',
      name: 'Test',
      rootPath: linkedRoot,
      accessMode: 'runtime',
      entryCount: 1,
      entries: [{ name: 'README.md', type: 'file', size: 4 }],
    });

    expect((await registry.listRegisteredSystems())[0]?.entries).toHaveLength(1);
    expect(await registry.resolveRegisteredSystemFile(system.id, 'README.md')).toBe(join(linkedRoot, 'README.md'));
    expect(await registry.resolveRegisteredSystemFile(system.id, '..\\secret.txt')).toBeNull();
    expect(await registry.resolveRegisteredSystemFile('unregistered', 'README.md')).toBeNull();
  });
});
