// every first-party plugin, read from the plugin itself and compiled when the
// site builds. The docs are prerendered, so none of this reaches the browser
// but its results.
//
// From its package.json: name, description, keywords, version, peers, the
// components and stylesheets it exports, and the `mdsvex` field: its concerns,
// the syntax it reads, what it needs. From the bundle its factory returns: the
// directives it owns, the nodes it acts on, the fences it claims, the elements
// it replaces. From its types: the options its factory takes, with their doc
// comments. From the frontmatter of its docs page: the page's title and the
// example, compiled here with the plugin on
import { compile_async } from 'mdsvex/compile';
import * as svelte from 'svelte';
import { compile as compile_svelte } from 'svelte/compiler';
import * as server from 'svelte/internal/server';
import { render } from 'svelte/server';
import { pretty } from '../../../../build/examples.js';
import { pfm_tree } from '$lib/design/pfm';
import { CONCERNS, type ConcernId } from './concerns';
import { link, type Modules } from './link';
import { factory_of, options_of } from './options';
import { file_of, packages, types_of, type Manifest } from './registry';
import type { Example, Needs, Output, Plugin, Reads, Sample, Term } from './types';

const modules = import.meta.glob<Record<string, unknown>>('/node_modules/@mdsvex/plugin-*/dist/**/*.js', { eager: true });
const types = import.meta.glob<string>('/node_modules/@mdsvex/plugin-*/dist/**/*.d.ts', { eager: true, query: '?raw', import: 'default' });
const code = import.meta.glob<string>('/node_modules/@mdsvex/plugin-*/dist/**/*.js', { eager: true, query: '?raw', import: 'default' });

/** each plugin's docs page, by the package its frontmatter names */
const pages = new Map(
	Object.entries(
		import.meta.glob<{ title: string; package?: string; example?: Example }>('/src/routes/docs/plugins/*/+page.svx', {
			query: '?metadata',
			import: 'metadata',
			eager: true,
		}),
	)
		.filter(([, metadata]) => metadata?.package)
		.map(([path, metadata]) => {
			const id = path.split('/').at(-2)!;
			return [metadata.package!, { id, href: `/docs/plugins/${id}`, title: metadata.title, example: metadata.example }] as const;
		}),
);

const FILENAME = '/docs/example.svx';

/** the files of a package under a glob, by path */
const files_of = <T>(glob: Record<string, T>, name: string) => Object.entries(glob).filter(([path]) => path.startsWith(types_of(name)));

/** a bundle from a plugin's factory, by package name */
function bundle_of(name: string, options: Record<string, unknown> = {}) {
	const factory = factory_of(types[`${types_of(name)}index.d.ts`] ?? '');
	const fn = factory && modules[file_of(name) ?? '']?.[factory.name];
	if (typeof fn !== 'function') throw new Error(`${name} exports no factory`);
	return fn(options);
}

/** what a bundle reads, from its keys, so nothing is said that the plugin doesn't do */
function reads_of(bundle: any): Reads {
	const parse = bundle.parse ?? {};
	const skip = new Set(['name', 'sequential', 'text', 'document', 'all_text', 'observe']);
	return {
		directives: Object.keys(bundle.directives ?? {}),
		nodes: Object.keys(parse).filter((k) => !skip.has(k) && typeof parse[k] === 'object'),
		text: typeof parse.text === 'function',
		document: typeof parse.document === 'function',
		fences: bundle.fences ?? [],
		elements: bundle.components?.names ?? [],
		observes: Object.keys(parse.observe ?? {}),
	};
}

/** the modules a compiled example imports: svelte's server runtime and the plugins' own */
function server_modules(js: string): Modules {
	const out: Modules = { 'svelte/internal/server': server, svelte };
	for (const [, spec] of js.matchAll(/from ['"](@mdsvex\/plugin-[^'"]+)['"]/g)) {
		const path = file_of(spec);
		if (path && modules[path]) out[spec] = modules[path];
	}
	return out;
}

/** a file an example reads, by the absolute path a plugin asks for */
function reader(files: Record<string, string> = {}) {
	const by_path = new Map(Object.entries(files).map(([rel, text]) => [new URL(rel, `file://${FILENAME}`).pathname, text]));
	return (path: string) => {
		const text = by_path.get(path);
		if (text === undefined) throw new Error(`the example has no file ${path}`);
		return text;
	};
}

