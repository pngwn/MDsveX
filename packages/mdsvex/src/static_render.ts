/**
 * the dev server side of static directives, components load and render in
 * an environment of their own, so none of them enters the client graph and
 * hotUpdate in that environment names exactly what a shell read
 */
import type { Shell } from '@mdsvex/render/html-cursor';
import { parse } from 'es-module-lexer/js';
import type {
	EnvironmentModuleNode,
	Plugin,
	ResolvedConfig,
	UserConfig,
	ViteDevServer,
} from 'vite';
import type { Need, ShellNeed } from './compile.js';
import { clean_id } from './ids.js';
import {
	ShellError,
	STATIC_ENVIRONMENT,
	asset_marker,
	hole_html,
	make_shell,
} from './shells.js';
import { check_static } from './static_check.js';
import { is_static_file } from './static_directives.js';

interface Runner {
	import(id: string): Promise<any>;
	clearCache(): void;
}

interface StaticEnvironment {
	runner?: Runner;
	moduleGraph: {
		getModulesByFile(file: string): Set<EnvironmentModuleNode> | undefined;
		invalidateModule(
			mod: EnvironmentModuleNode,
			seen: Set<EnvironmentModuleNode>,
			timestamp: number,
			hmr: boolean
		): void;
	};
	pluginContainer: {
		load(id: string): Promise<string | { code: string } | null | undefined>;
	};
	transformRequest(url: string): Promise<unknown>;
}

/** the query of a directives module served without its static re-exports */
export const LIVE_QUERY = 'mdsvex-live';
/** the suffix of the module mdsvex serves the scoped styles of a static component from */
export const STATIC_CSS = '.mdsvex-static.css';

// the style module vite-plugin-svelte serves for a component
const SVELTE_STYLE = /\?svelte&type=style&lang\.css$/;
const CSS_FILE =
	/\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
// a style imported as a string or a url is no stylesheet of the page
const CSS_NOT_SHEET = /[?&](?:inline|url|raw)\b/;

/** an import that only runs the module, the specifier as an id is written */
function css_import(id: string): string {
	return `import ${JSON.stringify(id)};\n`;
}

/** what shells read and made, one per dev server, one per process for a build */
interface ShellState {
	table: Map<string, Shell>;
	/** the documents that rendered with a shell, compiled again when one goes */
	docs: Set<string>;
	/** the scoped styles of each static component, by the id documents import */
	styles: Map<string, string>;
	/** every style id served, kept over a change so hotUpdate can name them */
	style_ids: Set<string>;
	/** the number of the local each asset id is imported as */
	asset_numbers: Map<string, number>;
	/** the shell keys each file a shell read is in, a change of the file drops them */
	readers: Map<string, Set<string>>;
	/** the files each shell read, for a build that watches */
	read: Map<string, string[]>;
}

function fresh_state(): ShellState {
	return {
		table: new Map(),
		docs: new Set(),
		styles: new Map(),
		style_ids: new Set(),
		asset_numbers: new Map(),
		readers: new Map(),
		read: new Map(),
	};
}

/**
 * the builds of one process share what shells they made, sveltekit builds
 * the server and then the client, each with plugins of its own, so the
 * second renders nothing again, keyed by the config file, root and mode
 */
const build_states = new Map<string, ShellState>();

/**
 * the shells of a dev server or a build, the table compile reads, filled
 * before a document that waits for one renders, a dev server renders in
 * its own static environment, a build in that of a dev server it starts
 */
