# AGENTS.md

This file provides shared guidance to AI coding agents when working with code in this repository.

## Project Overview

A dependency-free Node.js CLI and library that clones Keycloak realm exports so they can be
re-imported as a new realm **on the same Keycloak instance**. A raw re-import fails with UUID
collision errors (`duplicate key value violates unique constraint`) because every internal ID in
the export already exists in the database — see
[keycloak/keycloak#24770](https://github.com/keycloak/keycloak/issues/24770). The tool rewrites
all UUIDs (preserving relationships), renames the realm, and fixes realm-referencing fields so the
output imports cleanly.

## Repository Layout

```
bin/cli.js     ← CLI entry point (arg parsing, --help/--version/--dry-run, exit codes)
src/clone.js   ← library implementation: cloneRealm(realmJson, options)
index.js       ← package entry point, re-exports src/clone.js
test/          ← node:test suite (run via `npm test`)
README.md      ← user-facing docs: problem, usage, import walkthrough, troubleshooting
AGENTS.md      ← this file (canonical AI guidance; CLAUDE.md just points here)
CLAUDE.md      ← one-line pointer to AGENTS.md
```

Published as the `keycloak-realm-clone` npm package (`bin: keycloak-realm-clone`, no
dependencies). GitHub Actions CI runs `npm test` on push/PR. Verification is `npm test` plus
manual: run the CLI against a real realm export and import the output into Keycloak.

## Usage

```bash
# CLI
npx keycloak-realm-clone realm-export.json myrealm-dev
npx keycloak-realm-clone realm-export.json myrealm-dev --old-name myrealm -o out.json
npx keycloak-realm-clone realm-export.json myrealm-dev --dry-run

# Library
const { cloneRealm } = require("keycloak-realm-clone");
const { realm, summary } = cloneRealm(exportJson, { newRealmName, oldRealmName });
```

Output is written to `<new-realm-name>-realm-export.json` by default (override with `-o/--output`).

## How src/clone.js Works (processing order matters)

`cloneRealm` runs these steps in order:

1. The input is deep-cloned (`cloneRealm` never mutates its argument); a fresh `Map` of old→new
   UUIDs is created per call.
2. The old realm `id` is captured and pre-mapped to a fresh UUID.
3. `renameRealm` — renames the realm, rewrites `displayName`/`displayNameHtml`,
   `default-roles-<realm>` role names, and client `redirectUris`/`baseUrl`/`adminUrl`
   (`/realms/<old>/` → `/realms/<new>/`).
4. `removeMaskedSecrets` — deletes masked values (`"**********"`) wherever found (client secrets,
   identity provider `clientSecret`, LDAP `bindCredential`) so Keycloak regenerates them on import.
5. `replaceUUIDs` — recursive walk replacing every UUID-shaped string value, except values under
   keys in the `CONFIG_KEYS` skip list (see below). Consistency comes from the UUID map: the same
   old UUID always maps to the same new UUID, which is what preserves cross-references
   (role containers, service accounts, flow bindings).
6. The top-level realm `id` is set to the new UUID.
7. `fixContainerIds` — second pass catching any remaining `containerId` still equal to the old
   realm id.

`cloneRealm` returns `{ realm, summary }`, where `summary = { uuidsReplaced, secretsRemoved,
oldRealmName, newRealmName }`.

## Invariants — do not break these

- **The `CONFIG_KEYS` skip list is load-bearing.** Keys like `clientId`, `alias`, `providerId`,
  `authenticator`, `protocolMapper`, `user.attribute`, `claim.name`, `user.session.note`,
  `serviceAccountClientId` hold *identifiers or config values that may look like UUIDs but must
  survive unchanged* — rewriting them breaks clients ("account", "admin-cli", etc.) and mappers.
  When adding UUID coverage, extend the skip list rather than narrowing it.
- **Same-UUID-same-replacement.** All replacement must go through the UUID map. Generating an
  independent UUID for a repeated value severs the relationship it encodes.
- **Masked secrets are deleted, never rewritten.** Keycloak masks secrets as `**********` in
  exports; deleting the field is what triggers regeneration on import.
- **No dependencies.** The package must stay runnable with nothing but the Node.js standard
  library (`crypto.randomUUID`, `fs`). `engines.node` in `package.json` gates the minimum version.

## Known Quirks / Gotchas

- `renameRealm` builds `new RegExp(escapeRegExp(oldName), "gi")` — the old realm name is escaped
  before use, so regex metacharacters in realm names are handled safely.
- README examples use a generic `myrealm` name; treat any specific counts (UUIDs replaced, etc.)
  as illustrative, not as current state.

## After-Import Checklist (manual, per README)

1. Import the generated JSON via Admin Console → Add Realm → Select file.
2. Regenerate/copy client secrets for confidential clients and update consuming apps.
3. Re-enter identity provider secrets and LDAP bind credentials (also cleared by the tool).
4. Verify redirect URIs, authentication flows, and SMTP settings (SMTP is intentionally left
   untouched by the tool).

Automated verification: `npm test` runs the `node:test` suite; CI runs it on every push/PR.

## Commit Convention

Concise, imperative, lowercase subject lines describing the change (matching the existing history:
`update default realm names in Keycloak cloning script`). Single `main` branch, no tags or releases,
no commitlint/husky tooling in this repo.

Types: feat, fix, docs, refactor, test, chore, perf, ci. Branch patterns:`feat/`, `fix/`, `hotfix/`, `docs/`, `chore/`, `refactor/`.

**Commit generation rules (Claude Code):**

- The user generates every commit by running `/pc:commit` manually. Do not run `git commit` yourself — stage changes only and hand off.
- Never add `Co-Authored-By: Claude` (or any AI co-author trailer) to commit messages.
- Keep the subject line ≤ **100** characters, with a blank line before any body; wrap body lines at 100 too.

## Delegation

The higher your tier, the more you delegate. Push the work down, keep your own context for judgment. Brief every child: the context, t
he why, what done looks like. It starts blank and inherits nothing.

| Model    | Best for             | Delegate?        | Effort |
| -------- | -------------------- | ---------------- | ------ |
| Haiku    | bulk mechanical      | never            | low    |
| Sonnet   | scoped research      | when it helps    | medium |
| Opus 4.8 | multi-step reasoning | on clear benefit | high   |
| Opus 4.8 | judgment, taste      | by default       | xhigh  |

Opus 4.8 is the top delegable tier: high for multi-step execution, xhigh reserved for the judgment calls.

## Escalation

The parent doesn't have to be the top model. A Sonnet parent spawns an Opus 4.8 child for the one hard call. The child answers and ret
urns. Work above your tier? Return it, don't burn tokens on it.

## Response Style

Draw it, don't narrate it. Lead with the answer. Prefer the tightest exact form: compare ⇒ table ·
hierarchy ⇒ indented tree · short flow ⇒ `A → B → C` (one line max, else numbered steps) · decision ⇒
`if X → P · else → Q` · one fact ⇒ one line. Cut filler ("just", "basically", hedging, pleasantries);
never restate the question; keep every identifier/path/number/command exact — compression never costs
precision. Drop to prose only for security warnings, irreversible-action confirmations, genuinely
complex trade-off discussion, or when the user asks you to expand.
