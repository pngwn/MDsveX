// the plugin finds these by name and edits or reads their extensions, neither
// is a public contract of sveltekit or vite-plugin-svelte
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_APP = resolve(HERE, 'kit3_app');
const PACKAGE = resolve(HERE, '..');

const SETUP = 'vite-plugin-sveltekit-setup';
const CONFIG = 'vite-plugin-svelte:config';

const [major, minor] = process.versions.node.split('.').map(Number);
const kit_supported = major > 22 || (major === 22 && minor >= 17);

interface Probe {
	versions: Record<string, string>;
	names: string[];
	/** what mdsvex reads from the kit setup plugin before config resolves */
	setup: unknown;
	/** what vite-plugin-svelte holds after an extension was pushed into setup */
	config_after_push: unknown;
	/** what a svelte() call with extensions holds after config resolves */
	config: unknown;
}

// runs where the packages are installed, so it loads the versions a user gets
const PROBE = `
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
const kit = process.argv[1] === 'kit';
const extensions = (p) => p?.api?.options?.extensions ?? null;
const flat = async (ps, out = []) => {
	for (const p of ps) {
		const r = await p;
		if (Array.isArray(r)) await flat(r, out);
		else if (r) out.push(r);
	}
	return out;
};
const resolved = (plugins) =>
	resolveConfig({ configFile: false, root: process.cwd(), logLevel: 'silent', plugins }, 'build');
const version = (name) => {
	for (let dir = process.cwd(); ; dir = dirname(dir)) {
		try {
			return JSON.parse(readFileSync(dir + '/node_modules/' + name + '/package.json', 'utf8')).version;
		} catch {}
		if (dirname(dir) === dir) return null;
	}
};
const out = { versions: { vite: version('vite'), '@sveltejs/vite-plugin-svelte': version('@sveltejs/vite-plugin-svelte') } };
if (kit) {
	const { sveltekit } = await import('@sveltejs/kit/vite');
	out.versions['@sveltejs/kit'] = version('@sveltejs/kit');
	const plugins = await flat([sveltekit()]);
	out.names = plugins.map((p) => p.name);
	const setup = extensions(plugins.find((p) => p.name === '${SETUP}'));
	out.setup = setup === null ? null : [...setup];
	if (Array.isArray(setup)) setup.push('.probe');
	const config = await resolved(plugins);
	out.config_after_push = extensions(config.plugins.find((p) => p.name === '${CONFIG}'));
}
const config = await resolved([svelte({ extensions: ['.svelte', '.probe'] })]);
out.names ??= config.plugins.map((p) => p.name);
out.config = extensions(config.plugins.find((p) => p.name === '${CONFIG}'));
console.log(JSON.stringify(out));
`;

function probe(cwd: string, mode: 'kit' | 'svelte'): Promise<Probe> {
	return new Promise((done, fail) => {
		execFile(
			process.execPath,
			['--input-type=module', '-e', PROBE, mode],
			{ cwd },
			(error, stdout, stderr) => {
				if (error) fail(new Error(stderr || error.message));
				else done(JSON.parse(stdout));
			}
		);
	});
}

function found(result: Probe, name: string) {
	return {
		versions: result.versions,
		has: result.names.includes(name),
	};
}

describe.skipIf(!kit_supported)('the sveltekit installed for kit3_app', () => {
	test('names its setup plugin and holds extensions vite-plugin-svelte reads later', async () => {
		const result = await probe(KIT_APP, 'kit');
		expect(found(result, SETUP), `no plugin named ${SETUP}`).toEqual({
			versions: result.versions,
			has: true,
		});
		expect(result.setup, `${SETUP} api.options.extensions`).toEqual([
			'.svelte',
		]);
		expect(
			result.config_after_push,
			`${CONFIG} api.options.extensions after a push into ${SETUP}`
		).toEqual(['.svelte', '.probe']);
		expect(result.config, `${CONFIG} api.options.extensions`).toEqual([
			'.svelte',
			'.probe',
		]);
	}, 30_000);
});

test('the vite-plugin-svelte mdsvex is developed against exposes its extensions', async () => {
	const result = await probe(PACKAGE, 'svelte');
	expect(found(result, CONFIG), `no plugin named ${CONFIG}`).toEqual({
		versions: result.versions,
		has: true,
	});
	expect(result.config, `${CONFIG} api.options.extensions`).toEqual([
		'.svelte',
		'.probe',
	]);
}, 30_000);