export function static_shells() {
	let state = fresh_state();
	let server: ViteDevServer | null = null;
	/** starts the dev server of a build, null in dev */
	let start: (() => Promise<ViteDevServer>) | null = null;
	let starting: Promise<ViteDevServer> | null = null;
	/** why a build can not render shells, null when it can */
	let refused: string | null = null;
	let last = { timestamp: -1, hit: false };

	async function environment(): Promise<StaticEnvironment> {
		if (refused !== null) throw new Error(refused);
		if (server === null && start !== null) {
			starting ??= start();
			server = await starting;
		}
		const env = server?.environments[STATIC_ENVIRONMENT] as
			| StaticEnvironment
			| undefined;
		if (env?.runner === undefined)
			throw new Error(
				`can not render, the ${STATIC_ENVIRONMENT} environment of the dev server can not run modules`
			);
		return env;
	}

	/**
	 * the import lines for the styles the component at file reached in the
	 * static graph, in import order, scoped styles come from mdsvex as the
	 * client never compiled the component, and the files the walk passed
	 */
	async function graph_of(
		env: StaticEnvironment,
		file: string
	): Promise<{ lines: string[]; files: string[] }> {
		const lines: string[] = [];
		const files: string[] = [];
		const seen = new Set<EnvironmentModuleNode>();
		const queue = [...(env.moduleGraph.getModulesByFile(file) ?? [])];
		for (let i = 0; i < queue.length; i++) {
			const mod = queue[i];
			if (seen.has(mod)) continue;
			seen.add(mod);
			const id = mod.id;
			// a package does not change while a process runs
			if (mod.file !== null && mod.file.indexOf('/node_modules/') === -1)
				if (!files.includes(mod.file)) files.push(mod.file);
			if (id !== null && CSS_FILE.test(id) && !CSS_NOT_SHEET.test(id)) {
				if (SVELTE_STYLE.test(id)) {
					const served = clean_id(id) + STATIC_CSS;
					if ((await compiled_style(served, env)) !== '')
						lines.push(css_import(served));
				} else lines.push(css_import(id));
			}
			for (const dep of mod.importedModules) queue.push(dep);
		}
		return { lines, files };
	}

	/** the css svelte compiled for the component of a served id, before any css plugin ran */
	async function compiled_style(
		served: string,
		env?: StaticEnvironment
	): Promise<string> {
		const hit = state.styles.get(served);
		if (hit !== undefined) return hit;
		env ??= await environment();
		const file = served.slice(0, -STATIC_CSS.length);
		// vite-plugin-svelte has the css of a component it compiled in this environment
		await env.transformRequest(file);
		const loaded = await env.pluginContainer.load(
			file + '?svelte&type=style&lang.css'
		);
		const css = (typeof loaded === 'string' ? loaded : loaded?.code) ?? '';
		state.styles.set(served, css);
		state.style_ids.add(served);
		return css;
	}

	/** forgets the shells that read file and the styles of file, true when there were any */
	function forget(file: string): boolean {
		const keys = state.readers.get(file);
		const style = file + STATIC_CSS;
		const styled = state.styles.delete(style);
		if (keys === undefined) return styled;
		state.readers.delete(file);
		for (const key of keys) {
			state.table.delete(key);
			for (const other of state.read.get(key) ?? [])
				if (other !== file) state.readers.get(other)?.delete(key);
			state.read.delete(key);
		}
		return true;
	}

	return {
		/** the table compile reads, another object once share took that of a build */
		get table(): Map<string, Shell> {
			return state.table;
		},

		/** true once a dev server with the environment is attached */
		attach(dev: ViteDevServer): boolean {
			if (dev.environments[STATIC_ENVIRONMENT] === undefined) return false;
			server = dev;
			return true;
		},

		/**
		 * renders in a dev server start gives when the first shell is
		 * needed, sharing what the builds of this process with key made
		 */
		build(key: string, starter: () => Promise<ViteDevServer>): void {
			let shared = build_states.get(key);
			if (shared === undefined) build_states.set(key, (shared = state));
			state = shared;
			start = starter;
		},

		/** a build that can not render shells, a document with a static directive throws message */
		refuse(message: string): void {
			refused = message;
		},

		/** closes a dev server the build started, the shells stay for the next build */
		async close(): Promise<void> {
			if (start === null || starting === null) return;
			const dev = await starting.catch(() => null);
			server = null;
			starting = null;
			await dev?.close();
		},

		/**
		 * renders the shell of each need of type shell the table lacks,
		 * file_of gives the component file of a static directive, returns
		 * the files the shells of the document read, for a build that watches
		 */
		async render(
			needs: readonly Need[],
			id: string,
			file: string,
			file_of: (specifier: string, name: string) => string | undefined
		): Promise<string[]> {
			const missing = needs.filter(
				(n): n is ShellNeed => n.type === 'shell' && !state.table.has(n.key)
			);
			if (missing.length === 0) return [];
			let env: StaticEnvironment;
			try {
				env = await environment();
			} catch (e) {
				const message = (e as Error).message.replace(/^\[mdsvex\] /, '');
				throw new ShellError(missing[0], file, message);
			}
			const run = env.runner!;
			// the components and the renderer must share one svelte
			const [{ render }, { createRawSnippet }] = await Promise.all([
				run.import('svelte/server'),
				run.import('svelte'),
			]);
			const hole = (name: 'label' | 'children') =>
				createRawSnippet(() => ({ render: () => hole_html(name) }));
			const read: string[] = [];
			for (const need of missing) {
				const component_file = file_of(need.specifier, need.name);
				// read again on each render, an edit of the component may add a handler
				const problem =
					component_file === undefined
						? null
						: await check_static(component_file);
				if (problem !== null)
					throw new ShellError(
						need,
						file,
						'can not render: ' + problem.message.replace(/^\[mdsvex\] /, '')
					);
				let out: { body: string; head: string };
				try {
					// through the directives module, so its own imports run as they do live
					const mod = await run.import(need.specifier);
					const component = mod[need.name];
					if (typeof component !== 'function')
						throw new Error(
							`${need.specifier} exports no component named ${JSON.stringify(need.name)}`
						);
					const props: Record<string, unknown> = { ...need.args };
					if (need.label) props.label = hole('label');
					if (need.children) props.children = hole('children');
					// an async component needs the await, a sync one is thenable too
					out = await render(component, { props });
				} catch (e) {
					const error = new ShellError(
						need,
						file,
						`failed to render at build time: ${(e as Error).message}`
					);
					(error as { cause?: unknown }).cause = e;
					throw error;
				}
				if (out.head.trim() !== '')
					throw new ShellError(
						need,
						file,
						'renders <svelte:head> content, which a static directive can not carry yet'
					);
				const graph =
					component_file === undefined
						? { lines: undefined, files: [] }
						: await graph_of(env, component_file);
				state.table.set(
					need.key,
					make_shell(out.body, need, file, {
						imports: graph.lines,
						asset: (asset_id) => {
							let n = state.asset_numbers.get(asset_id);
							if (n === undefined)
								state.asset_numbers.set(
									asset_id,
									(n = state.asset_numbers.size)
								);
							return n;
						},
					})
				);
				state.read.set(need.key, graph.files);
				for (const f of graph.files) {
					let keys = state.readers.get(f);
					if (keys === undefined) state.readers.set(f, (keys = new Set()));
					keys.add(need.key);
					if (!read.includes(f)) read.push(f);
				}
			}
			state.docs.add(id);
			return read;
		},

		/** true for the id of the scoped styles of a static component */
		is_style(id: string): boolean {
			return (
				id.endsWith(STATIC_CSS) &&
				is_static_file(id.slice(0, -STATIC_CSS.length))
			);
		},

		/** the scoped styles of a static component, compiled again after a change */
		style(id: string): Promise<string> {
			return compiled_style(id);
		},

		/** the ids of the scoped styles served so far */
		styles(): ReadonlySet<string> {
			return state.style_ids;
		},

		/**
		 * what an asset loads as in the static environment, a marker the
		 * shell turns back into an import, undefined for anything else
		 */
		asset(id: string, config: ResolvedConfig): string | undefined {
			const q = id.indexOf('?');
			const path = q < 0 ? id : id.slice(0, q);
			const query = q < 0 ? '' : id.slice(q);
			const url = /[?&]url(?:&|$)/.test(query);
			// an asset with any other query is a transform of its own, enhanced-img
			if (!url && (query !== '' || !config.assetsInclude(path))) return;
			return `export default ${JSON.stringify(asset_marker(id))};`;
		},

		/**
		 * true when file reaches a component a shell rendered, the first
		 * environment to ask at a timestamp drops every shell and the modules
		 * of the environment for the file, the others get the same answer
		 */
		touch(file: string, timestamp: number): boolean {
			if (last.timestamp === timestamp) return last.hit;
			const env = server?.environments[STATIC_ENVIRONMENT] as
				| StaticEnvironment
				| undefined;
			const mods = env?.moduleGraph.getModulesByFile(file);
			const hit =
				mods !== undefined && mods.size !== 0 && state.table.size !== 0;
			last = { timestamp, hit };
			if (!hit) return false;
			for (const mod of mods!)
				env!.moduleGraph.invalidateModule(mod, new Set(), timestamp, true);
			env!.runner!.clearCache();
			state.table.clear();
			state.styles.clear();
			state.readers.clear();
			state.read.clear();
			return true;
		},

		/**
		 * a watching build saw file change, the shells that read it go and a
		 * dev server the build still holds forgets its modules
		 */
		changed(file: string): void {
			if (!forget(file)) return;
			const env = server?.environments[STATIC_ENVIRONMENT] as
				| StaticEnvironment
				| undefined;
			if (env === undefined) return;
			for (const mod of env.moduleGraph.getModulesByFile(file) ?? [])
				env.moduleGraph.invalidateModule(mod, new Set(), Date.now(), true);
			env.runner!.clearCache();
		},

		/** the documents that rendered with a shell */
		documents(): ReadonlySet<string> {
			return state.docs;
		},
	};
}

