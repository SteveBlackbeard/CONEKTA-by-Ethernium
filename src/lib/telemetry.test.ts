import { describe, expect, it } from 'vitest';
import { deriveDashboardSignals } from './telemetry';

describe('telemetry availability', () => {
  it('does not invent zero drift when FRUGAL does not expose drift', () => {
    const signals = deriveDashboardSignals({
      state: {
        available: true,
        merkle_root: 'not_exposed',
        physics: { H: 1, H_max: 4, eta: 0.75, N: 4, W: 12, gini: 0 },
        drift_kl: null,
        drift_available: false,
      },
    });
    expect(signals.driftAvailable).toBe(false);
    expect(signals.syncLevel).toBeGreaterThan(0);
  });
});