function compile_options(needs: Needs | undefined, example: Example, plugins: unknown[]) {
	return {
		filename: FILENAME,
		heading_ids: true,
		unwrap_images: !!needs?.unwrap_images,
		strict_directives: false,
		plugins,
		read: reader(example.files),
	};
}

/** the example through mdsvex, svelte and svelte's server render, as html */
async function html_of(source: string, options: ReturnType<typeof compile_options>) {
	const result: any = await compile_async(source, options as any);
	const { js } = compile_svelte(result.code, { generate: 'server', filename: 'Example.svelte' });
	const component = link(js.code, server_modules(js.code));
	// svelte's hydration marks, `<!--[-1-->`, `<!--$s1-->`, a hash, have no space; a comment an author wrote does
	const html = render(component as any).body.replace(/<!--[^\s>]*-->/g, '');
	return { result, html };
}

/** the example with its plugin on, and whether the page would be the same without it */
async function output_of(name: string, needs: Needs | undefined, example: Example): Promise<Output> {
	const empty: Output = { html: '', pretty: '', data: null, warnings: [], unchanged: false, error: null };
	try {
		const others = (example.with ?? []).map((w) => bundle_of(w));
		const { result, html } = await html_of(example.source, compile_options(needs, example, [...others, bundle_of(name, example.options)]));
		const without = await html_of(example.source, compile_options(needs, example, others)).catch(() => null);
		return {
			html: html.replace(/<a\b([^>]*?)(\s+rel="([^"]*)")?([^>]*)>/g, (_, a, __, rel, b) => `<a${a} rel="${rel ? `${rel} ` : ''}external"${b}>`),
			pretty: pretty(html),
			data: result.data ?? null,
			warnings: (result.warnings ?? [])
				.map((w: any) => ({ code: w.code, message: w.message, line: w.start?.line }))
				.sort((a: any, b: any) => (a.line ?? 0) - (b.line ?? 0)),
			unchanged: without?.html === html,
			error: null,
		};
	} catch (error) {
		return { ...empty, error: (error as Error).message.replace(/^\[mdsvex\] /, '') };
	}
}

/** a sample compiled with and without the plugin must differ, or the finder would be claiming syntax the plugin doesn't read */
async function check_sample(name: string, needs: Needs | undefined, example: Example, source: string) {
	const sample = { ...example, source };
	const run = async (plugins: unknown[]) => {
		const r: any = await compile_async(source, compile_options(needs, sample, plugins) as any);
		return JSON.stringify([r.code, r.data, r.warnings?.map((w: any) => w.code)]);
	};
	const others = () => (example.with ?? []).map((w) => bundle_of(w));
	const off = await run(others());
	const on = await run([...others(), bundle_of(name, example.options)]);
	if (on === off) throw new Error(`${name}: the syntax sample ${JSON.stringify(source)} compiles the same without the plugin`);
}

/** the kind the parser reads a mark's outermost node as: the directive, the heading, or text */
function kind_of(mark: string): string {
	let node = pfm_tree(`${mark}\n`).children?.[0];
	while (node && node.type === 'paragraph') node = node.children?.find((c) => c.type !== 'text') ?? { type: 'text', start: 0, end: 0 };
	return node?.type ?? 'text';
}

