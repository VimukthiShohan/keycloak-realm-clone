const fs = require("fs");
const crypto = require("crypto");

// Map to store UUID replacements
const uuidMap = new Map();

// Function to generate a new UUID
const generateUUID = () => {
  return crypto.randomUUID();
};

const isUUIDValue = (str) => {
  if (typeof str !== "string") return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    str
  );
};

const replaceValue = (key, obj, oldRealmId, newRealmId) => {
  const uuid = obj[key];

  // Special handling for containerId which might reference the realm
  if (key === "containerId" && uuid === oldRealmId) {
    obj[key] = newRealmId;
    return;
  }

  if (!uuidMap.has(uuid)) {
    uuidMap.set(uuid, generateUUID());
  }
  obj[key] = uuidMap.get(uuid);
};

const replaceUUIDs = (obj, oldRealmId, newRealmId) => {
  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      obj.forEach((item) => replaceUUIDs(item, oldRealmId, newRealmId));
    } else {
      for (const key in obj) {
        // Always recurse into nested objects first
        if (typeof obj[key] === "object") {
          replaceUUIDs(obj[key], oldRealmId, newRealmId);
        }

        // Replace UUIDs but skip certain configuration keys that should never be UUIDs
        const configKeys = [
          "user.attribute",
          "claim.name",
          "user.session.note",
          "clientId",
          "serviceAccountClientId",
          "authenticator",
          "protocolMapper",
          "providerId",
          "alias",
        ];
        if (
          !configKeys.includes(key) &&
          typeof obj[key] === "string" &&
          isUUIDValue(obj[key])
        ) {
          replaceValue(key, obj, oldRealmId, newRealmId);
        }
      }
    }
  }
};

const updateRealmSpecificFields = (jsonData, oldRealmName, newRealmName) => {
  // Update main realm name
  jsonData.realm = newRealmName;

  // Update display names
  if (jsonData.displayName && jsonData.displayName.includes(oldRealmName)) {
    jsonData.displayName = jsonData.displayName.replace(
      new RegExp(oldRealmName, "gi"),
      newRealmName
    );
  }

  if (
    jsonData.displayNameHtml &&
    jsonData.displayNameHtml.includes(oldRealmName)
  ) {
    jsonData.displayNameHtml = jsonData.displayNameHtml.replace(
      new RegExp(oldRealmName, "gi"),
      newRealmName
    );
  }

  // Update default role name
  if (jsonData.defaultRole && jsonData.defaultRole.name) {
    jsonData.defaultRole.name = jsonData.defaultRole.name.replace(
      `default-roles-${oldRealmName}`,
      `default-roles-${newRealmName}`
    );
  }

  // Update role names that reference the realm
  if (jsonData.roles && jsonData.roles.realm) {
    jsonData.roles.realm.forEach((role) => {
      if (role.name && role.name.includes(`default-roles-${oldRealmName}`)) {
        role.name = role.name.replace(
          `default-roles-${oldRealmName}`,
          `default-roles-${newRealmName}`
        );
      }
    });
  }

  // Update client redirects URIs and base URLs that reference the realm
  if (jsonData.clients) {
    jsonData.clients.forEach((client) => {
      // Update redirect URIs
      if (client.redirectUris) {
        client.redirectUris = client.redirectUris.map((uri) =>
          uri.replace(`/realms/${oldRealmName}/`, `/realms/${newRealmName}/`)
        );
      }

      // Update base URL
      if (client.baseUrl) {
        client.baseUrl = client.baseUrl.replace(
          `/realms/${oldRealmName}/`,
          `/realms/${newRealmName}/`
        );
      }

      // Update admin URL
      if (client.adminUrl) {
        client.adminUrl = client.adminUrl.replace(
          `/realms/${oldRealmName}/`,
          `/realms/${newRealmName}/`
        );
      }

      // Reset client secrets (they're masked in export)
      if (client.secret === "**********") {
        delete client.secret; // Remove masked secret so Keycloak generates a new one
      }
    });
  }

  // Update any URLs in SMTP configuration
  if (jsonData.smtpServer && jsonData.smtpServer.replyTo) {
    // Keep SMTP settings as-is, but you might want to update them manually
  }
};

