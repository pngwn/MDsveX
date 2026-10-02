import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, 'kit3_app');
const VITE = resolve(APP, 'node_modules/vite/bin/vite.js');
const RENDERED = '<h1>Hello from svx</h1><p>Some <strong>markdown</strong>';
// a #lib template, its heading replacement and its hoisted svelte:head
const TEMPLATED =
	'<article class="post" data-title="Templated"><h1 class="post-heading">Hello from a template</h1></article>';
const TEMPLATED_HEAD = '<title>From the template route</title>';
const STYLED = /<h1 class="(svelte-\w+)">Styled<\/h1>/;

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
			const templated = readFileSync(
				resolve(APP, '.svelte-kit/output/prerendered/pages/templated.html'),
				'utf8'
			);
			expect(templated.replace(/<!--[^]*?-->/g, '')).toContain(TEMPLATED);
			expect(templated).toContain(TEMPLATED_HEAD);
			const styled = readFileSync(
				resolve(APP, '.svelte-kit/output/prerendered/pages/styled.html'),
				'utf8'
			);
			const scope = styled.match(STYLED)?.[1];
			expect(scope, styled).toBeDefined();
			const assets = resolve(
				APP,
				'.svelte-kit/output/client/_app/immutable/assets'
			);
			const css = readdirSync(assets)
				.filter((file) => file.endsWith('.css'))
				.map((file) => readFileSync(resolve(assets, file), 'utf8'))
				.join('\n');
			expect(css).toContain(`h1.${scope}{color:red}`);
		});

		test('serves a +page.svx route in dev', { timeout: 60_000 }, async () => {
			const { status, html } = await dev_page('/doc', env);
			expect(status).toBe(200);
			expect(html).toContain(RENDERED);
		});

		test('serves a #lib template in dev', { timeout: 60_000 }, async () => {
			const { status, html } = await dev_page('/templated', env);
			expect(status).toBe(200);
			expect(html.replace(/<!--[^]*?-->/g, '')).toContain(TEMPLATED);
			expect(html).toContain(TEMPLATED_HEAD);
		});

		test(
			'serves a styled +page.svx route in dev',
			{ timeout: 60_000 },
			async () => {
				const { status, html } = await dev_page('/styled', env);
				expect(status).toBe(200);
				const scope = html.match(STYLED)?.[1];
				expect(scope, html).toBeDefined();
				expect(html).toMatch(
					new RegExp(`h1\\.${scope}\\s*\\{\\s*color:\\s*red`)
				);
			}
		);
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
