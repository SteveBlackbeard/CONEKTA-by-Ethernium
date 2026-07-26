# CONEKTA Adapter Contract

Status: accepted

Scope: ETHERNIUM PERSONAL

Authority: ETHERNIUM FRUGAL

## Boundary

CONEKTA is a local presentation and request surface. It may:

- render the declared personal ecosystem topology;
- link operator-selected directories for read-only visualization;
- persist local visual asset preferences;
- keep a local hash-linked UI activity ledger;
- call the authenticated FRUGAL API over loopback.

CONEKTA must not:

- invoke Ollama or another neural model directly;
- run OpenClaw, Moltbot or a sibling agent as cognitive authority;
- execute arbitrary legacy scripts;
- claim local ledger integrity as CHRONOLITH verification;
- import foreign Continuity state as live memory or governance;
- render a simulated success, connection, node or metric as real.

## Promoted calls

| Conekta operation | FRUGAL endpoint | External role |
|---|---|---|
| Chat | `POST /chat` | FRUGAL authority |
| SENESCHAL guard | `POST /ecosystem/seneschal/preflight` | consultative MCP |
| CHRONOLITH status | `POST /ecosystem/chronolith/verify` | read-only evidence |

The SENESCHAL preflight runs before a non-local Seneschal chat request. A
blocked preflight cannot continue to `/chat`. CHRONOLITH `no_baseline` is an
honest connected state, not a successful integrity claim.

## Credentials and transport

- All FRUGAL calls use a server-held bearer.
- Status responses expose only the credential source classification, never the
  value.
- Adapter URLs are restricted to HTTP(S) loopback hosts.
- Conekta binds its own server to `127.0.0.1`.
- Unsafe Conekta API methods require exact same-origin browser requests or
  `CONEKTA_API_TOKEN`.

## Failure semantics

Missing or unreachable peers produce `missing`, `unavailable`, `blocked`,
`no_baseline` or an HTTP failure. None may be translated into `online`,
`verified`, `sealed` or `success`.

## Test contract

`npm test` must pass before a commit. The production integration test exercises
real HTTP boundaries with a controlled FRUGAL peer; it does not mock Conekta's
own routes in process.
