import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createLogger, createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { PATHS } from '../../parse/test/plugin_harness';
import {
	check_plugins,
	compile,
	compile_async,
	CompilerSession,
	FenceOwnerError,
	mdsvex,
} from '../src/main';
import type {
	Bundle,
	CodeInfo,
	CompileWarning,
	ComponentSource,
	HighlightOption,
} from '../src/main';
import { FenceClaims } from '../src/fence_claims';
import { create_highlight, load_default_languages } from '../src/highlight';
import type { HighlightConfig } from '../src/highlight_run';
import { plugin_registry } from '../src/plugin_registry';

const HERE = dirname(fileURLToPath(import.meta.url));

const highlight = create_highlight({
	languages: await load_default_languages(),
});

/** a plugin that renders chart fences, it claims them and does nothing else */
const charts = (name = 'charts'): Bundle => ({ name, fences: ['chart'] });

/** a plugin that wraps each chart fence, as diagram does with mermaid */
const wrapping: Bundle = {
	name: 'wrapping',
	fences: ['chart'],
	parse: {
		code_fence: {
			parse(node) {
				if (node.info.split(' ')[0] !== 'chart') return;
				node.wrap_from('directive_container', { name: 'chart' }).close();
			},
		},
	},
};

const CHART = '```chart title="Sales"\nbar a 1\n```\n';
const DOC = 'Before\n\n' + CHART + '\n```nope\nx\n```\n';
const PLAIN_CHART = '<pre><code class="language-chart">bar a 1</code></pre>';

function codes(warnings: CompileWarning[] | undefined) {
	return (warnings ?? []).map((w) => [w.code, w.start.line]);
}

describe('a claimed fence', () => {
	test('is not highlighted and gives no warning, an unclaimed one still warns', () => {
		const out = compile(DOC, { plugins: [charts()], highlight });
		expect(out.code).toContain(PLAIN_CHART);
		expect(out.code).toContain('<pre class="twinkleplop language-nope"');
		expect(codes(out.warnings)).toEqual([['unknown_language', 7]]);
		expect(codes(compile(DOC, { highlight }).warnings)).toEqual([
			['unknown_language', 3],
			['unknown_language', 7],
		]);
	});

	test('renders as it does with highlight false', () => {
		expect(compile(CHART, { plugins: [charts()], highlight }).code).toBe(
			compile(CHART, { highlight: false }).code
		);
	});

	test('never reaches a highlighter function, a code span with its hint does', () => {
		const seen: [string, boolean][] = [];
		const custom = (_code: string, { lang, inline }: CodeInfo) => {
			seen.push([lang, inline]);
			return null;
		};
		compile(DOC + '\n`#!chart bar` and `#!nope x`\n', {
			plugins: [charts()],
			highlight: custom,
		});
		expect(seen).toEqual([
			['nope', false],
			['chart', true],
			['nope', true],
		]);
	});

	test('a code span is never claimed', () => {
		const out = compile('`#!chart bar`\n', { plugins: [charts()], highlight });
		expect(codes(out.warnings)).toEqual([['unknown_language', 1]]);
	});

	test('matches the language as written', () => {
		const out = compile('```Chart\nx\n```\n', {
			plugins: [charts()],
			highlight,
		});
		expect(codes(out.warnings)).toEqual([['unknown_language', 1]]);
	});

	test('with highlight false the claim changes nothing', () => {
		for (const option of [false, undefined] as HighlightOption[])
			expect(compile(DOC, { plugins: [charts()], highlight: option })).toEqual(
				compile(DOC, { highlight: option })
			);
	});

	test('still goes to a replaced pre', () => {
		const PRE: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['pre'] },
		];
		const { code } = compile(CHART, {
			plugins: [charts()],
			components: PRE,
			highlight,
		});
		expect(code).toContain('lang={"chart"}');
		expect(code).toContain('title={"Sales"}');
		expect(code).toContain('<code class="language-chart">bar a 1</code>');
		expect(code).not.toContain('twinkleplop');
	});

	test('the math option still renders a math fence a plugin claims', () => {
		const { code } = compile('```math\nx\n```\n', {
			plugins: [{ name: 'maths', fences: ['math'] }],
			highlight,
			math: (latex) => `<math>${latex}</math>`,
		});
		expect(code).toContain('<math>x</math>');
	});

	test('in a session, from compile_async and in a wrapping directive', async () => {
		const session = new CompilerSession();
		const plugins = [wrapping];
		const strict_directives = false;
		const want = compile(DOC, { plugins, highlight, strict_directives });
		expect(want.code).toContain(PLAIN_CHART);
		expect(codes(want.warnings)).toEqual([['unknown_language', 7]]);
		for (let i = 0; i < 2; i++)
			expect(
				session.compile(DOC, { plugins, highlight, strict_directives })
			).toEqual(want);
		const waited = await compile_async(DOC, {
			plugins,
			highlight,
			strict_directives,
		});
		expect(waited.code).toBe(want.code);
		expect(codes(waited.warnings)).toEqual([['unknown_language', 7]]);
	});
});