const fixContainerIds = (obj, oldRealmId, newRealmId) => {
  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      obj.forEach((item) => fixContainerIds(item, oldRealmId, newRealmId));
    } else {
      for (const key in obj) {
        if (key === "containerId" && obj[key] === oldRealmId) {
          obj[key] = newRealmId;
        } else if (typeof obj[key] === "object") {
          fixContainerIds(obj[key], oldRealmId, newRealmId);
        }
      }
    }
  }
};

// Main function to process the JSON file
const processKeycloakJSON = (inputFile, oldRealmName, newRealmName) => {
  try {
    console.log(`Processing ${inputFile}...`);
    console.log(`Converting realm from "${oldRealmName}" to "${newRealmName}"`);

    // Clear the UUID map to start fresh
    uuidMap.clear();

    const rawData = fs.readFileSync(inputFile, "utf8");
    const jsonData = JSON.parse(rawData);

    // Store the old realm ID before replacement
    const oldRealmId = jsonData.id;

    // Generate a new realm ID and map it
    const newRealmId = generateUUID();
    uuidMap.set(oldRealmId, newRealmId);

    // Update realm-specific fields first
    updateRealmSpecificFields(jsonData, oldRealmName, newRealmName);

    // Replace all UUIDs
    replaceUUIDs(jsonData, oldRealmId, newRealmId);

    // Set the new realm ID
    jsonData.id = newRealmId;

    // Fix any remaining containerId references to the old realm ID
    fixContainerIds(jsonData, oldRealmId, newRealmId);

    const outputFile = `${newRealmName}-realm-export.json`;
    fs.writeFileSync(outputFile, JSON.stringify(jsonData, null, 2), "utf8");

    console.log(`✅ Successfully created ${outputFile}`);
    console.log(`📝 ${uuidMap.size} UUIDs were replaced`);
    console.log("\n📋 Next steps:");
    console.log("1. Import the new realm JSON file into Keycloak");
    console.log("2. Update client secrets for any confidential clients");
    console.log("3. Review and update SMTP settings if needed");
    console.log("4. Test the new realm functionality");
  } catch (error) {
    console.error("❌ Error processing JSON:", error.message);
    process.exit(1);
  }
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 3) {
    console.error(
      "Usage: node keycloak-realm-clone.js <input_file> [old_realm_name] [new_realm_name]"
    );
    console.error("\nExamples:");
    console.error("  node keycloak-realm-clone.js realm-export.json");
    console.error(
      "  node keycloak-realm-clone.js realm-export.json ajax ajax-dev"
    );
    process.exit(1);
  }

  const inputFile = args[0];

  // Check if a file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File ${inputFile} not found`);
    process.exit(1);
  }

  let oldRealmName = "ajax-dev";
  let newRealmName = "ajax-demo";

  if (args.length >= 2) {
    oldRealmName = args[1];
  }

  if (args.length >= 3) {
    newRealmName = args[2];
  }

  // Try to auto-detect realm name from the file if not provided
  if (args.length === 1) {
    try {
      const rawData = fs.readFileSync(inputFile, "utf8");
      const jsonData = JSON.parse(rawData);
      if (jsonData.realm) {
        oldRealmName = jsonData.realm;
        console.log(`📍 Auto-detected realm name: "${oldRealmName}"`);
        console.log(`🎯 Target realm name: "${newRealmName}"`);
      }
    } catch (error) {
      console.log("⚠️  Could not auto-detect realm name, using defaults");
    }
  }

  processKeycloakJSON(inputFile, oldRealmName, newRealmName);
};

main();
