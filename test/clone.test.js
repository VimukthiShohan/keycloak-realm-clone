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
  const { realm, summary } = cloneRealm(input, { newRealmName: "myrealm-dev" });
  // 10 distinct replaceable UUIDs in the fixture (8888... is a clientId and stays)
  assert.equal(summary.uuidsReplaced, 10);
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
