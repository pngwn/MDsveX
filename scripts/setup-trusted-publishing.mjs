#!/usr/bin/env node
// Prepares every public workspace package for npm trusted publishing from
// .github/workflows/release.yml:
//
//   1. publishes a 0.0.0 placeholder for any package that doesn't exist on npm
//      yet (trust can only be configured on an existing package)
//   2. adds a GitHub Actions trusted publisher config to each package
//
// Usage (run with node directly, not via `pnpm run`, so 2FA prompts reach the TTY):
//
//   npm login
//   node scripts/setup-trusted-publishing.mjs --dry-run
//   node scripts/setup-trusted-publishing.mjs [@mdsvex/name ...]
//
// Safe to re-run: existing packages are not republished and packages that
// already trust this workflow are skipped. Needs npm >= 11.15.0 for `npm trust`;
// if the local npm is older the script runs npm@11 through npx.
//
// The first 2FA prompt on npmjs.com offers to skip 2FA for 5 minutes; tick it
// or you'll be asked again for every package.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "pngwn/MDsveX";
const WORKFLOW = "release.yml";
const PLACEHOLDER_VERSION = "0.0.0";
const MIN_NPM = [11, 15, 0];

const args = process.argv.slice(2);
const dry_run = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// npm runs from an empty dir so the workspace root package.json and pnpm
// config can't leak into `npm publish` / `npm trust`.
const scratch = mkdtempSync(join(tmpdir(), "mdsvex-trust-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

function run(cmd, cmd_args, { capture = false, cwd = scratch } = {}) {
  const result = spawnSync(cmd, cmd_args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  return result;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function npm_command() {
  const local = run("npm", ["--version"], { capture: true }).stdout.trim();
  const parts = local.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_NPM[i]) break;
    if (parts[i] < MIN_NPM[i]) {
      console.log(`local npm is ${local}, using npm@11 via npx for \`npm trust\``);
      return ["npx", ["--yes", "npm@11"]];
    }
  }
  return ["npm", []];
}

const [npm_bin, npm_prefix] = npm_command();
const npm = (npm_args, opts) => run(npm_bin, [...npm_prefix, ...npm_args], opts);

function workspace_packages() {
  const listed = JSON.parse(
    run("pnpm", ["-r", "ls", "--depth", "-1", "--json"], { capture: true, cwd: root }).stdout,
  );
  return listed
    .filter((p) => p.path !== root && !p.private)
    .filter((p) => only.length === 0 || only.includes(p.name))
    .map((p) => ({ name: p.name, version: p.version, dir: relative(root, p.path) }));
}

async function exists_on_npm(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`registry lookup for ${name} failed: ${res.status}`);
  return true;
}

function publish_placeholder(pkg) {
  const dir = mkdtempSync(join(scratch, "pkg-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: PLACEHOLDER_VERSION,
        description: "Placeholder release so npm trusted publishing can be configured.",
        license: "MIT",
        homepage: "https://mdsvex.pngwn.io",
        repository: {
          type: "git",
          url: `https://github.com/${REPOSITORY}`,
          directory: pkg.dir,
        },
        publishConfig: { access: "public" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "README.md"),
    `# ${pkg.name}\n\nPlaceholder. The first real release is published from CI.\n`,
  );
  return npm(["publish", "--access", "public"], { cwd: dir }).status === 0;
}

// Returns "configured", "none", { mismatch: config } or "unknown". `npm trust
// list` only prompts for 2FA on a TTY, so a captured call that needs it fails
// and we fall back to "unknown" and let the create call prompt instead.
function existing_trust(name) {
  const res = npm(["trust", "list", name, "--json"], { capture: true });
  if (res.status !== 0) return "unknown";
  const out = res.stdout.trim();
  if (!out) return "none";
  let config;
  try {
    config = JSON.parse(out);
  } catch {
    return "unknown";
  }
  if (config.repository === REPOSITORY && config.file === WORKFLOW && !config.environment) {
    return "configured";
  }
  return { mismatch: config };
}

function add_trust(name) {
  return (
    npm([
      "trust",
      "github",
      name,
      "--repository",
      REPOSITORY,
      "--file",
      WORKFLOW,
      "--allow-publish",
      "--yes",
    ]).status === 0
  );
}

const packages = workspace_packages();
if (packages.length === 0) {
  console.error(`no matching public workspace packages for: ${only.join(" ")}`);
  process.exit(1);
}

const whoami = npm(["whoami"], { capture: true });
if (whoami.status !== 0) {
  if (!dry_run) {
    console.error("not logged in to npm; run `npm login` first");
    process.exit(1);
  }
  console.log("not logged in to npm (fine for --dry-run)\n");
} else {
  console.log(`npm user: ${whoami.stdout.trim()}\n`);
}

const missing = [];
for (const pkg of packages) {
  if (!(await exists_on_npm(pkg.name))) missing.push(pkg);
}

console.log(`${packages.length} public packages, ${missing.length} not on npm yet`);
for (const pkg of missing) console.log(`  missing: ${pkg.name}`);
console.log(`trust target: ${REPOSITORY} .github/workflows/${WORKFLOW}\n`);

if (dry_run) {
  for (const pkg of missing) {
    if (pkg.version === PLACEHOLDER_VERSION) {
      console.log(`would skip ${pkg.name}: local version is ${PLACEHOLDER_VERSION}`);
    } else {
      console.log(`would publish ${pkg.name}@${PLACEHOLDER_VERSION}`);
    }
  }
  for (const pkg of packages) console.log(`would add trust for ${pkg.name}`);
  process.exit(0);
}

const failed = [];
const not_published = new Set();

for (const pkg of missing) {
  // A placeholder at the real version would make changesets skip the release.
  if (pkg.version === PLACEHOLDER_VERSION) {
    console.error(`${pkg.name}: local version is ${PLACEHOLDER_VERSION}, bump it first`);
    failed.push(`${pkg.name} (placeholder publish)`);
    not_published.add(pkg.name);
    continue;
  }
  console.log(`\n── publishing placeholder ${pkg.name}@${PLACEHOLDER_VERSION}`);
  if (!publish_placeholder(pkg)) {
    failed.push(`${pkg.name} (placeholder publish)`);
    not_published.add(pkg.name);
  }
}

let first = true;
for (const pkg of packages) {
  if (not_published.has(pkg.name)) continue;

  const state = existing_trust(pkg.name);
  if (state === "configured") {
    console.log(`✓ ${pkg.name} already trusts ${WORKFLOW}`);
    continue;
  }
  if (typeof state === "object") {
    console.error(
      `✗ ${pkg.name} has a different trust config: ${JSON.stringify(state.mismatch)}\n` +
        `  revoke it with: npm trust revoke ${pkg.name} --id ${state.mismatch.id}`,
    );
    failed.push(`${pkg.name} (trust mismatch)`);
    continue;
  }

  // npm recommends spacing out trust calls to stay under the rate limit.
  if (!first) sleep(2000);
  first = false;

  console.log(`\n── adding trust for ${pkg.name}`);
  if (!add_trust(pkg.name)) failed.push(`${pkg.name} (trust)`);
}

if (failed.length > 0) {
  console.error(`\nfailed:\n${failed.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nall packages are set up for trusted publishing; re-run the Release workflow");
