# Continuity Conekta Adapter Contract

Continuity Conekta is a standalone control surface. Continuity Legacy is the runtime and source of truth.

## Boundary

- Conekta may read runtime artifacts exposed by a local Continuity Legacy checkout.
- Conekta may call explicit local adapter endpoints or scripts only when the operator enables them.
- Continuity Legacy must not import, bundle, or depend on Conekta.
- Missing runtime artifacts must produce an explicit degraded state instead of silent success.

## Expected Runtime Artifacts

- `STATE.json` for Merkle/state telemetry.
- Event chain data when present.
- Text files selected through linked-system access for read-only inspection.
- Optional local chat adapters configured through `.env.local`.

## Local Adapter Rules

- Read-only behavior is the default.
- Mutating actions must stay behind explicit UI commands and local runtime endpoints.
- External AI providers must be configured through environment variables.
- Secret values must never be rendered in the UI or written to event logs.

## Health Gate

The repository-level health gate is:

```bash
npm run health
```

It checks the required repo structure, lint, and production build.
