# AGENTS.md

This file provides shared guidance to AI coding agents when working with code in this repository.

## Project Overview

A dependency-free Node.js CLI script that clones Keycloak realm exports so they can be re-imported
as a new realm **on the same Keycloak instance**. A raw re-import fails with UUID collision errors
(`duplicate key value violates unique constraint`) because every internal ID in the export already
exists in the database — see [keycloak/keycloak#24770](https://github.com/keycloak/keycloak/issues/24770).
The script rewrites all UUIDs (preserving relationships), renames the realm, and fixes
realm-referencing fields so the output imports cleanly.

## Repository Layout

```
script.js    ← the entire implementation (Node.js, no dependencies — uses only fs + crypto)
README.md    ← user-facing docs: problem, usage, import walkthrough, troubleshooting
AGENTS.md    ← this file (canonical AI guidance; CLAUDE.md just points here)
CLAUDE.md    ← one-line pointer to AGENTS.md
```

There is no `package.json`, no build step, no test suite, and no CI. Verification is manual:
run the script against a real realm export and import the output into Keycloak.

## Usage

```bash
# Auto-detect realm name from the export (targets the hardcoded default new name)
node script.js "your-realm-export.json"

# Explicit old and new realm names
node script.js "your-realm-export.json" "old-realm" "new-realm"
```

Output is written to `<new-realm-name>-realm-export.json` in the working directory.

## How script.js Works (processing order matters)

`processKeycloakJSON` runs these steps in order:

1. `uuidMap.clear()` — the module-level `Map` of old→new UUIDs is reset per run.
2. The old realm `id` is captured and pre-mapped to a fresh UUID.
3. `updateRealmSpecificFields` — renames the realm, rewrites `displayName`/`displayNameHtml`,
   `default-roles-<realm>` role names, client `redirectUris`/`baseUrl`/`adminUrl`
   (`/realms/<old>/` → `/realms/<new>/`), and **deletes masked client secrets**
   (`"**********"`) so Keycloak regenerates them on import.
4. `replaceUUIDs` — recursive walk replacing every UUID-shaped string value, except values under
   keys in the `configKeys` skip list (see below). Consistency comes from `uuidMap`: the same old
   UUID always maps to the same new UUID, which is what preserves cross-references
   (role containers, service accounts, flow bindings).
5. The top-level realm `id` is set to the new UUID.
6. `fixContainerIds` — second pass catching any remaining `containerId` still equal to the old
   realm id.

## Invariants — do not break these

- **The `configKeys` skip list is load-bearing.** Keys like `clientId`, `alias`, `providerId`,
  `authenticator`, `protocolMapper`, `user.attribute`, `claim.name`, `serviceAccountClientId`
  hold *identifiers or config values that may look like UUIDs but must survive unchanged* —
  rewriting them breaks clients ("account", "admin-cli", etc.) and mappers. When adding UUID
  coverage, extend the skip list rather than narrowing it.
- **Same-UUID-same-replacement.** All replacement must go through `uuidMap`. Generating an
  independent UUID for a repeated value severs the relationship it encodes.
- **Masked secrets are deleted, never rewritten.** Keycloak masks secrets as `**********` in
  exports; deleting the field is what triggers regeneration on import.
- **No dependencies.** The script must stay runnable as `node script.js` with nothing but the
  Node.js standard library (`fs`, `crypto.randomUUID` — requires Node ≥ 14.17).

## Known Quirks / Gotchas

- The default realm names when not supplied on the CLI are hardcoded in `main()`
  (`oldRealmName = "ajax-dev"`, `newRealmName = "ajax-demo"`). Auto-detection overrides the old
  name only; the new name stays the hardcoded default unless passed as the third argument.
- `updateRealmSpecificFields` builds `new RegExp(oldRealmName, "gi")` from user input without
  escaping — realm names containing regex metacharacters will misbehave in display-name rewrites.
- README examples reference a specific historical run (realm "ajax" → `ajax-dev-realm-export.json`,
  137 UUIDs). Treat those as illustrative, not as current state.
- The usage string in `main()` says `keycloak-realm-clone.js` but the file is `script.js` — keep
  docs consistent with the actual filename when touching either.

## After-Import Checklist (manual, per README)

1. Import the generated JSON via Admin Console → Add Realm → Select file.
2. Regenerate/copy client secrets for confidential clients and update consuming apps.
3. Verify redirect URIs, authentication flows, and SMTP settings (SMTP is intentionally left
   untouched by the script).

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
