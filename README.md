# CONEKTA by Ethernium

CONEKTA is the federated visualization and request surface for **ETHERNIUM
PERSONAL**. It displays linked repositories, reads explicitly linked text
artifacts and delegates cognition to ETHERNIUM FRUGAL. It is not a second
kernel, agent runtime or source of truth.

## Authority model

- **ETHERNIUM FRUGAL** is the sole cognitive runtime.
- **SENESCHAL** is reached through FRUGAL as a real, consultative MCP preflight.
- **CHRONOLITH** is reached through FRUGAL as a real read-only verifier.
- **CONEKTA** owns presentation state and a local hash-linked UI event ledger.
- Historical Continuity material may be linked read-only as reference. It never
  becomes live authority or changes FRUGAL's identity.

The graph renders only these promoted relationships. The old simulated
Continuity LITE/PRO/OMEGA nodes and the unbacked CRYSTALLIZE/AUDIT/SEAL controls
were retired.

## Security boundary

- Production and development bind to `127.0.0.1`.
- Every unsafe `/api/*` request requires the exact same browser origin or the
  optional operator bearer `CONEKTA_API_TOKEN`.
- The FRUGAL bearer is held only by the Conekta server. It comes from
  `CONEKTA_FRUGAL_API_TOKEN`, `ETHERNIUM_API_TOKEN`, or FRUGAL's ignored
  `04_MEMORY/continuity/api_token` file.
- The FRUGAL URL must resolve syntactically to `localhost`, `127.0.0.1` or
  `::1`; remote adapter URLs are rejected.
- Direct Ollama, OpenClaw and Moltbot providers are retired. Neural inference,
  when needed, remains behind FRUGAL's governed L3/L4 routing.
- Linked file reads reject path traversal and support text formats only.

## Runtime data

CONEKTA's local UI state lives in the ignored `runtime/` directory by default.
`CONEKTA_RUNTIME_ROOT` may select another operator-owned data directory, but it
does not appoint that directory as cognitive authority. The local
`EVENT_CHAIN.jsonl` is a Conekta activity ledger, not the CHRONOLITH repository.

## Run

Prerequisite: Node.js `>=20.19.0`.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

For a production run:

```bash
npm run build
npm run start
```

Copy `.env.example` to `.env.local` only when the portable sibling layout is
not enough. With sibling repositories named `CONEKTA` and `FRUGAL`, Conekta
discovers FRUGAL's ignored token file without copying the credential.

## Release gate

```bash
npm test
npm run health
```

The gate runs lint, a clean Next production build and a physical HTTP test. The
test boots a production Conekta server plus a controlled FRUGAL peer and proves:

- same-origin mutation enforcement;
- hostile-origin rejection;
- server-held bearer delegation;
- direct provider retirement;
- SENESCHAL preflight before chat;
- CHRONOLITH read-only `no_baseline` reporting;
- no bearer value in API status responses.

The release pins Next `16.2.12` and overrides its vulnerable transitive PostCSS
and Sharp versions with audited compatible releases. `npm audit --omit=dev`
must report zero vulnerabilities.

See `docs/ADAPTER_CONTRACT.md` for the versioned boundary.
