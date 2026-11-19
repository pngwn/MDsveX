// a sveltekit app with @sveltejs/enhanced-img, kit3_app is the same without it
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, 'enhanced_app');
const VITE = resolve(APP, 'node_modules/vite/bin/vite.js');
const PAGE = resolve(APP, '.svelte-kit/output/prerendered/pages/pictured.html');
const ASSETS = resolve(APP, '.svelte-kit/output/client/_app/immutable/assets');

const [major, minor] = process.versions.node.split('.').map(Number);
const kit_supported = major > 22 || (major === 22 && minor >= 17);

/** the picture enhanced-img gives a file of these formats and size, in a build */
function built_picture(
	name: string,
	formats: [string, string, string],
	size: string,
	attrs: string
): RegExp {
	const asset = (ext: string) =>
		`/_app/immutable/assets/${name}\\.[\\w-]+\\.${ext}`;
	const sources = formats
		.map(
			([ext, type]) =>
				`<source srcset="${asset(ext)} 1x, ${asset(ext)} 2x" type="image/${type}"/>`
		)
		.join('');
	return new RegExp(
		`<picture><!--\\[-->${sources}<!--\\]--><img src="${asset(formats[2][0])}" ${size} ${attrs}/></picture>`
	);
}

const RED = built_picture(
	'red',
	['avif', 'webp', 'png'].map((f) => [f, f]) as any,
	'width="40" height="30"',
	'alt="a red box" title="Red"'
);
const BLUE = built_picture(
	'blue',
	[
		['avif', 'avif'],
		['webp', 'webp'],
		['jpg', 'jpeg'],
	] as any,
	'width="20" height="10"',
	'alt="a blue box"'
);
const LEFT =
	/<p><img src="data:image\/svg\+xml,[^"]+" alt="a mark"\/> and <img src="\/_app\/immutable\/assets\/red\.[\w-]+\.png" alt="the red url"\/><\/p>/;

function run(env: Record<string, string> = {}) {
	return new Promise<{ code: number | null; output: string }>((done, fail) => {
		const child = spawn(process.execPath, [VITE, 'build'], {
			cwd: APP,
			env: { ...process.env, ...env, NO_COLOR: '1' },
		});
		let output = '';
		child.stdout.on('data', (d) => (output += d));
		child.stderr.on('data', (d) => (output += d));
		child.on('error', fail);
		child.on('close', (code) => done({ code, output }));
	});
}

async function build(env?: Record<string, string>): Promise<string> {
	rmSync(resolve(APP, '.svelte-kit/output'), { recursive: true, force: true });
	const { code, output } = await run(env);
	expect(code, output).toBe(0);
	return readFileSync(PAGE, 'utf8');
}

async function dev_page(path: string): Promise<string> {
	const child = spawn(process.execPath, [VITE, 'dev', '--port', '0'], {
		cwd: APP,
		env: { ...process.env, NO_COLOR: '1' },
	});
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
		expect(res.status).toBe(200);
		return res.text();
	} finally {
		child.kill();
	}
}

describe.skipIf(!kit_supported)('sveltekit with enhanced-img', () => {
	test.each([
		{ name: 'mdsvex before enhancedImages()', env: {} },
		{ name: 'mdsvex after enhancedImages()', env: { MDSVEX_LAST: '1' } },
	])(
		'$name, a markdown image builds to the picture enhanced-img gives',
		{ timeout: 120_000 },
		async ({ env }) => {
			const page = await build(env);
			expect(page).toMatch(RED);
			expect(page).toMatch(BLUE);
			expect(page).toMatch(LEFT);
			const assets = readdirSync(ASSETS);
			for (const ext of ['avif', 'webp', 'png'])
				expect(
					assets.some((f) => f.startsWith('red.') && f.endsWith(ext))
				).toBe(true);
		}
	);

	test(
		'{ enhanced: false } builds the plain imports',
		{ timeout: 120_000 },
		async () => {
			const page = await build({ MDSVEX_PLAIN: '1' });
			expect(page).not.toContain('<picture>');
			// vite inlines files this small
			expect(page).toMatch(
				/<img src="data:image\/png;base64,[^"]+" alt="a red box" title="Red"\/> and <img src="data:image\/jpeg;base64,[^"]+" alt="a blue box"\/>/
			);
		}
	);

	test('serves the picture in dev', { timeout: 60_000 }, async () => {
		const html = await dev_page('/pictured');
		expect(html).toMatch(
			/<picture><!--\[--><source srcset="\/@imagetools\/\w+ 1x, \/@imagetools\/\w+ 2x" type="image\/avif"\/>/
		);
		expect(html).toMatch(
			/<img src="\/@imagetools\/\w+" width="40" height="30" alt="a red box" title="Red"\/><\/picture>/
		);
	});
});
