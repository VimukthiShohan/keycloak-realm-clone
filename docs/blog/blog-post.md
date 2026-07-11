---
title: How to clone a Keycloak realm on the same instance (fixing "duplicate key value violates unique constraint")
published: false
tags: keycloak, sso, devops, nodejs
---

If you've ever tried to duplicate a Keycloak realm on the same server — say, to spin up a
`myrealm-dev` realm alongside your existing `myrealm` — you've probably hit this wall:

1. Export the realm from the Admin Console (**Realm settings → Action → Partial export**, with
   clients and groups/roles included).
2. Rename it in a text editor, or in the import dialog's "realm name" field.
3. Import it back into the same Keycloak instance.
4. Watch it fail with:

```
ERROR: duplicate key value violates unique constraint "constraint_a"
Detail: Key (id)=(51e1a26d-c24f-4454-9a34-708f1fc14917) already exists.
```

## Why this happens

A realm export isn't just configuration — it's a snapshot of database rows. Every role, client,
user, protocol mapper, component, and authentication flow in the export carries the same internal
UUID it has in the live database. Renaming the `realm` field changes what the realm is *called*,
but it does nothing to the dozens (often hundreds) of UUIDs referenced throughout the file. Import
that JSON into the instance it came from, and Keycloak tries to insert rows whose primary keys
already exist. Every single one collides.

This is a known limitation, tracked upstream as
[keycloak/keycloak#24770](https://github.com/keycloak/keycloak/issues/24770). Keycloak's exporter
was never designed to produce an import-anywhere-including-here artifact — it assumes you're
moving the realm to a different instance (dev → staging → prod), where the UUID space is
independent.

## The manual fix (and why it doesn't scale)

In principle you can fix this by hand: open the export JSON, find every UUID, and replace it with
a fresh one, while keeping track of which old UUID maps to which new UUID so that references
between objects (a role's `containerId`, a client's `serviceAccountClientId`, a flow's execution
list) still point at the right thing after the rewrite. For a small realm with a handful of
clients this is tedious but doable in an editor with careful find-and-replace. For a realm with
custom roles, several clients, an identity provider, and a full set of authentication flows, it's
easily 100+ UUIDs, and one missed reference silently breaks a login flow instead of failing loudly
at import time. That risk — a broken relationship you don't notice until a user can't log in — is
the real reason this needs tooling instead of a text editor.

## The tool: keycloak-realm-clone

[`keycloak-realm-clone`](https://github.com/VimukthiShohan/keycloak-realm-clone) is a
dependency-free Node.js CLI (and library) that automates exactly this rewrite. It ships on npm, so
there's nothing to install ahead of time:

```bash
npx keycloak-realm-clone realm-export.json myrealm-dev
```

This reads `realm-export.json`, produces `myrealm-dev-realm-export.json`, and prints a summary of
what changed. Options:

```
Usage: keycloak-realm-clone <export.json> <new-realm-name> [options]

Options:
  -o, --output <file>   Output path (default: <new-realm-name>-realm-export.json)
  --old-name <name>     Override auto-detected source realm name
  --dry-run             Print change summary, write nothing
  -h, --help            Show this help
  -v, --version         Show version
```

### What it rewrites

- Every UUID-shaped value in the export — role IDs, client IDs, user IDs, service account
  references, protocol mapper IDs, component IDs, authentication flow IDs — remapped through a
  single old→new table, so the *same* old UUID always becomes the *same* new UUID. That's what
  keeps a role's container reference, a client's service account link, and a flow's execution
  chain intact after the rewrite.
- The realm name itself: `realm`, `displayName`, `displayNameHtml`, `default-roles-<realm>` role
  names, and every client's `redirectUris`/`baseUrl`/`adminUrl` (`/realms/<old>/` →
  `/realms/<new>/`).
- Masked secrets. Keycloak exports secrets as the literal string `**********` rather than the real
  value — client secrets, identity provider `clientSecret`, LDAP `bindCredential`. The tool deletes
  these fields outright rather than leaving the placeholder, which is what makes Keycloak generate
  fresh values on import instead of trying (and failing) to import the literal string
  `**********` as a secret.

It deliberately leaves a short list of fields untouched even though some of their values are
UUID-shaped: `clientId`, `alias`, `providerId`, `authenticator`, `protocolMapper`,
`user.attribute`, `claim.name`, `user.session.note`, and `serviceAccountClientId`. These hold
identifiers or configuration Keycloak matches by string value (like the `clientId` `account` or
`admin-cli`) — rewriting them would silently break built-in clients and mappers.

For programmatic use, it's also a library:

```js
const { cloneRealm } = require("keycloak-realm-clone");
const { realm, summary } = cloneRealm(exportJson, {
  newRealmName: "myrealm-dev",
});
// summary: { uuidsReplaced, secretsRemoved, oldRealmName, newRealmName }
```

## After-import checklist

The tool gets you a JSON file that imports without collisions, but a few things still need a human:

1. **Import** the generated file via Admin Console → Add realm → Select file.
2. **Client secrets** — open the Credentials tab for each confidential client and copy the newly
   generated secret into whatever app consumes it.
3. **Identity provider / LDAP credentials** — re-enter the IdP secret or LDAP bind password; both
   were cleared for the same reason client secrets were.
4. **SMTP and theme settings** — intentionally left untouched; review them for the new realm.

## Try it

```bash
npx keycloak-realm-clone your-realm-export.json myrealm-dev
```

Source, issues, and the full README are at
[github.com/VimukthiShohan/keycloak-realm-clone](https://github.com/VimukthiShohan/keycloak-realm-clone).
