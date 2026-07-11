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
      if (!opts.output || opts.output.startsWith("-")) fail(1, `${arg} requires a value`);
    } else if (arg === "--old-name") {
      opts.oldName = argv[++i];
      if (!opts.oldName || opts.oldName.startsWith("-")) fail(1, "--old-name requires a value");
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
