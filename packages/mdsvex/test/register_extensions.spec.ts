import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, 'kit3_app');
const VITE = resolve(APP, 'node_modules/vite/bin/vite.js');
const RENDERED = '<h1>Hello from svx</h1><p>Some <strong>markdown</strong>';

const [major, minor] = process.versions.node.split('.').map(Number);
const kit_supported = major > 22 || (major === 22 && minor >= 17);

function vite(args: string[], env: Record<string, string> = {}) {
	return spawn(process.execPath, [VITE, ...args], {
		cwd: APP,
		env: { ...process.env, ...env, NO_COLOR: '1' },
	});
}

function run(
	args: string[],
	env?: Record<string, string>
): Promise<{ code: number | null; output: string }> {
	return new Promise((done, fail) => {
		const child = vite(args, env);
		let output = '';
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		child.on('error', fail);
		child.on('close', (code) => done({ code, output }));
	});
}

async function dev_page(path: string, env?: Record<string, string>) {
	const child = vite(['dev', '--port', '0'], env);
	try {
		const url = await new Promise<string>((done, fail) => {
			let output = '';
			const read = (d: Buffer) => {
				output += d;
				const match = output.match(/http:\/\/localhost:\d+\//);
				if (match) done(match[0]);
			};
			child.stdout.on('data', read);
			child.stderr.on('data', read);
			child.on('close', () => fail(new Error(output)));
		});
		const res = await fetch(new URL(path, url));
		return { status: res.status, html: await res.text() };
	} finally {
		child.kill();
	}
}

const orders = [
	{ name: 'mdsvex before sveltekit', env: {} },
	{ name: 'mdsvex after sveltekit', env: { MDSVEX_LAST: '1' } },
];

describe.skipIf(!kit_supported)('sveltekit 3', () => {
	describe.each(orders)('$name', ({ env }) => {
		test('builds a +page.svx route', { timeout: 60_000 }, async () => {
			rmSync(resolve(APP, '.svelte-kit/output'), {
				recursive: true,
				force: true,
			});
			const { code, output } = await run(['build'], env);
			expect(code, output).toBe(0);
			const page = readFileSync(
				resolve(APP, '.svelte-kit/output/prerendered/pages/doc.html'),
				'utf8'
			);
			expect(page).toContain(RENDERED);
		});

		test('serves a +page.svx route in dev', { timeout: 60_000 }, async () => {
			const { status, html } = await dev_page('/doc', env);
			expect(status).toBe(200);
			expect(html).toContain(RENDERED);
		});
	});
});

test(
	'plain vite-plugin-svelte without the extension fails to start',
	{ timeout: 60_000 },
	async () => {
		const { code, output } = await run([
			'build',
			'--config',
			'vite.svelte.config.js',
		]);
		expect(code).not.toBe(0);
		expect(output).toContain(
			"vite-plugin-svelte does not handle .svx files. Add them to the extensions option of sveltekit() or svelte(): extensions: ['.svelte', '.svx']"
		);
	}
);
