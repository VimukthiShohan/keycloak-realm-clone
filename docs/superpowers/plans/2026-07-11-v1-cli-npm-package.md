# keycloak-realm-clone v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `script.js` into a zero-dependency npm package (`keycloak-realm-clone`) with a proper CLI, bug fixes, tests, CI, MIT license, and public README.

**Architecture:** Pure transform function `cloneRealm()` in `src/clone.js` (no fs/process/module state), thin CLI wrapper in `bin/cli.js`, library entry `index.js`. Tests via built-in `node:test` against a sanitized fixture.

**Tech Stack:** Node.js ≥ 18, stdlib only (`crypto`, `fs`, `path`, `node:test`).

## Global Constraints

- Zero runtime dependencies; no `package.json` deps/devDeps at all.
- `engines.node >= 18`.
- npm package name: `keycloak-realm-clone`, version `1.0.0`.
- Commit rules: subject ≤ 100 chars, imperative lowercase, NO AI co-author trailers. Commits are made by the parent session via the `/pc:commit` skill — subagents must NOT run `git commit`; they stage nothing and report back.
- Spec: `docs/superpowers/specs/2026-07-11-v1-cli-npm-package-design.md`.

---

### Task 1: Fixture + core `cloneRealm` transform (UUIDs, rename, secrets)

**Files:**
- Create: `test/fixtures/sample-realm-export.json`
- Create: `src/clone.js`
- Create: `index.js`
- Create: `package.json`
- Test: `test/clone.test.js`

**Interfaces:**
- Produces: `cloneRealm(realmJson, { newRealmName, oldRealmName? }) → { realm, summary }` where `summary = { uuidsReplaced: number, secretsRemoved: string[], oldRealmName: string, newRealmName: string }`. Exported from `src/clone.js` and re-exported by `index.js` as `{ cloneRealm }`. Throws `Error` if `newRealmName` missing or input lacks `realm`/`id`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "keycloak-realm-clone",
  "version": "1.0.0",
  "description": "Clone a Keycloak realm export for re-import on the same instance: rewrites all UUIDs, renames the realm, and clears masked secrets to avoid duplicate key constraint errors.",
  "main": "index.js",
  "bin": { "keycloak-realm-clone": "bin/cli.js" },
  "files": ["bin", "src", "index.js", "README.md", "LICENSE"],
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=18" },
  "keywords": ["keycloak", "realm", "clone", "export", "import", "sso", "iam", "oidc", "identity", "migration"],
  "repository": { "type": "git", "url": "git+https://github.com/VimukthiShohan/keycloak-realm-clone.git" },
  "license": "MIT",
  "author": "Vimukthi Jayawardana"
}
```

- [ ] **Step 2: Create the fixture** `test/fixtures/sample-realm-export.json`

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "realm": "myrealm",
  "displayName": "MyRealm Portal",
  "displayNameHtml": "<b>myrealm</b>",
  "defaultRole": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "default-roles-myrealm",
    "containerId": "11111111-1111-1111-1111-111111111111"
  },
  "roles": {
    "realm": [
      {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "default-roles-myrealm",
        "containerId": "11111111-1111-1111-1111-111111111111"
      },
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "name": "uma_authorization",
        "containerId": "11111111-1111-1111-1111-111111111111"
      }
    ],
    "client": {
      "account": [
        {
          "id": "44444444-4444-4444-4444-444444444444",
          "name": "view-profile",
          "containerId": "55555555-5555-5555-5555-555555555555"
        }
      ]
    }
  },
  "clients": [
    {
      "id": "55555555-5555-5555-5555-555555555555",
      "clientId": "account",
      "baseUrl": "https://kc.example.com/realms/myrealm/account/",
      "redirectUris": ["https://kc.example.com/realms/myrealm/account/*"],
      "adminUrl": "https://kc.example.com/realms/myrealm/admin/",
      "secret": "**********",
      "protocolMappers": [
        {
          "id": "66666666-6666-6666-6666-666666666666",
          "name": "username",
          "protocolMapper": "oidc-usermodel-property-mapper",
          "config": { "user.attribute": "username", "claim.name": "preferred_username" }
        }
      ]
    },
    {
      "id": "77777777-7777-7777-7777-777777777777",
      "clientId": "88888888-8888-8888-8888-888888888888",
      "authenticationFlowBindingOverrides": {
        "browser": "99999999-9999-9999-9999-999999999999"
      }
    }
  ],
  "identityProviders": [
    { "alias": "google", "providerId": "google", "config": { "clientSecret": "**********", "clientId": "google-oauth-id" } }
  ],
  "components": {
    "org.keycloak.storage.UserStorageProvider": [
      {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "name": "ldap",
        "providerId": "ldap",
        "config": { "bindCredential": ["**********"] }
      }
    ]
  },
  "authenticationFlows": [
    { "id": "99999999-9999-9999-9999-999999999999", "alias": "browser", "providerId": "basic-flow" }
  ],
  "users": [
    {
      "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "username": "service-account-myclient",
      "serviceAccountClientId": "88888888-8888-8888-8888-888888888888"
    }
  ]
}
```

