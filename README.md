# keycloak-realm-clone

[![CI](https://github.com/VimukthiShohan/keycloak-realm-clone/actions/workflows/ci.yml/badge.svg)](https://github.com/VimukthiShohan/keycloak-realm-clone/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/keycloak-realm-clone)](https://www.npmjs.com/package/keycloak-realm-clone)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Clone a Keycloak realm export so it can be re-imported as a **new realm on the same Keycloak
instance**.

## The problem

Export a realm, rename it in the Admin Console import dialog, and try to import it back into the
same instance — it fails:

```
ERROR: duplicate key value violates unique constraint "constraint_a"
Detail: Key (id)=(51e1a26d-c24f-4454-9a34-708f1fc14917) already exists.
```

Every internal ID in a realm export (realm ID, role IDs, client IDs, user IDs, component IDs,
flow IDs...) is a UUID baked in at export time. Renaming the realm doesn't touch any of them, so
importing the export a second time collides with rows that already exist in the database. This is
a known Keycloak limitation — see [keycloak/keycloak#24770](https://github.com/keycloak/keycloak/issues/24770).

`keycloak-realm-clone` rewrites every UUID in the export (consistently, so relationships are
preserved), renames the realm, fixes realm-referencing fields, and clears masked secrets so the
result imports cleanly as a brand-new realm.

## Quick start

```bash
npx keycloak-realm-clone realm-export.json myrealm-dev
```

This reads `realm-export.json`, clones it as realm `myrealm-dev`, and writes
`myrealm-dev-realm-export.json` in the current directory.

## Options

```
Usage: keycloak-realm-clone <export.json> <new-realm-name> [options]

Options:
  -o, --output <file>   Output path (default: <new-realm-name>-realm-export.json)
  --old-name <name>     Override auto-detected source realm name
  --dry-run             Print change summary, write nothing
  -h, --help            Show this help
  -v, --version         Show version
```

| Option | Description |
| --- | --- |
| `<export.json>` | Path to the realm export to clone (required) |
| `<new-realm-name>` | Name for the cloned realm (required) |
| `-o, --output <file>` | Output path. Defaults to `<new-realm-name>-realm-export.json` |
| `--old-name <name>` | Override the source realm name auto-detected from the export's `realm` field |
| `--dry-run` | Print the change summary without writing an output file |
| `-h, --help` | Show usage |
| `-v, --version` | Show installed version |

Exit codes: `0` success, `1` usage error, `2` processing error. The tool refuses to overwrite the
input file.

## What gets updated

- Realm ID and name, `displayName` / `displayNameHtml`, `default-roles-<realm>` role names
- All role IDs, container references, client IDs (internal UUIDs), user IDs, service account
  references, protocol mapper IDs, component IDs, authentication flow IDs — every UUID-shaped
  value in the export, remapped consistently
- Client `redirectUris`, `baseUrl`, `adminUrl` (`/realms/<old>/` → `/realms/<new>/`)
- Masked client secrets, identity provider `clientSecret`, and LDAP `bindCredential` values
  (`**********`) are deleted so Keycloak regenerates them on import

## What's preserved

- Client identifiers (`clientId` values like `account`, `admin-cli`, or your own clients)
- Provider IDs, authenticator names, protocol mapper types, and other configuration values that
  happen to look like UUIDs
- User attributes and claim names
- Descriptions and display names that aren't realm-specific

## Requires manual action after import

- **Secrets**: confidential client secrets, IdP secrets, and LDAP bind credentials are cleared by
  the tool — copy the freshly generated values from the Admin Console (or reconfigure your LDAP
  provider) and update any consuming apps
- **SMTP settings**: intentionally left untouched — review before relying on email
- **Theme settings**: may need realm-specific adjustments

## Import walkthrough

1. In the Keycloak Admin Console, go to **Add realm**.
2. Choose **Select file**, upload the generated `myrealm-dev-realm-export.json`, and click **Create**.
3. For each confidential client, open the **Credentials** tab, copy the new secret, and update
   your applications.
4. If the realm uses an identity provider or LDAP/Kerberos user federation, re-enter the cleared
   secret / bind credential.
5. Verify redirect URIs, authentication flows, and SMTP configuration.

## How it works

1. The old realm ID is captured and pre-mapped to a fresh UUID in an old→new UUID map.
2. The realm is renamed: `realm`, `displayName`/`displayNameHtml`, `default-roles-<realm>` names,
   and client `redirectUris`/`baseUrl`/`adminUrl` are rewritten from the old to the new realm name.
3. Masked secrets (`**********`) are deleted wherever they appear — client secrets, identity
   provider secrets, LDAP bind credentials.
4. Every UUID-shaped string in the export is replaced via the map — except values under a small
   set of config keys (`clientId`, `alias`, `providerId`, `authenticator`, `protocolMapper`,
   `user.attribute`, `claim.name`, `user.session.note`, `serviceAccountClientId`) that hold
   identifiers or configuration which may look like a UUID but must survive unchanged. The same
   old UUID always maps to the same new UUID, which is what preserves cross-references (role
   containers, service accounts, flow bindings).
5. A final pass fixes any remaining `containerId` still pointing at the old realm ID.

## Library usage

```js
const { cloneRealm } = require("keycloak-realm-clone");
const exportJson = require("./realm-export.json");

const { realm, summary } = cloneRealm(exportJson, {
  newRealmName: "myrealm-dev",
  oldRealmName: "myrealm", // optional — defaults to exportJson.realm
});

// summary = {
//   uuidsReplaced: 133,
//   secretsRemoved: ["clients[2].secret", "identityProviders[0].config.clientSecret"],
//   oldRealmName: "myrealm",
//   newRealmName: "myrealm-dev",
// }
```

`cloneRealm` does not mutate its input; it returns a new realm object plus a summary of the
changes made.

## Troubleshooting

**Still seeing a UUID collision error on import?** Make sure you're importing the generated
output file, not the original export, and that the target instance doesn't already contain a
realm reusing one of the same names/IDs. If you find a value that wasn't rewritten, please open an
issue with a redacted excerpt.

**A client stopped working after import.** Check whether its `clientId` changed — it shouldn't:
`clientId` is in the preserved-values list. If a custom field looks UUID-shaped and needs to
survive rewriting, that's what the config key skip list is for; open an issue to get it added.

## License

[MIT](LICENSE)