export type StaticShells = ReturnType<typeof static_shells>;

/** the config that adds the environment, a build renders in a dev server it starts */
export function static_environment(): UserConfig {
	return { environments: { [STATIC_ENVIRONMENT]: { consumer: 'server' } } };
}

/** id with the live query, the directives module without its static re-exports */
export function live_id(id: string): string {
	return id + (id.indexOf('?') === -1 ? '?' : '&') + LIVE_QUERY;
}

const LIVE = new RegExp(`[?&]${LIVE_QUERY}(?:&|$)`);

/**
 * gives the static environment the resolve options of ssr, without them
 * svelte is external there and the component and svelte/server load two
 * copies of the runtime, and blanks the static re-exports of a directives
 * module served with the live query, it runs last so it sees what other
 * plugins set and transforms javascript
 */
export function static_environment_plugin(): Plugin {
	let ssr: unknown;
	return {
		name: 'mdsvex:static-environment',
		enforce: 'post',
		configEnvironment(name, config) {
			if (name === 'ssr') ssr = config.resolve;
			else if (name === STATIC_ENVIRONMENT && ssr !== undefined)
				return { resolve: { ...(ssr as object) } };
		},
		async transform(code, id) {
			if (!LIVE.test(id)) return;
			const file = clean_id(id);
			const blanked = await without_static(code, (spec) =>
				this.resolve(spec, file, { skipSelf: true }).then((r) =>
					r === null || r.external ? null : clean_id(r.id)
				)
			);
			// the same length on the same lines, so the map of the code before holds
			return blanked === code ? undefined : { code: blanked, map: null };
		},
	};
}