- [ ] **Step 3: Write failing tests** `test/clone.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { cloneRealm } = require("../index.js");

const fixturePath = path.join(__dirname, "fixtures", "sample-realm-export.json");
const load = () => JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const collectStrings = (obj, out = []) => {
  if (Array.isArray(obj)) obj.forEach((v) => collectStrings(v, out));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") out.push([k, v]);
      else collectStrings(v, out);
    }
  return out;
};

test("replaces every UUID consistently and none of the old ones survive", () => {
  const input = load();
  const oldUuids = new Set(
    collectStrings(input)
      .filter(([, v]) => /^[0-9a-f-]{36}$/.test(v))
      .map(([, v]) => v)
  );
  const { realm } = cloneRealm(input, { newRealmName: "myrealm-dev" });
  const skip = new Set(["clientId", "serviceAccountClientId", "alias", "providerId", "authenticator", "protocolMapper", "user.attribute", "claim.name", "user.session.note"]);
  for (const [key, value] of collectStrings(realm)) {
    if (skip.has(key)) continue;
    assert.ok(!oldUuids.has(value), `old UUID survived at key "${key}": ${value}`);
  }
  // same old UUID → same new UUID: defaultRole appears twice
  assert.equal(realm.defaultRole.id, realm.roles.realm[0].id);
  // relationship preserved: client role containerId still points at the "account" client
  assert.equal(realm.roles.client.account[0].containerId, realm.clients[0].id);
  // flow binding override follows the flow's new id
  assert.equal(realm.clients[1].authenticationFlowBindingOverrides.browser, realm.authenticationFlows[0].id);
});

test("skip-list keys survive even when UUID-shaped", () => {
  const { realm } = cloneRealm(load(), { newRealmName: "myrealm-dev" });
  assert.equal(realm.clients[1].clientId, "88888888-8888-8888-8888-888888888888");
  assert.equal(realm.users[0].serviceAccountClientId, "88888888-8888-8888-8888-888888888888");
});

test("renames realm everywhere", () => {
  const { realm } = cloneRealm(load(), { newRealmName: "myrealm-dev" });
  assert.equal(realm.realm, "myrealm-dev");
  assert.equal(realm.displayName, "myrealm-dev Portal");
  assert.equal(realm.defaultRole.name, "default-roles-myrealm-dev");
  assert.equal(realm.roles.realm[0].name, "default-roles-myrealm-dev");
  assert.ok(realm.clients[0].baseUrl.includes("/realms/myrealm-dev/"));
  assert.ok(realm.clients[0].redirectUris[0].includes("/realms/myrealm-dev/"));
  assert.ok(realm.clients[0].adminUrl.includes("/realms/myrealm-dev/"));
});

test("realm name with regex metacharacters does not corrupt output", () => {
  const input = load();
  input.realm = "my.realm";
  input.displayName = "my.realm portal (myArealm untouched)";
  const { realm } = cloneRealm(input, { newRealmName: "my-dev" });
  assert.equal(realm.displayName, "my-dev portal (myArealm untouched)");
});

test("deletes all masked secrets and reports them", () => {
  const { realm, summary } = cloneRealm(load(), { newRealmName: "myrealm-dev" });
  assert.ok(!("secret" in realm.clients[0]));
  assert.ok(!("clientSecret" in realm.identityProviders[0].config));
  assert.ok(!("bindCredential" in realm.components["org.keycloak.storage.UserStorageProvider"][0].config));
  assert.equal(summary.secretsRemoved.length, 3);
  assert.ok(JSON.stringify(realm).indexOf("**********") === -1);
});

test("containerId referencing the old realm id is rewritten to the new realm id", () => {
  const { realm } = cloneRealm(load(), { newRealmName: "myrealm-dev" });
  assert.equal(realm.roles.realm[0].containerId, realm.id);
  assert.equal(realm.defaultRole.containerId, realm.id);
  assert.notEqual(realm.id, "11111111-1111-1111-1111-111111111111");
});

test("does not mutate input and validates arguments", () => {
  const input = load();
  const snapshot = JSON.stringify(input);
  cloneRealm(input, { newRealmName: "x" });
  assert.equal(JSON.stringify(input), snapshot);
  assert.throws(() => cloneRealm(input, {}), /newRealmName/);
  assert.throws(() => cloneRealm({ foo: 1 }, { newRealmName: "x" }), /realm export/);
});

test("oldRealmName override is honored", () => {
  const input = load();
  const { summary } = cloneRealm(input, { newRealmName: "n", oldRealmName: "other" });
  assert.equal(summary.oldRealmName, "other");
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../index.js'`

