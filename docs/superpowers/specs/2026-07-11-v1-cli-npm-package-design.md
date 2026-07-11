# keycloak-realm-clone v1.0 — CLI + npm package design

**Date:** 2026-07-11
**Status:** Approved (Approach A — zero-dependency single package)

## Goal

Turn the personal `script.js` into a polished, discoverable public tool: a zero-runtime-dependency
npm package runnable via `npx keycloak-realm-clone`, with the known bugs fixed, tests, CI, a
license, and a public-facing README. Discoverability via npm search, GitHub SEO (topics,
description, badges), and a blog post draft.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Distribution | npm package `keycloak-realm-clone` (name confirmed free) with `npx` bin |
| Scope | Bug fixes + proper CLI + tests; no Keycloak Admin API mode (possible v2) |
| License | MIT |
| Outreach | GitHub SEO (topics/description/badges) + blog post draft; no SO/awesome-list work now |
| Dependencies | Zero runtime deps; `node:test` for tests; hand-rolled arg parsing |

## Architecture

```
bin/cli.js       ← executable entry: arg parsing, file I/O, console output, exit codes
src/clone.js     ← pure transform: cloneRealm(realmJson, options) → { realm, summary }
index.js         ← library entry: module.exports = { cloneRealm }
test/clone.test.js
test/fixtures/sample-realm-export.json   ← sanitized fixture (generic names only)
.github/workflows/ci.yml
package.json, LICENSE, README.md, docs/blog-post.md
```

`src/clone.js` is a pure function — no `fs`, no `process`, no module-level state. It takes the
parsed export object plus `{ newRealmName, oldRealmName? }` and returns the transformed object
plus a summary (`{ uuidsReplaced, secretsRemoved: [paths], oldRealmName, newRealmName }`).
This makes it unit-testable and usable as a library.

## CLI contract (breaking change vs old script — acceptable pre-1.0)

```
npx keycloak-realm-clone <export.json> <new-realm-name> [options]

  -o, --output <file>   Output path (default: <new-realm-name>-realm-export.json)
  --old-name <name>     Override auto-detected source realm name
  --dry-run             Print change summary, write nothing
  -h, --help            Usage
  -v, --version         Version (read from package.json)
```

- `<new-realm-name>` is **required** — removes the silent hardcoded `ajax-dev`/`ajax-demo` defaults.
- Old realm name is auto-detected from the export's `realm` field; `--old-name` overrides.
- Exit codes: 0 success, 1 usage error, 2 processing error (unreadable file, invalid JSON,
  missing `realm`/`id` fields).
- Refuses to overwrite the input file with the output file.

## Transform behavior (bug fixes)

1. **No hardcoded realm names.** Defaults removed entirely.
2. **Regex escaping.** Realm names are escaped before use in `new RegExp(...)` for
   display-name rewrites (realm `my.realm` must not corrupt output).
3. **Masked-secret coverage.** Any string value equal to `"**********"` anywhere in the export
   is deleted (client secrets, identity provider `clientSecret`, component config values such as
   LDAP bind credentials). Each removal is recorded in the summary so the CLI can print a
   "reconfigure these after import" checklist.
4. **UUID map is function-local.** No module-level `Map`; consistency (same old UUID → same new
   UUID) is preserved within a single `cloneRealm` call.
5. **Existing invariants preserved** (per AGENTS.md): `configKeys` skip list unchanged in intent
   (`clientId`, `alias`, `providerId`, `authenticator`, `protocolMapper`, `user.attribute`,
   `claim.name`, `user.session.note`, `serviceAccountClientId`); same-UUID-same-replacement via
   the map; masked secrets deleted, never rewritten; `containerId` second pass retained.
6. **Verified by tests:** `authenticationFlowBindingOverrides` values and `defaultRole.containerId`
   are covered by the UUID map (add fixture data proving it).

## Tests (`node:test`, zero deps)

Fixture: a sanitized realm export (`myrealm`) containing realm roles, client roles, clients with
redirect URIs/baseUrl/adminUrl, a masked client secret, an identity provider with masked
`clientSecret`, a component with masked config value, protocol mappers, auth flows with
`authenticationFlowBindingOverrides`, `defaultRole`, and a service account user.

Cases:
- Every UUID-shaped value replaced; identical old UUIDs map to identical new UUIDs across the tree.
- No old UUID from the input survives in the output (except values under skip-list keys).
- Skip-list keys untouched even when UUID-shaped.
- Realm rename: `realm`, `displayName`/`displayNameHtml`, `default-roles-<realm>`,
  `/realms/<old>/` in redirectUris/baseUrl/adminUrl.
- Realm name with regex metacharacters (`my.realm`) renames correctly.
- All `"**********"` values deleted and reported in summary.
- `containerId` equal to old realm id rewritten to new realm id.
- Output survives `JSON.parse(JSON.stringify(...))` and input object is not mutated
  (clone-then-transform).

## Packaging & repo

- `package.json`: name `keycloak-realm-clone`, version `1.0.0`, `bin`, `main: index.js`,
  `files: ["bin", "src", "index.js", "README.md", "LICENSE"]`, `engines.node >= 18` (matches the
  `node:test` requirement and CI matrix),
  keywords: keycloak, realm, clone, export, import, sso, iam, oidc, identity, migration.
  `scripts.test = "node --test"`.
- `LICENSE`: MIT, copyright Vimukthi Jayawardana.
- `.gitignore`: add `*-realm-export.json`, `node_modules/` (protect against committing real exports).
- CI: `.github/workflows/ci.yml` — Node 18/20/22 matrix, `npm test`, badge in README.
- Old `script.js` removed (replaced by `bin/cli.js` + `src/clone.js`); AGENTS.md updated to match
  the new layout and usage.

## README rewrite

Public-facing, generic examples only (no ajax/maji/Status sections). Order: badges (CI, npm,
license) → one-paragraph problem statement with the exact error message (SEO) → quick start
(`npx`) → options table → what gets updated / preserved / manual steps → import walkthrough →
how it works → troubleshooting → license. Link Keycloak issue #24770.

## Discoverability

- Repo description + topics via `gh repo edit`: `keycloak`, `sso`, `iam`, `oidc`,
  `identity-management`, `keycloak-realm`, `cli`, `nodejs`, `devops`.
- Blog post draft at `docs/blog-post.md` targeting the query
  "keycloak duplicate key value violates unique constraint import realm"; user publishes to dev.to.
- npm publish performed by the user (needs npm account): `npm login && npm publish` — exact
  commands handed off at the end.

## Out of scope (v2 candidates)

Keycloak Admin API mode (export+import in one command), Stack Overflow/awesome-list outreach,
partial-export (`users.json`) support.
