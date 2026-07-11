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
  // a flag must not be consumed as another flag's value
  assert.equal(run([fixture, "new", "--old-name", "--dry-run"]).code, 1);
  assert.equal(run([fixture, "new", "-o", "--dry-run"]).code, 1);
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