- [ ] **Step 5: Implement** `src/clone.js`

```js
const crypto = require("crypto");

const MASKED_SECRET = "**********";
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Keys whose values are identifiers/config that may look like UUIDs but must survive unchanged.
const CONFIG_KEYS = new Set([
  "user.attribute",
  "claim.name",
  "user.session.note",
  "clientId",
  "serviceAccountClientId",
  "authenticator",
  "protocolMapper",
  "providerId",
  "alias",
]);

const isUUID = (v) => typeof v === "string" && UUID_RE.test(v);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const removeMaskedSecrets = (obj, pathStr, removed) => {
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      if (obj[i] === MASKED_SECRET) {
        obj.splice(i, 1);
        removed.push(`${pathStr}[${i}]`);
      } else removeMaskedSecrets(obj[i], `${pathStr}[${i}]`, removed);
    }
  } else if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const childPath = pathStr ? `${pathStr}.${key}` : key;
      if (obj[key] === MASKED_SECRET) {
        delete obj[key];
        removed.push(childPath);
      } else if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] === MASKED_SECRET) {
        // Keycloak component config values are single-element arrays
        delete obj[key];
        removed.push(childPath);
      } else removeMaskedSecrets(obj[key], childPath, removed);
    }
  }
};

const replaceUUIDs = (obj, uuidMap) => {
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (isUUID(item)) {
        if (!uuidMap.has(item)) uuidMap.set(item, crypto.randomUUID());
        obj[i] = uuidMap.get(item);
      } else replaceUUIDs(item, uuidMap);
    });
  } else if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") replaceUUIDs(obj[key], uuidMap);
      else if (!CONFIG_KEYS.has(key) && isUUID(obj[key])) {
        if (!uuidMap.has(obj[key])) uuidMap.set(obj[key], crypto.randomUUID());
        obj[key] = uuidMap.get(obj[key]);
      }
    }
  }
};

const fixContainerIds = (obj, oldRealmId, newRealmId) => {
  if (Array.isArray(obj)) obj.forEach((item) => fixContainerIds(item, oldRealmId, newRealmId));
  else if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key === "containerId" && obj[key] === oldRealmId) obj[key] = newRealmId;
      else if (typeof obj[key] === "object") fixContainerIds(obj[key], oldRealmId, newRealmId);
    }
  }
};

const renameRealm = (realm, oldName, newName) => {
  realm.realm = newName;
  const namePattern = new RegExp(escapeRegExp(oldName), "gi");
  for (const field of ["displayName", "displayNameHtml"]) {
    if (typeof realm[field] === "string") realm[field] = realm[field].replace(namePattern, newName);
  }
  const oldDefaultRole = `default-roles-${oldName}`;
  const newDefaultRole = `default-roles-${newName}`;
  if (realm.defaultRole && realm.defaultRole.name) {
    realm.defaultRole.name = realm.defaultRole.name.replace(oldDefaultRole, newDefaultRole);
  }
  if (realm.roles && Array.isArray(realm.roles.realm)) {
    for (const role of realm.roles.realm) {
      if (role.name) role.name = role.name.replace(oldDefaultRole, newDefaultRole);
    }
  }
  if (Array.isArray(realm.clients)) {
    const oldPath = `/realms/${oldName}/`;
    const newPath = `/realms/${newName}/`;
    for (const client of realm.clients) {
      if (Array.isArray(client.redirectUris)) {
        client.redirectUris = client.redirectUris.map((uri) => uri.split(oldPath).join(newPath));
      }
      for (const field of ["baseUrl", "adminUrl"]) {
        if (typeof client[field] === "string") client[field] = client[field].split(oldPath).join(newPath);
      }
    }
  }
};

const cloneRealm = (realmJson, { newRealmName, oldRealmName } = {}) => {
  if (!newRealmName) throw new Error("newRealmName is required");
  if (!realmJson || typeof realmJson !== "object" || !realmJson.realm || !realmJson.id) {
    throw new Error('Input does not look like a Keycloak realm export (missing "realm" or "id")');
  }
  const realm = JSON.parse(JSON.stringify(realmJson));
  const oldName = oldRealmName || realm.realm;
  const oldRealmId = realm.id;
  const uuidMap = new Map();
  uuidMap.set(oldRealmId, crypto.randomUUID());
  const secretsRemoved = [];

  renameRealm(realm, oldName, newRealmName);
  removeMaskedSecrets(realm, "", secretsRemoved);
  replaceUUIDs(realm, uuidMap);
  realm.id = uuidMap.get(oldRealmId);
  fixContainerIds(realm, oldRealmId, realm.id);

  return {
    realm,
    summary: {
      uuidsReplaced: uuidMap.size,
      secretsRemoved,
      oldRealmName: oldName,
      newRealmName,
    },
  };
};

module.exports = { cloneRealm };
```

