# How To Use Continuity Conekta

Continuity Conekta is the standalone visual command surface for Continuity Legacy. It is not the Python runtime and it is not bundled back into the Legacy package.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Health Gate

Before pushing or publishing the repo:

```bash
npm run health
```

The health gate checks required files, lint, and production build.

## Runtime Boundary

Conekta reads local Continuity Legacy artifacts such as `STATE.json`, event-chain data, linked-system structure, and optional local adapter responses. If a runtime artifact is missing, Conekta should show an explicit degraded state rather than pretending the action succeeded.

The adapter rules are defined in `ADAPTER_CONTRACT.md`.

## Operational Buttons

- `SYNTH_DNA`: intended crystallization action through an explicit local adapter.
- `AUDIT_PHYSICS`: intended audit action through an explicit local adapter.
- `SEAL_VAULT`: intended guardian/seal action through an explicit local adapter.
- `ACCESS`: links local systems for visualization and read-only inspection when the browser/runtime can access them.

Only claim a button as fully operational when the corresponding adapter exists and has been verified against the current Continuity Legacy runtime.
