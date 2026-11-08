// an edited example, compiled and run in the browser: mdsvex with the plugin,
// then svelte, then the linker, then mounted where the built output was. Nothing
// here loads until a reader edits, as the docs plan has embeds start on first
// interaction, and then only the one plugin's modules.
//
// It runs in the page, not in the playground's sandboxed iframe, so it only
// ever runs what the reader typed on this page; a shared link would need the
// sandbox
import { imports_of, link, type Modules } from './link';
import { file_of } from './registry';
import type { Example, Needs, Output } from './types';

// every plugin's built modules, each loaded when an example needs it. Diagram
// is left out: its engine.js imports node:module when it loads, which a
// browser bundle can't take, so the catalog marks it static (live_blocker in
// catalog.server.ts)
const plugin_modules = import.meta.glob<Record<string, unknown>>([
	'/node_modules/@mdsvex/plugin-*/dist/**/*.js',
	'!/node_modules/@mdsvex/plugin-diagram/**',
]);

let tools: Promise<{
	compile_async: typeof import('mdsvex/compile').compile_async;
	compile_svelte: typeof import('svelte/compiler').compile;
	runtime: Modules;
	mount: typeof import('svelte').mount;
	unmount: typeof import('svelte').unmount;
}> | null = null;

/** the compilers and svelte's runtime, once per page */
function load_tools() {
	tools ??= Promise.all([
		import('mdsvex/compile'),
		import('svelte/compiler'),
		import('svelte/internal/client'),
		import('svelte'),
		// mdsvex compiles to a legacy component, and svelte's runtime needs the flag set once
		import('svelte/internal/flags/legacy'),
	]).then(([mdsvex, compiler, client, svelte]) => ({
		compile_async: mdsvex.compile_async,
		compile_svelte: compiler.compile,
		runtime: { 'svelte/internal/client': client, svelte } as Modules,
		mount: svelte.mount,
		unmount: svelte.unmount,
	}));
	return tools;
}

async function module_at(path: string | null) {
	const load = path ? plugin_modules[path] : undefined;
	if (!load) throw new Error(`no module at ${path}`);
	return load();
}

async function bundle_of(name: string, options: Record<string, unknown> = {}) {
	const entry = await module_at(file_of(name));
	// the factory is the function, not a class, whose result has a name, as a Bundle does
	for (const fn of Object.values(entry)) {
		if (typeof fn !== 'function' || /^class\s/.test(String(fn))) continue;
		let bundle: unknown;
		try {
			bundle = fn(options);
		} catch {
			continue;
		}
		if (bundle && typeof bundle === 'object' && 'name' in bundle) return bundle;
	}
	throw new Error(`${name} exports no factory`);
}

/** a file an example reads, by the absolute path a plugin asks for, as the build reads it */
function reader(files: Record<string, string> = {}) {
	const by_path = new Map(Object.entries(files).map(([rel, text]) => [new URL(rel, 'file:///docs/example.svx').pathname, text]));
	return (path: string) => {
		const text = by_path.get(path);
		if (text === undefined) throw new Error(`the example has no file ${path}`);
		return text;
	};
}

export interface Run {
	output: Omit<Output, 'html' | 'pretty'>;
	/** take the mounted example out, before the next run */
	destroy: () => void;
}

/**
 * compiles the source with the plugin and mounts it in target, or leaves
 * target as it was and says why it failed
 */
export async function run(
	name: string,
	source: string,
	example: Example,
	needs: Needs | undefined,
	target: HTMLElement,
): Promise<Run> {
	const t = await load_tools();
	try {
		const plugins = await Promise.all([...(example.with ?? []).map((w) => bundle_of(w)), bundle_of(name, example.options)]);
		const result: any = await t.compile_async(source, {
			filename: '/docs/example.svx',
			heading_ids: true,
			unwrap_images: !!needs?.unwrap_images,
			strict_directives: false,
			plugins,
			read: reader(example.files),
		} as any);
		const { js } = t.compile_svelte(result.code, { generate: 'client', filename: 'Example.svelte', css: 'injected' });
		const modules: Modules = { ...t.runtime };
		for (const spec of imports_of(js.code)) {
			if (modules[spec] || !spec.startsWith('@mdsvex/plugin-')) continue;
			modules[spec] = await module_at(file_of(spec));
		}
		const component = link(js.code, modules) as any;
		target.replaceChildren();
		const mounted = t.mount(component, { target });
		return {
			output: {
				data: result.data ?? null,
				warnings: (result.warnings ?? [])
					.map((w: any) => ({ code: w.code, message: w.message, line: w.start?.line }))
					.sort((a: any, b: any) => (a.line ?? 0) - (b.line ?? 0)),
				error: null,
			},
			destroy: () => t.unmount(mounted),
		};
	} catch (error) {
		return {
			output: { data: null, warnings: [], error: (error as Error).message.replace(/^\[mdsvex\] /, '') },
			destroy: () => {},
		};
	}
}
