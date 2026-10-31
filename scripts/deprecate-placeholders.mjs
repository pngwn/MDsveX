#!/usr/bin/env node
// Deprecates the 0.0.0 placeholders that setup-trusted-publishing.mjs
// publishes so trust can be configured on a new package. npm points `latest`
// at the first version it sees, and prereleases go out under `next`, so until
// a stable release a bare `npm i <name>` installs the empty placeholder.
// Deprecating it makes that install warn and say to use `<name>@next`.
//
// Usage (run with node directly, not via `pnpm run`, so 2FA prompts reach the TTY):
//
//   npm login
//   node scripts/deprecate-placeholders.mjs --dry-run
//   node scripts/deprecate-placeholders.mjs [@mdsvex/name ...]
//
// --latest also moves the `latest` tag to the package's current `next`
// version, so a bare install gets the prerelease. Changesets keeps
// publishing under `next` in pre mode and never moves `latest`, so the tag
// then stays on that version until a stable release; re-run with --latest
// after a release to move it again.
//
// Only a 0.0.0 whose description is the placeholder's is touched, so a real
// 0.0.0 release is never deprecated. Safe to re-run: placeholders that are
// already deprecated are skipped.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER_VERSION = "0.0.0";
const PLACEHOLDER_DESCRIPTION = "Placeholder release so npm trusted publishing can be configured.";

const args = process.argv.slice(2);
const dry_run = args.includes("--dry-run");
const move_latest = args.includes("--latest");
const only = args.filter((a) => !a.startsWith("--"));

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// npm runs from an empty dir so the workspace root package.json and pnpm
// config can't leak into `npm deprecate` / `npm dist-tag`.
const scratch = mkdtempSync(join(tmpdir(), "mdsvex-deprecate-"));
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

function workspace_packages() {
  const listed = JSON.parse(
    run("pnpm", ["-r", "ls", "--depth", "-1", "--json"], { capture: true, cwd: root }).stdout,
  );
  return listed
    .filter((p) => p.path !== root && !p.private)
    .filter((p) => only.length === 0 || only.includes(p.name))
    .map((p) => p.name);
}

// The full packument, which has each version's description and deprecation;
// the abbreviated install document has neither.
async function packument(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`registry lookup for ${name} failed: ${res.status}`);
  return res.json();
}

const names = workspace_packages();
if (names.length === 0) {
  console.error(`no matching public workspace packages for: ${only.join(" ")}`);
  process.exit(1);
}

const whoami = run("npm", ["whoami"], { capture: true });
if (whoami.status !== 0) {
  if (!dry_run) {
    console.error("not logged in to npm; run `npm login` first");
    process.exit(1);
  }
  console.log("not logged in to npm (fine for --dry-run)\n");
} else {
  console.log(`npm user: ${whoami.stdout.trim()}\n`);
}

const work = [];
for (const name of names) {
  const doc = await packument(name);
  if (!doc) {
    console.log(`- ${name}: not on npm`);
    continue;
  }
  const placeholder = doc.versions?.[PLACEHOLDER_VERSION];
  if (!placeholder || placeholder.description !== PLACEHOLDER_DESCRIPTION) {
    console.log(`- ${name}: no placeholder`);
    continue;
  }
  const tags = doc["dist-tags"] ?? {};
  const next = tags.next;
  const deprecate = !placeholder.deprecated;
  const retag = move_latest && next && tags.latest !== next;
  if (!deprecate && !retag) {
    console.log(`✓ ${name}: placeholder already deprecated${move_latest ? `, latest is ${tags.latest}` : ""}`);
    continue;
  }
  if (move_latest && !next) console.log(`! ${name}: no next tag, latest stays on ${tags.latest}`);
  work.push({ name, next, deprecate, retag });
}

console.log(`\n${work.length} to change`);
if (dry_run) {
  for (const { name, next, deprecate, retag } of work) {
    if (deprecate) console.log(`would deprecate ${name}@${PLACEHOLDER_VERSION}`);
    if (retag) console.log(`would move ${name} latest to ${next}`);
  }
  process.exit(0);
}

const failed = [];
let first = true;
for (const { name, next, deprecate, retag } of work) {
  if (!first) sleep(1000);
  first = false;
  console.log(`\n── ${name}`);
  if (deprecate) {
    const message = `Placeholder for trusted publishing, not a release. Install ${name}@next.`;
    if (run("npm", ["deprecate", `${name}@${PLACEHOLDER_VERSION}`, message]).status !== 0) {
      failed.push(`${name} (deprecate)`);
    }
  }
  if (retag && run("npm", ["dist-tag", "add", `${name}@${next}`, "latest"]).status !== 0) {
    failed.push(`${name} (latest)`);
  }
}

if (failed.length > 0) {
  console.error(`\nfailed:\n${failed.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\ndone");