/** what blocks running the plugin in the browser, found by looking, said plainly */
function live_blocker(name: string): string | null {
	for (const [path, text] of files_of(code, name)) {
		const node = /^import [^\n]*from ['"](node:[\w/]+)['"]/m.exec(text);
		if (node) return `${path.split('/').pop()} imports ${node[1]} when the plugin loads, to find which engine is installed`;
	}
	return null;
}

function peers_of(m: Manifest) {
	return Object.keys(m.peerDependencies ?? {})
		.filter((name) => name !== 'mdsvex' && name !== 'svelte')
		.map((name) => ({ name, optional: !!m.peerDependenciesMeta?.[name]?.optional }));
}

function exports_of(m: Manifest) {
	const keys = Object.keys(m.exports ?? {});
	return {
		components: keys.filter((k) => k.endsWith('.svelte')).map((k) => k.slice(2)),
		css: keys.filter((k) => k.endsWith('.css')).map((k) => k.slice(2)),
	};
}

async function plugin_of(name: string, m: Manifest, strict: boolean): Promise<Plugin> {
	const page = pages.get(name);
	// a plugin the site depends on is documented: a strict build fails without its page
	if (!page && strict) throw new Error(`${name} has no page under docs/plugins whose frontmatter names it as its package`);
	const declared = m.mdsvex ?? {};
	const concerns = (declared.concerns ?? []).filter((c): c is ConcernId => CONCERNS.some((k) => k.id === c));
	const syntax = (declared.syntax ?? []).map((s) => (typeof s === 'string' ? { mark: s, source: `${s}\n` } : s));
	const example: Example = page?.example ?? { source: '' };

	const factory = factory_of(types[`${types_of(name)}index.d.ts`] ?? '');
	// the interface may be declared in any file of the package
	const declarations = files_of(types, name)
		.map(([, text]) => text)
		.join('\n');
	const options = factory?.options ? options_of(declarations, factory.options) : [];

	let reads: Reads = { directives: [], nodes: [], text: false, document: false, fences: [], elements: [], observes: [] };
	let live = live_blocker(name);
	try {
		reads = reads_of(bundle_of(name, example.options));
	} catch (error) {
		live ??= (error as Error).message;
	}

	for (const s of syntax) {
		try {
			await check_sample(name, declared.needs, example, s.source);
		} catch (error) {
			if (strict) throw error;
			console.warn(`[docs] ${(error as Error).message}`);
		}
	}

	const output = example.source
		? await output_of(name, declared.needs, example)
		: { html: '', pretty: '', data: null, warnings: [], unchanged: false, error: 'its docs page has no example yet' };
	if (output.error && strict && !live) throw new Error(`${name}: the example does not compile: ${output.error}`);

	const short = name.replace('@mdsvex/plugin-', '');
	return {
		id: page?.id ?? short,
		href: page?.href ?? '/docs/plugins',
		package: name,
		title: page?.title ?? short,
		short,
		factory: factory?.name ?? short,
		description: (m.description ?? '').replace(/ for mdsvex\b/, ''),
		keywords: (m.keywords ?? []).filter((k) => !['mdsvex', 'mdsvex-plugin', 'svelte', 'markdown'].includes(k)),
		version: m.version,
		concerns,
		syntax: syntax.map((s): Sample => ({ mark: s.mark, kind: kind_of(s.mark) })),
		reads,
		options,
		peers: peers_of(m),
		exports: exports_of(m),
		needs: declared.needs,
		waits: declared.waits,
		example: { ...example, output },
		live,
	};
}

/** the words search can match for a plugin, each with the field it came from */
export function terms_of(p: Plugin): Term[] {
	const concerns = CONCERNS.filter((c) => p.concerns.includes(c.id));
	return [
		{ text: p.title, field: 'name' },
		{ text: p.short, field: 'name' },
		{ text: p.factory, field: 'name' },
		{ text: p.package, field: 'package' },
		...p.syntax.map((s) => ({ text: s.mark, field: 'syntax' as const })),
		...p.reads.directives.map((d) => ({ text: d, field: 'directive' as const })),
		...p.reads.fences.map((f) => ({ text: f, field: 'syntax' as const })),
		...p.reads.nodes.map((n) => ({ text: n, field: 'reads' as const })),
		...p.reads.elements.map((e) => ({ text: e, field: 'reads' as const })),
		...p.options.map((o) => ({ text: o.name, field: 'option' as const })),
		{ text: p.description, field: 'description' },
		...p.keywords.map((k) => ({ text: k, field: 'keyword' as const })),
		...concerns.flatMap((c) => [
			{ text: c.name, field: 'concern' as const },
			{ text: c.line, field: 'concern' as const },
		]),
		...p.options.filter((o) => o.text).map((o) => ({ text: `${o.name}: ${o.text}`, field: 'doc' as const })),
	];
}

let cache: Promise<Plugin[]> | null = null;

/**
 * every plugin the site depends on, compiled once per build. A strict build
 * fails on a plugin with no docs page, a syntax sample the plugin doesn't read
 * or an example that doesn't compile
 */
export function catalog({ strict = false } = {}): Promise<Plugin[]> {
	cache ??= Promise.all([...packages].map(([name, m]) => plugin_of(name, m, strict)));
	return cache;
}