- [ ] **Step 6: Create** `index.js`

```js
module.exports = require("./src/clone.js");
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 8: Report back to parent for commit** (parent runs `/pc:commit`; subject like `add cloneRealm transform with tests and npm package scaffold`)

---

### Task 2: CLI (`bin/cli.js`)

**Files:**
- Create: `bin/cli.js`
- Delete: `script.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `cloneRealm` from `../index.js` (Task 1 signature).
- Produces: executable `bin/cli.js` per the CLI contract below.

CLI contract:
```
keycloak-realm-clone <export.json> <new-realm-name> [options]
  -o, --output <file>   output path (default: <new-realm-name>-realm-export.json)
  --old-name <name>     override auto-detected source realm name
  --dry-run             print summary, write nothing
  -h, --help            usage; -v, --version version from package.json
```
Exit codes: 0 success/help/version, 1 usage error, 2 processing error. Refuses to write output over the input file.

- [ ] **Step 1: Write failing tests** `test/cli.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const cli = path.join(__dirname, "..", "bin", "cli.js");
const fixture = path.join(__dirname, "fixtures", "sample-realm-export.json");

const run = (args, opts = {}) => {
  try {
    const stdout = execFileSync("node", [cli, ...args], { encoding: "utf8", ...opts });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
};

test("clones a realm export end to end", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krc-"));
  const res = run([fixture, "myrealm-dev"], { cwd: dir });
  assert.equal(res.code, 0);
  const out = JSON.parse(fs.readFileSync(path.join(dir, "myrealm-dev-realm-export.json"), "utf8"));
  assert.equal(out.realm, "myrealm-dev");
  assert.ok(res.stdout.includes("UUID"));
});

test("--output and --dry-run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krc-"));
  const outFile = path.join(dir, "custom.json");
  assert.equal(run([fixture, "myrealm-dev", "-o", outFile]).code, 0);
  assert.ok(fs.existsSync(outFile));

  const dry = run([fixture, "myrealm-dev", "--dry-run"], { cwd: dir });
  assert.equal(dry.code, 0);
  assert.ok(!fs.existsSync(path.join(dir, "myrealm-dev-realm-export.json")));
});

test("usage errors exit 1", () => {
  assert.equal(run([]).code, 1);
  assert.equal(run([fixture]).code, 1);
  assert.equal(run([fixture, "new", "--bogus"]).code, 1);
});

test("processing errors exit 2", () => {
  assert.equal(run(["/nonexistent.json", "new"]).code, 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krc-"));
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, "not json");
  assert.equal(run([bad, "new"]).code, 2);
});

test("refuses to overwrite the input file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krc-"));
  const input = path.join(dir, "in.json");
  fs.copyFileSync(fixture, input);
  const res = run([input, "myrealm-dev", "-o", input]);
  assert.equal(res.code, 1);
});

test("--help and --version exit 0", () => {
  assert.equal(run(["--help"]).code, 0);
  const v = run(["--version"]);
  assert.equal(v.code, 0);
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → new CLI tests FAIL (cli.js missing).

- [ ] **Step 3: Implement** `bin/cli.js`

```js
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { cloneRealm } = require("../index.js");
const { version } = require("../package.json");

