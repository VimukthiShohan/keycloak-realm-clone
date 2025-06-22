# Keycloak Realm Cloning

This repository contains a script to clone Keycloak realm exports, solving the UUID collision issue when importing to the same Keycloak instance.

## Problem

When exporting a Keycloak realm and trying to import it as a new realm on the same instance, you encounter UUID collision errors because all the internal IDs already exist.

## Solution

The `script.js` script processes your realm export and:

1. **Replaces all UUIDs** with new ones while maintaining relationships
2. **Updates realm name** and related references
3. **Fixes redirect URIs** and base URLs
4. **Handles client secrets** (removes masked secrets so Keycloak generates new ones)
5. **Updates role names** that reference the realm

## Usage

```bash
# Basic usage (auto-detects realm name)
node script.js "your-realm-export.json"

# Specify old and new realm names
node script.js "your-realm-export.json" "old-realm" "new-realm"
```

## Example

```bash
node script.js "Realm Export from Keycloak.json"
```

This will:

- Auto-detect the realm name "ajax"
- Create a new file `ajax-dev-realm-export.json`
- Replace 133+ UUIDs
- Update all realm references

## What Gets Updated

### ✅ Automatically Fixed

- Realm ID and name
- All role IDs and container references
- Client IDs (internal UUIDs)
- User IDs and service account references
- Protocol mapper IDs
- Component IDs
- Authentication flow IDs
- Redirect URIs and base URLs
- Default role names

### ⚠️ Preserved (Important!)

- Client identifiers (like "account", "admin-cli", "maji-core")
- Configuration values
- Descriptions and display names (except realm-specific ones)
- User attributes and claims

### 🔒 Requires Manual Action

- **Client secrets**: Regenerated automatically by Keycloak on import
- **SMTP settings**: Review and update if needed
- **Theme settings**: May need realm-specific adjustments

## Import Process

1. **Import the realm**:

   - Go to Keycloak Admin Console
   - Select "Add Realm"
   - Choose "Select file" and upload `ajax-dev-realm-export.json`
   - Click "Create"

2. **Update client secrets**:

   - Navigate to each confidential client
   - Go to the "Credentials" tab
   - Note/copy the new generated secret
   - Update your applications with the new secrets

3. **Verify settings**:
   - Check redirect URIs are correct
   - Test authentication flows
   - Verify SMTP configuration if email is used

## Files Created

- **Input**: `Realm Export from Keycloak.json` (your original export)
- **Output**: `ajax-dev-realm-export.json` (ready to import)
- **Script**: `script.js` (the processing script)

## References

- [GitHub Issue #24770](https://github.com/keycloak/keycloak/issues/24770) - Original problem discussion
- [UUID Replacement Script](https://gist.github.com/sonisourabh/6216610c4e59bf05b88a132b6a596d41) - Inspiration for the solution

## Troubleshooting

### UUID Collision Error

If you encounter an error like:

```
ERROR: duplicate key value violates unique constraint "constraint_a"
Detail: Key (id)=(51e1a26d-c24f-4454-9a34-708f1fc14917) already exists.
```

This means some UUIDs weren't properly replaced. The script has been updated to:

- Replace ALL UUIDs comprehensively
- Clear the UUID map between runs
- Process nested objects more thoroughly

**Solution**: Re-run the script with the updated version.

## Status

✅ **Successfully processed**: ajax → ajax-dev

- **137 UUIDs replaced** (fixed collision issues)
- All realm references updated
- All role IDs are properly replaced (including uma_authorization)
- Ready for import

**Next step**: Import `ajax-dev-realm-export.json` into your Keycloak instance!
