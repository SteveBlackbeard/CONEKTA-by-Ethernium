# How to use CONEKTA

## Start

1. Start ETHERNIUM FRUGAL with `npm run api`.
2. In this repository run `npm install` and `npm run dev`.
3. Open `http://127.0.0.1:3000`.

The sibling layout `FRUGAL/` and `CONEKTA/` is portable: Conekta discovers the
ignored FRUGAL API token at runtime. Use `.env.local` only to override that
layout.

## What the controls do

- **ACCESS / LINK PROJECT** asks the browser for a directory and adds a
  read-only visualization of its top-level structure.
- **SENESCHAL CHAT** resolves basic status commands locally, then sends other
  prompts through SENESCHAL's real FRUGAL-governed preflight before FRUGAL chat.
- **CHRONOLITH** shows two separate facts: the local Conekta event ledger and
  the real read-only CHRONOLITH verdict returned through FRUGAL.
- **NODE ASSETS** change presentation only.

Legacy CRYSTALLIZE, AUDIT and SEAL buttons were removed because no promoted
FRUGAL contract backed them.

## Verify

```bash
npm run health
```

Do not claim an ecosystem peer as online merely because its node renders. Use
the live API status and the physical integration evidence.
