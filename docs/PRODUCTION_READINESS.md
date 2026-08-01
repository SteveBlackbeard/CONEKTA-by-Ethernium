# CONEKTA production readiness

This document records executable release criteria. It does not replace the
product and adapter contracts.

## Release gate

From a clean checkout with a supported Node.js version:

```bash
npm ci
npm run health
npm run audit
```

The gate covers lint, unit/integration tests, the optimized Next.js build,
production output tracing and high-severity dependency advisories. CI executes
the same commands. No author-machine filesystem path is part of the runtime
contract.

## Filesystem and visual invariants

- Runtime state defaults to `<checkout>/runtime`.
- External runtime, scripts and Frugal roots are explicit environment settings.
- File reads require loopback access and a registered runtime root; traversal is
  rejected.
- Dynamic document paths are not build dependencies and cannot expand the
  production output trace to the whole checkout.
- Production hardening must not change DOM structure, styles, shaders, assets or
  the current visual composition without a separate visual change request.

## Closed audit ledger

The defects from the earlier CONEKTA audit are represented in current code and
tests rather than retained as open folklore:

1. Action scripts are probed and Seneschal reports which actions would return
   `501 SCRIPT_NOT_AVAILABLE`.
2. Linked systems are registered server-side and included in Seneschal context.
3. Seneschal operational context and Chronolith events share the same real event
   chain; escalations are chronicled.
4. Whole-chain reads are identity-cached and concurrent cold readers are
   coalesced.
5. Intent normalization handles Spanish opening punctuation and combining
   diacritics; nested payloads are canonicalized, verified and summarized as
   JSON rather than `[object Object]`.

Any future claim of closure requires a failing regression test first, a passing
implementation, `npm run health`, `npm run audit` and a clean diff review.
