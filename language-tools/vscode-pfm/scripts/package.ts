/**
 * packs the built extension into a .vsix from a staging folder
 *
 * vsce packs node_modules only through npm, which cannot read this pnpm workspace,
 * so the staging folder holds a plain manifest and real copies of the typescript
 * plugin tsserver loads from the extension, and of typescript, which svelte2tsx
 * requires when the server or the plugin loads
 *
 * writes version, pre_release and vsix to GITHUB_OUTPUT when it is set
 */

import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHIPPED = [
	"README.md",
	"CHANGELOG.md",
	"LICENSE",
	"language-configuration.json",
	"images/icon.png",
	"syntaxes/pfm.tmLanguage.json",
	"dist/extension.cjs",
	"server/server.cjs",
];

const TYPESCRIPT = ["LICENSE.txt", "ThirdPartyNoticeText.txt", "lib/typescript.js"];

// workspace fields such as dependencies break the npm listing vsce runs
const MANIFEST = [
	"name",
	"displayName",
	"description",
	"version",
	"publisher",
	"license",
	"icon",
	"homepage",
	"repository",
	"bugs",
	"engines",
	"categories",
	"keywords",
	"activationEvents",
	"main",
	"contributes",
];

/**
 * the marketplace takes only major minor patch and shares it with prereleases,
 * so prereleases go on odd minors
 * @example
 * marketplace_version("1.1.0"); // { version: "1.2.0", pre_release: false }
 * marketplace_version("0.1.0-next.4"); // { version: "0.3.4", pre_release: true }
 */
function marketplace_version(version: string): {
	version: string;
	pre_release: boolean;
} {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+\.(\d+))?$/.exec(
		version,
	);
	if (!match) {
		throw new Error(
			`cannot map ${version} to a Marketplace version, expected X.Y.Z or X.Y.Z-tag.N`,
		);
	}
	const [, major, minor, patch, pre] = match;
	if (pre === undefined) {
		return {
			version: `${major}.${Number(minor) * 2}.${patch}`,
			pre_release: false,
		};
	}
	return {
		version: `${major}.${Number(minor) * 2 + 1}.${Number(patch) * 1000 + Number(pre)}`,
		pre_release: true,
	};
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin_root = resolve(root, "../typescript-plugin");

const read_json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
// the typescript the language server is built and tested against
const ts_root = dirname(
	createRequire(resolve(root, "../language-server/package.json")).resolve(
		"typescript/package.json",
	),
);

const pkg = read_json(join(root, "package.json"));
const plugin_pkg = read_json(join(plugin_root, "package.json"));
const ts_pkg = read_json(join(ts_root, "package.json"));
const { version, pre_release } = marketplace_version(pkg.version);

for (const file of [
	...SHIPPED.map((f) => join(root, f)),
	join(plugin_root, "lib/index.cjs"),
]) {
	if (!existsSync(file)) {
		throw new Error(`${file} is missing, run \`pnpm build\` first`);
	}
}

const stage = mkdtempSync(join(tmpdir(), "vscode-pfm-"));
const vsix = join(root, `vscode-pfm-${version}.vsix`);

try {
	for (const file of SHIPPED) {
		mkdirSync(dirname(join(stage, file)), { recursive: true });
		cpSync(join(root, file), join(stage, file));
	}

	const manifest: Record<string, unknown> = {};
	for (const key of MANIFEST) {
		if (pkg[key] !== undefined) manifest[key] = pkg[key];
	}
	manifest.version = version;
	manifest.dependencies = {
		[plugin_pkg.name]: plugin_pkg.version,
		typescript: ts_pkg.version,
	};
	writeFileSync(
		join(stage, "package.json"),
		JSON.stringify(manifest, null, "\t"),
	);
	// the file only stops a vsce warning
	writeFileSync(join(stage, ".vscodeignore"), "# everything here ships\n");

	// lib/index.cjs bundles its dependencies except typescript
	const plugin_stage = join(stage, "node_modules", plugin_pkg.name);
	mkdirSync(join(plugin_stage, "lib"), { recursive: true });
	cpSync(join(plugin_root, "lib/index.cjs"), join(plugin_stage, "lib/index.cjs"));
	writeFileSync(
		join(plugin_stage, "package.json"),
		JSON.stringify(
			{
				name: plugin_pkg.name,
				version: plugin_pkg.version,
				license: plugin_pkg.license,
				main: "./lib/index.cjs",
			},
			null,
			"\t",
		),
	);

	const ts_stage = join(stage, "node_modules/typescript");
	for (const file of TYPESCRIPT) {
		mkdirSync(dirname(join(ts_stage, file)), { recursive: true });
		cpSync(join(ts_root, file), join(ts_stage, file));
	}
	writeFileSync(
		join(ts_stage, "package.json"),
		JSON.stringify(
			{
				name: "typescript",
				version: ts_pkg.version,
				license: ts_pkg.license,
				main: ts_pkg.main,
			},
			null,
			"\t",
		),
	);

	const args = ["package", "--out", vsix];
	if (pre_release) args.push("--pre-release");
	execFileSync(join(root, "node_modules/.bin/vsce"), args, {
		cwd: stage,
		stdio: "inherit",
	});
} finally {
	rmSync(stage, { recursive: true, force: true });
}

console.log(
	`\n${pkg.version} -> ${version}${pre_release ? " (pre-release)" : ""}`,
);
console.log(vsix);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		`version=${version}\npre_release=${pre_release}\nvsix=${vsix}\n`,
	);
}
