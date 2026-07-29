import { afterEach, describe, expect, it } from 'vitest';
import { requireLocalFilesystemRequest } from './filesystemSecurity';

afterEach(() => delete process.env.CONEKTA_ALLOW_REMOTE_FILESYSTEM);

describe('filesystem request boundary', () => {
  it('allows loopback requests', () => {
    expect(requireLocalFilesystemRequest(new Request('http://localhost/api/actions/read'))).toBeNull();
  });

  it('denies remote hosts by default', () => {
    expect(requireLocalFilesystemRequest(new Request('https://conekta.example/api/actions/read'))?.status).toBe(403);
  });

  it('requires an explicit override for remote filesystem access', () => {
    process.env.CONEKTA_ALLOW_REMOTE_FILESYSTEM = 'true';
    expect(requireLocalFilesystemRequest(new Request('https://conekta.example/api/actions/read'))).toBeNull();
  });
});
