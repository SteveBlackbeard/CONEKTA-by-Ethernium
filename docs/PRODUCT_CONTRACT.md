# Ethernium product contract

## Roles

- **CONEKTA** is the local visual control surface and TypeScript adapter layer.
- **Chronolith** is the independent Python product for signed project-context integrity.
- **Seneschal** is the independent Python product for context selection, safety, routing, grants, and MCP controls.

The modules named `chronolith.ts` and `seneschal.ts` are CONEKTA adapters. They
do not replace, vendor, or claim API compatibility with the Python packages.

## Compatibility baseline

| Product | Validated line | Integration boundary |
| --- | --- | --- |
| CONEKTA | 0.1.x | Next.js APIs and local runtime artifacts |
| Chronolith | 3.2.x | `STATE.json`, `EVENT_CHAIN.jsonl`, and explicit adapter work |
| Seneschal | 0.2.x | MCP/CLI for the standalone product; CONEKTA has a narrower local steward adapter |

Any future direct package, CLI, or MCP integration must add a contract test and
update this table. Shared product names alone are not an integration contract.

## Linked-system trust boundary

Filesystem operations are loopback-only by default. A runtime-backed system is
registered server-side and subsequent reads use its opaque system ID. Browser
directory handles remain browser-only and never disclose absolute paths to the
server. Structural systems expose metadata only.

`CONEKTA_ALLOW_REMOTE_FILESYSTEM=true` disables the loopback guard. It is unsafe
unless CONEKTA is placed behind authentication and a trusted reverse proxy.
