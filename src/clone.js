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