const USAGE = `Usage: keycloak-realm-clone <export.json> <new-realm-name> [options]

Options:
  -o, --output <file>   Output path (default: <new-realm-name>-realm-export.json)
  --old-name <name>     Override auto-detected source realm name
  --dry-run             Print change summary, write nothing
  -h, --help            Show this help
  -v, --version         Show version`;

const fail = (code, message) => {
  console.error(`Error: ${message}`);
  if (code === 1) console.error(`\n${USAGE}`);
  process.exit(code);
};

const parseArgs = (argv) => {
  const opts = { positional: [], output: null, oldName: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "-v" || arg === "--version") return { version: true };
    if (arg === "-o" || arg === "--output") {
      opts.output = argv[++i];
      if (!opts.output) fail(1, `${arg} requires a value`);
    } else if (arg === "--old-name") {
      opts.oldName = argv[++i];
      if (!opts.oldName) fail(1, "--old-name requires a value");
    } else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("-")) fail(1, `unknown option: ${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
};

const main = () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(USAGE);
  if (opts.version) return console.log(version);
  if (opts.positional.length !== 2) fail(1, "expected <export.json> and <new-realm-name>");

  const [inputFile, newRealmName] = opts.positional;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  } catch (e) {
    fail(2, `cannot read ${inputFile}: ${e.message}`);
  }

  let result;
  try {
    result = cloneRealm(input, { newRealmName, oldRealmName: opts.oldName || undefined });
  } catch (e) {
    fail(2, e.message);
  }
  const { realm, summary } = result;

  const outputFile = opts.output || `${newRealmName}-realm-export.json`;
  if (path.resolve(outputFile) === path.resolve(inputFile)) {
    fail(1, "output file would overwrite the input file");
  }

  console.log(`Cloning realm "${summary.oldRealmName}" -> "${summary.newRealmName}"`);
  console.log(`UUIDs replaced: ${summary.uuidsReplaced}`);
  if (summary.secretsRemoved.length) {
    console.log("Masked secrets removed (reconfigure after import):");
    for (const p of summary.secretsRemoved) console.log(`  - ${p}`);
  }

  if (opts.dryRun) return console.log("Dry run: no file written.");

  fs.writeFileSync(outputFile, JSON.stringify(realm, null, 2), "utf8");
  console.log(`Wrote ${outputFile}`);
  console.log("\nNext steps:");
  console.log("1. Import the new realm JSON in the Keycloak Admin Console");
  console.log("2. Regenerate/copy secrets for confidential clients and identity providers");
  console.log("3. Review SMTP settings and test authentication flows");
};

main();
```

- [ ] **Step 4: Delete `script.js`** — `git rm script.js` (its behavior is fully replaced).

- [ ] **Step 5: Run tests** — `npm test` → all PASS. Also smoke: `node bin/cli.js test/fixtures/sample-realm-export.json demo --dry-run` prints summary, exit 0.

- [ ] **Step 6: Report back to parent for commit** (subject like `replace script.js with proper cli, add cli tests`)

---

### Task 3: License, .gitignore, CI

**Files:**
- Create: `LICENSE`
- Modify: `.gitignore`
- Create: `.github/workflows/ci.yml`

**Interfaces:** none consumed/produced beyond files.

- [ ] **Step 1: Create `LICENSE`** — standard MIT text, `Copyright (c) 2026 Vimukthi Jayawardana`.

- [ ] **Step 2: Update `.gitignore`** — ensure it contains:

```
node_modules/
*-realm-export.json
.idea/
```
(Keep existing entries; `test/fixtures/` is not matched by the pattern since the fixture is named `sample-realm-export.json` — it IS matched. Add an explicit negation: `!test/fixtures/sample-realm-export.json`.)

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

- [ ] **Step 4: Verify** — `npm test` still passes; `git check-ignore test/fixtures/sample-realm-export.json` exits non-zero (not ignored).

- [ ] **Step 5: Report back to parent for commit** (subject like `add mit license, ci workflow, and gitignore hardening`)

---

### Task 4: README rewrite, AGENTS.md update, blog post draft

**Files:**
- Modify: `README.md` (full rewrite)
- Modify: `AGENTS.md` (layout/usage sections)
- Create: `docs/blog-post.md`

**Interfaces:** Consumes CLI contract from Task 2 and summary fields from Task 1 — document them exactly.

- [ ] **Step 1: Rewrite `README.md`** with this structure (write real content, generic `myrealm` examples only — no ajax/maji/Status sections):
  1. `# keycloak-realm-clone` + badges: CI (`https://github.com/VimukthiShohan/keycloak-realm-clone/actions/workflows/ci.yml/badge.svg`), npm version (`https://img.shields.io/npm/v/keycloak-realm-clone`), license MIT shield.
  2. One-paragraph problem statement quoting the exact error: `ERROR: duplicate key value violates unique constraint ... Key (id)=(...) already exists.` and linking [keycloak/keycloak#24770](https://github.com/keycloak/keycloak/issues/24770).
  3. Quick start: `npx keycloak-realm-clone realm-export.json myrealm-dev`.
  4. Options table matching the Task 2 contract exactly.
  5. What gets updated / preserved / requires manual action (adapted from old README, plus identity provider secrets and LDAP bind credentials now handled).
  6. Import walkthrough (Admin Console steps from old README).
  7. "How it works" (UUID map, skip list, masked-secret deletion).
  8. Library usage: `const { cloneRealm } = require("keycloak-realm-clone")` with the exact signature.
  9. Troubleshooting + License sections.

- [ ] **Step 2: Update `AGENTS.md`** — repository layout (bin/src/index/test replace script.js), usage examples (`npx keycloak-realm-clone`), remove the "hardcoded default realm names" and "usage string says keycloak-realm-clone.js" quirks (fixed), note `npm test` as the verification step alongside manual import testing.

- [ ] **Step 3: Create `docs/blog-post.md`** — draft titled "How to clone a Keycloak realm on the same instance (fixing 'duplicate key value violates unique constraint')": the problem, why raw re-import fails, the manual fix outline, then the tool (`npx keycloak-realm-clone`), what it rewrites, after-import checklist, link to repo. ~600-900 words, dev.to-ready front matter (`title`, `tags: keycloak, sso, devops, nodejs`).

- [ ] **Step 4: Verify** — README examples match actual CLI output flags (`node bin/cli.js --help` matches options table).

- [ ] **Step 5: Report back to parent for commit** (subject like `rewrite readme for public release, update agents.md, add blog post draft`)

---

### Task 5: GitHub metadata + handoff (parent session, no subagent)

- [ ] **Step 1:** `gh repo edit VimukthiShohan/keycloak-realm-clone --description "Clone Keycloak realm exports for re-import on the same instance — rewrites UUIDs, renames the realm, clears masked secrets. Fixes 'duplicate key value violates unique constraint'." --add-topic keycloak --add-topic sso --add-topic iam --add-topic oidc --add-topic identity-management --add-topic keycloak-realm --add-topic cli --add-topic nodejs --add-topic devops`
- [ ] **Step 2:** Final full run: `npm test` and `node bin/cli.js --help`.
- [ ] **Step 3:** Hand off to user: push commits, then `npm login && npm publish`, and publish `docs/blog-post.md` on dev.to.
