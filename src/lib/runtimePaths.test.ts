import { describe, expect, it } from 'vitest';
import { isWithin } from './runtimePaths';

describe('filesystem boundaries', () => {
  it('accepts descendants and rejects siblings and traversal', () => {
    expect(isWithin('C:\\safe', 'C:\\safe\\docs\\readme.md')).toBe(true);
    expect(isWithin('C:\\safe', 'C:\\unsafe\\secret.txt')).toBe(false);
    expect(isWithin('C:\\safe', 'C:\\safe\\..\\unsafe\\secret.txt')).toBe(false);
  });
});