describe('a claimed fence on every path a parse takes', () => {
	const claimed = new FenceClaims(new Map([['chart', 'wrapping']]));
	const source = DOC + '\n> ' + CHART.replace(/\n(?!$)/g, '\n> ');

	/** no cache keyed by start as a compile run has, a wire buffer gives every fence the start 0 */
	function render(run_path: (typeof PATHS)[number][1]) {
		const { nodes } = run_path(source, {
			plugins: [{ ...wrapping.parse!, name: 'wrapping' }],
		});
		const config = claimed.with(highlight) as HighlightConfig;
		const unknown: string[] = [];
		const ctx = {
			filename: undefined,
			unknown_language: (lang: string) => void unknown.push(lang),
			warn: () => {},
		};
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.highlight = {
			block: (code: string, lang: string, meta: string) =>
				config.block(code, lang, meta, ctx),
			inline: (code: string, lang: string) => config.inline(code, lang, ctx),
		};
		renderer.update(nodes, source);
		return { html: renderer.html, unknown };
	}

	const first = render(PATHS[0][1]);

	test('batch', () => {
		// the chart fence and the one in the quote
		expect(first.html.split(PLAIN_CHART).length).toBe(3);
		expect(first.html).toContain('<pre class="twinkleplop language-nope"');
		expect(first.unknown).toEqual(['nope']);
	});

	for (const [name, run_path] of PATHS.slice(1))
		test(name, () => expect(render(run_path)).toEqual(first));
});

describe('two plugins that claim one language', () => {
	test('are a FenceOwnerError naming both', () => {
		let error: unknown;
		try {
			compile(CHART, { plugins: [charts('one'), charts('two')] });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(FenceOwnerError);
		expect(error).toMatchObject({
			name: 'FenceOwnerError',
			language: 'chart',
			plugins: ['one', 'two'],
			message:
				'plugin "one" and plugin "two" both claim the fences of language "chart", a fence language has one owner',
		});
		expect(() => check_plugins([charts('one'), charts('two')])).toThrow(
			FenceOwnerError
		);
	});

	test('fail the vite plugin when it is set up', () => {
		expect(() => mdsvex({ plugins: [charts('one'), charts('two')] })).toThrow(
			FenceOwnerError
		);
	});

	test('one plugin may name a language twice', () => {
		expect(() =>
			check_plugins([{ name: 'twice', fences: ['chart', 'chart'] }])
		).not.toThrow();
	});

	test('fences must be a list of languages', () => {
		for (const [fences, said] of [
			['chart', 'fences must be a list of fence languages'],
			[[''], 'fences must be a list of fence languages, "" is not one'],
			[['a b'], 'fences must be a list of fence languages, "a b" is not one'],
			[[1], 'fences must be a list of fence languages, 1 is not one'],
		] as [unknown, string][])
			expect(() =>
				check_plugins([{ name: 'bad', fences: fences as string[] }])
			).toThrow(`[mdsvex] plugins[0] (bad) ${said}`);
	});
});

describe('the editor manifest', () => {
	test('lists the fences a plugin claims, also of one with no modules', () => {
		expect(
			plugin_registry([charts(), { name: 'none', fences: [] }]).describe()
		).toEqual([
			{ name: 'charts', directives: null, components: null, fences: ['chart'] },
		]);
	});
});

describe('the vite plugin', () => {
	let root: string;
	let server: ViteDevServer;
	const warned: string[] = [];

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-fence-claims-'));
		const files: Record<string, string> = {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/doc.svx': DOC,
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		const logger = createLogger('silent');
		logger.warn = (message) =>
			void warned.push(message.replace(/\u001b\[[0-9;]*m/g, ''));
		server = await createServer({
			root,
			configFile: false,
			customLogger: logger,
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				// twinkleplop is its default highlighter
				mdsvex({ plugins: [charts()] }),
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('warns of the unclaimed language only, the claimed fence renders plain', async () => {
		const made = await server.environments.ssr.transformRequest('/src/doc.svx');
		expect(made!.code).toContain('language-nope');
		expect(made!.code).toContain('<code class="language-chart">');
		expect(made!.code).not.toContain('twinkleplop language-chart');
		const languages = warned.filter((m) => m.includes('no highlighter'));
		expect(languages.length).toBe(1);
		expect(languages[0]).toContain('the language nope');
	});
});