/**
 * code with each re-export of a static component blanked, newlines kept so
 * every other line and column stays where it was
 */
export async function without_static(
	code: string,
	resolve: (spec: string) => Promise<string | null>
): Promise<string> {
	const [imports] = parse(code);
	let out = code;
	for (const imp of imports) {
		if (imp.n === undefined || imp.t !== 1) continue;
		if (!code.startsWith('export', imp.ss)) continue;
		const file = await resolve(imp.n);
		if (file === null || !is_static_file(file)) continue;
		// a trailing semicolon is part of the statement
		const end = code[imp.se] === ';' ? imp.se + 1 : imp.se;
		out =
			out.slice(0, imp.ss) +
			code.slice(imp.ss, end).replace(/[^\n]/g, ' ') +
			out.slice(end);
	}
	return out;
}

/** the modules of the documents in graph, invalidated at timestamp */
export function document_modules(
	graph: {
		getModuleById(id: string): EnvironmentModuleNode | undefined;
		getModulesByFile(file: string): Set<EnvironmentModuleNode> | undefined;
		invalidateModule(
			mod: EnvironmentModuleNode,
			seen: Set<EnvironmentModuleNode>,
			timestamp: number,
			hmr: boolean
		): void;
	},
	docs: Iterable<string>,
	clean: (id: string) => string,
	timestamp: number
): EnvironmentModuleNode[] {
	const out: EnvironmentModuleNode[] = [];
	for (const doc of docs) {
		const mod = graph.getModuleById(doc);
		const mods = mod !== undefined ? [mod] : graph.getModulesByFile(clean(doc));
		if (mods === undefined) continue;
		for (const m of mods) {
			graph.invalidateModule(m, new Set(), timestamp, true);
			out.push(m);
		}
	}
	return out;
}
