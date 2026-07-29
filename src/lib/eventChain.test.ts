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

describe('event chain integrity and cache', () => {
  it('detects same-size tampering even when mtime is restored', async () => {
    testRoot = await fs.mkdtemp(join(tmpdir(), 'conekta-chain-'));
    process.env.CONEKTA_RUNTIME_ROOT = testRoot;
    const chain = await import('./eventChain');
    await chain.appendEvent('TEST', { value: 'alpha' });
    expect((await chain.verifyChain()).intact).toBe(true);

    const file = join(testRoot, 'EVENT_CHAIN.jsonl');
    const before = await fs.stat(file);
    const original = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, original.replace('alpha', 'bravo'), 'utf-8');
    await fs.utimes(file, before.atime, before.mtime);

    const verification = await chain.verifyChain();
    expect(verification.intact).toBe(false);
    expect(verification.brokenAtSeq).toBe(0);
  });
});
