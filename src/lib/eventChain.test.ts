import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let testRoot = '';

afterEach(async () => {
  delete process.env.CONEKTA_RUNTIME_ROOT;
  vi.restoreAllMocks();
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

  it('coalesces concurrent cold readers into one filesystem read', async () => {
    testRoot = await fs.mkdtemp(join(tmpdir(), 'conekta-chain-'));
    process.env.CONEKTA_RUNTIME_ROOT = testRoot;
    const chain = await import('./eventChain');
    await chain.appendEvent('TEST', { value: 'once' });

    const readFile = vi.spyOn(fs, 'readFile');
    const [events, count, verification] = await Promise.all([
      chain.getEvents(10),
      chain.getEventCount(),
      chain.verifyChain(),
    ]);

    expect(events).toHaveLength(1);
    expect(count).toBe(1);
    expect(verification.intact).toBe(true);
    const chainReads = readFile.mock.calls.filter(([path]) => String(path).endsWith('EVENT_CHAIN.jsonl'));
    expect(chainReads).toHaveLength(1);
  });

  it('hashes and summarizes nested payloads without object placeholders', async () => {
    testRoot = await fs.mkdtemp(join(tmpdir(), 'conekta-chain-'));
    process.env.CONEKTA_RUNTIME_ROOT = testRoot;
    const chain = await import('./eventChain');
    await chain.appendEvent('NESTED', { result: { score: 42 } });
    const chronolith = await import('./chronolith');

    const timeline = await chronolith.getTimeline();
    expect(timeline.entries[0].summary).toContain('result={"score":42}');

    const file = join(testRoot, 'EVENT_CHAIN.jsonl');
    const original = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, original.replace('"score":42', '"score":43'), 'utf-8');
    expect((await chain.verifyChain()).intact).toBe(false);
  });
});
