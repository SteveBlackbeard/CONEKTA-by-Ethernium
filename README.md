# CONEKTA by Ethernium

**CONEKTA by Ethernium** is the standalone visual command surface for CONTINUITY LEGACY. It renders the sovereign core, live telemetry, forensic rails, document reading, and the linked-system ecosystem around the central runtime.

This repository was extracted from the former `nexus-dashboard/` folder in Continuity Legacy.

## Runtime model

- CONEKTA is standalone: all runtime artifacts (`STATE.json`, `EVENT_CHAIN.jsonl`) live under the **runtime root**, which defaults to `<repo>/runtime` and can be pointed at a real Continuity Legacy checkout with `CONEKTA_RUNTIME_ROOT` (see `.env.example`).
- The AUDIT / CRYSTALLIZE / SEAL actions execute python scripts from `CONEKTA_SCRIPTS_DIR` (default `<runtime root>/scripts`). When the scripts are not installed, the API answers `501 SCRIPT_NOT_AVAILABLE` honestly instead of pretending to run them.
- File reads through `/api/actions/read` are sandboxed: only paths inside the runtime root or inside an explicitly linked system root are allowed; path traversal is rejected with `403`.
- `CONTINUITY LEGACY` remains the metacore at the center of the graph.
- Linked projects are modeled as sovereign spheres, not as a single merged blob.
- The default view is `ecosystem overview`: multiple linked systems remain visible while one system can be active and focused.
- Large linked systems expand with adaptive rings:
  - `DASHBOARD`
  - `AGENTS`
  - `DOCUMENTS`
  - `TOOLS`
  - `SYSTEM`

## Seneschal and Chronolith

- **SENESCHAL** — ecosystem steward behind the `CHAT` rail. Operational intents
  (`status`, `verify`, `eventos`, `ayuda`) resolve deterministically at L1 with
  no LLM cost; anything else is forwarded to the Ethernium Frugal bridge wrapped
  in a real ecosystem context envelope. Each reply is labeled with how it was
  resolved (`L1_LOCAL` or `FRUGAL`). API: `POST /api/seneschal`, `GET /api/seneschal`.
- **CHRONOLITH** — forensic chronicler over the `EVENT_CHAIN`. Scans, asset
  bindings and Frugal escalations are appended as hash-linked events; the right
  rail renders the timeline with a per-event verification mark and a chain-wide
  `SEALED` / `BREACHED` state. `GET /api/chronolith/export` downloads the full
  history sealed with a sha256 digest over the canonical chain, so a copy can be
  verified offline.

Chain integrity note: event hashing uses canonical JSON with recursively sorted
keys. Chains produced before this (which excluded payloads from the hash) will
not verify and must be re-anchored.

These are CONEKTA adapter modules, not embedded copies of the independent Python
packages. Product roles, the validated version lines, and the filesystem trust
boundary are defined in [`docs/PRODUCT_CONTRACT.md`](./docs/PRODUCT_CONTRACT.md).

## Current capabilities

- Live dashboard signals derived from state, drift, chain integrity, actions, and linked-system count.
- Multi-system HUD inventory with active system selection and unlink controls.
- 3D ecosystem graph with active/inactive sphere hierarchy.
- Manual camera movement with focus, reset, next-document, and cycle-system controls.
- Best-effort document reading for text files that are resolvable by the local dashboard runtime.
- Per-system watch streams and per-system event labeling when the linked path is available to the backend.

## Development

Run CONEKTA locally from this repository:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production validation:

```bash
npm run lint
npm run build
npm run health
```

`npm run health` is the release gate for this repository. It verifies the required Conekta structure, lint, and production build.
It also runs the automated security and runtime unit suite.

Filesystem APIs are loopback-only by default. Do not enable
`CONEKTA_ALLOW_REMOTE_FILESYSTEM` unless the deployment is protected by trusted
authentication; linked runtime roots are registered server-side and addressed
by opaque IDs.

## Local AI bridge

CONEKTA includes a `CHAT` rail that can talk to a local conversational backend through `/api/chat/bridge`.

To move Conekta by USB to another machine:

1. Copy the repo.
2. Copy `.env.example` to `.env.local`.
3. Start `ETHERNIUM-FRUGAL-by-Ethernium`, the sole cognitive authority.
4. If both repositories are not siblings, set `CONEKTA_FRUGAL_ROOT` to the
   FRUGAL checkout. The bearer is read server-side from FRUGAL's local token
   file; it is never exposed to the browser.
5. Start Conekta with:

```bash
npm install
npm run start
```

Example `Ethernium Frugal` setup (recommended — answers most intents locally
without an LLM, with provenance and distillation):

```bash
# In the Ethernium Frugal repo:
npm run api          # interface server on http://127.0.0.1:3369

# In .env.local (these are already the defaults):
CONTINUITY_FRUGAL_ENABLED=true
CONEKTA_FRUGAL_BASE_URL=http://127.0.0.1:3369
```

Direct Ollama, OpenClaw and Moltbot routes are retired in CONEKTA. If FRUGAL
uses one of them internally, FRUGAL remains responsible for governance,
routing and telemetry.

## Package/runtime boundary

CONEKTA should be treated as the control surface, not the source of truth for the runtime package.

If you publish `ethernium-continuity-legacy` (or `lite/pro/omega`) to PyPI, keep this rule:

- only claim package commands that the package CLI actually exposes
- do not assume every dashboard button already has a one-to-one package command
- prefer an explicit local adapter layer between dashboard and packaged runtime

The adapter boundary is documented in `docs/ADAPTER_CONTRACT.md`.

## Notes

- Browser-linked directories do not expose absolute filesystem paths. When a linked system cannot be resolved directly by the backend, the dashboard falls back to a structural node model instead of failing visually.
- Inter-system bridges are intentionally not rendered unless a real operational or cryptographic relationship is modeled in runtime state.
- Public ecosystem behavior should be documented here only after the runtime behavior is stable enough to trust as a real capability.

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache License 2.0](LICENSE-APACHE) at your option. Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this work shall be dual licensed as above, without any additional terms or conditions.
