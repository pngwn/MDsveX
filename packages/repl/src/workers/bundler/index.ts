import '../polyfills';
import '../patch_window';
import { rollup } from '@rollup/browser';
import typescript_strip_types from './plugins/typescript';
import commonjs from './plugins/commonjs';
import json from './plugins/json';
import image from './plugins/image';
import svg from './plugins/svg';
import replace from './plugins/replace';
import loop_protect from './plugins/loop_protect';
import { resolve } from './plugins/resolve';
import type { Plugin, SourceMapInput, TransformResult } from '@rollup/browser';
import type { CompileError, CompileResult } from 'svelte/compiler';
import type { BundleMessageData, BundleOptions } from '../workers';
import type { BundleResult, Warning } from '../../types';
import type { File } from '../../workspace.svelte';
import { max } from './semver';
import { NPM, VIRTUAL } from '../constants';
import {
	normalize_path,
	fetch_package,
	load_svelte,
	parse_npm_url,
	resolve_local,
	resolve_subpath,
	resolve_version,
	type Package,
} from '../npm';
import { is_sveltekit_virtual_module } from '../sveltekit';
import {
	compile_markdown,
	is_markdown,
	prepare,
	resolve_virtual,
	type Prepared,
} from '../mdsvex';

// magic-string and rollup read window, it stays inline so it is not treeshaken
self.window = self;

const ENTRYPOINT = '__entry.js';
const WRAPPER = '__wrapper.svelte';
const STYLES = '__styles.js';
const ESM_ENV = '__esm-env.js';

let current_id: number;

self.addEventListener(
	'message',
	async (event: MessageEvent<BundleMessageData>) => {
		switch (event.data.type) {
			case 'init': {
				get_svelte(event.data.svelte_version);
				break;
			}

			case 'bundle': {
				try {
					const { uid, files, options } = event.data;
					const { svelte, version, can_use_experimental_async } =
						await get_svelte(options.svelte_version);

					current_id = uid;

					setTimeout(async () => {
						if (current_id !== uid) return;

						const use_async = can_use_experimental_async && options.async;
						const result = await bundle(
							svelte,
							version,
							uid,
							files,
							options,
							!!use_async
						);

						if (
							(result.error as any)?.svelte_bundler_aborted ===
							ABORT.svelte_bundler_aborted
						) {
							return;
						}
						if (result && uid === current_id) postMessage(result);
					});
				} catch (e) {
					self.postMessage({
						type: 'error',
						uid: event.data.uid,
						message: `Error loading the compiler: ${(e as Error).message}`,
					});
				}

				break;
			}
		}
	}
);

let ready: ReturnType<typeof load_svelte>;
let ready_version: string;

function get_svelte(svelte_version: string) {
	if (ready_version === svelte_version) return ready;

	self.postMessage({
		type: 'status',
		message: `fetching svelte@${svelte_version}`,
	});
	ready_version = svelte_version;
	ready = load_svelte(svelte_version || 'latest');
	ready.then(({ version, can_use_experimental_async }) => {
		ready_version = version;
		self.postMessage({
			type: 'version',
			version,
			supports_async: can_use_experimental_async,
		});
	});
	return ready;
}

const ABORT = { svelte_bundler_aborted: true };

async function get_bundle(
	svelte: typeof import('svelte/compiler'),
	svelte_version: string,
	uid: number,
	virtual: Map<string, File>,
	prepared: Prepared,
	options: BundleOptions,
	can_use_experimental_async: boolean
) {
	/** package names imported by workspace files, for downloads */
	const imports: Set<string> = new Set();
	const warnings: Warning[] = [];
	const all_warnings: Array<{ message: string }> = [];
	const { config } = prepared;

	const is_component = (id: string) =>
		id.endsWith('.svelte') || is_markdown(id, config);

	const mdsvex_plugin: Plugin = {
		name: 'mdsvex',
		resolveId(importee, importer) {
			if (!importee.startsWith('mdsvex:')) return null;

			const target = resolve_virtual(importee, config);
			if (target.file !== null) return `${VIRTUAL}/${target.file}`;

			// a package specifier, resolved as if the document imported it
			return this.resolve(target.specifier, importer, { skipSelf: true });
		},
		transform(code, id) {
			if (uid !== current_id) throw ABORT;
			if (!id.startsWith(VIRTUAL) || !is_markdown(id, config)) return null;

			const name = id.slice(VIRTUAL.length + 1);
			const { code: svelte_code, map } = compile_markdown(
				code,
				name,
				prepared.options
			);
			return { code: svelte_code, map: map as SourceMapInput };
		},
	};

	const repl_plugin: Plugin = {
		name: 'svelte-repl',
		async resolveId(importee, importer) {
			if (uid !== current_id) throw ABORT;

			if (!importer) return `${VIRTUAL}/${ENTRYPOINT}`;

			if (importee === 'esm-env') return `${VIRTUAL}/${ESM_ENV}`;

			if (is_sveltekit_virtual_module(importee)) {
				throw new Error(
					`Cannot import "${importee}" in the playground. This module is only available in SvelteKit projects.`
				);
			}

			if (/^[a-z]+:/.test(importee)) return importee;

			/** the npm package we are importing from, if any */
			let current: null | Package = null;

			if (importer.startsWith(NPM)) {
				const { name, version } = parse_npm_url(importer);
				current = await fetch_package(
					name,
					name === 'svelte' ? svelte_version : version
				);
			}

			if (importee[0] === '.') {
				if (importer.startsWith(VIRTUAL)) {
					return resolve(virtual, importee, importer);
				}

				if (current) {
					const { name, version } = current.meta;
					const path = new URL(importee, importer).href.replace(
						`${NPM}/${name}@${version}/`,
						''
					);

					return normalize_path(current, path, importee, importer);
				}

				return new URL(importee, importer).href;
			}

			if (importee[0] === '#') {
				if (current) {
					const subpath = resolve_subpath(current, importee);
					return normalize_path(current, subpath.slice(2), importee, importer);
				}
				return await resolve_local(importee);
			}

			const match = /^((?:@[^/]+\/)?[^/@]+)(?:@([^/]+))?(\/.+)?$/.exec(
				importee
			);
			if (!match) throw new Error(`Invalid import "${importee}"`);

			const pkg_name = match[1];

			if (pkg_name === 'svelte' && svelte_version === 'local') {
				return await resolve_local(importee);
			}

			let default_version = 'latest';

			if (current) {
				// use the version the importing package asks for, not latest
				const { meta } = current;

				if (meta.name === pkg_name) {
					default_version = meta.version;
				} else {
					default_version = max(
						meta.devDependencies?.[pkg_name] ??
							meta.peerDependencies?.[pkg_name] ??
							meta.dependencies?.[pkg_name]
					);
				}
			}

			if (importer.startsWith(VIRTUAL)) {
				imports.add(pkg_name);
			}

			const v = await resolve_version(match[1], match[2] ?? default_version);
			const pkg = await fetch_package(
				pkg_name,
				pkg_name === 'svelte' ? svelte_version : v
			);
			const subpath = resolve_subpath(pkg, '.' + (match[3] ?? ''));

			return normalize_path(pkg, subpath.slice(2), importee, importer);
		},
		async load(resolved) {
			if (uid !== current_id) throw ABORT;

			if (resolved.startsWith(VIRTUAL)) {
				const file = virtual.get(resolved.slice(VIRTUAL.length + 1));
				if (!file)
					throw new Error(
						`'${resolved.slice(VIRTUAL.length + 1)}' does not exist`
					);
				return file.contents;
			}

			if (resolved.startsWith(NPM)) {
				let [, name, v, subpath] =
					/^npm:\/\/\$\/((?:@[^/]+\/)?[^/@]+)(?:@([^/]+))?\/(.+)$/.exec(
						resolved
					)!;

				const pkg = await fetch_package(
					name,
					name === 'svelte' ? svelte_version : v
				);

				const file = pkg.contents[subpath];
				if (file) return file.text;
			}

			const response = await fetch(resolved);
			if (response.ok) return response.text();

			throw new Error(`Could not load ${resolved}`);
		},
		transform(code, id) {
			if (uid !== current_id) throw ABORT;

			const name = id.replace(VIRTUAL + '/', '').replace(NPM + '/', '');

			self.postMessage({ type: 'status', uid, message: `bundling ${name}` });

			let result: CompileResult;

			if (is_component(id)) {
				const compiler_options: any = {
					filename: name,
					generate: 'client',
					dev: true,
					fragments: options.fragments,
				};

				if (can_use_experimental_async) {
					compiler_options.experimental = { async: true };
				}

				if (compiler_options.fragments == null) {
					// older compilers reject the option entirely
					delete compiler_options.fragments;
				}

				result = svelte.compile(code, compiler_options);

				if (result.css?.code) {
					// local images in css are inlined since there is no server to fetch them from
					result.css.code = result.css.code.replace(
						/url\(['"]?\.\/(.+?\.(svg|webp|png))['"]?\)/g,
						(match, $1, $2) => {
							if (virtual.has($1)) {
								if ($2 === 'svg') {
									return `url('data:image/svg+xml;base64,${btoa(virtual.get($1)!.contents)}')`;
								} else {
									return `url('data:image/${$2};base64,${virtual.get($1)!.contents}')`;
								}
							} else {
								return match;
							}
						}
					);

					const style_id = 'svelte-' + name.replace(/[^a-zA-Z0-9.-]/g, '_');
					result.js.code +=
						'\n\n' +
						`
							import { styles as $$_styles } from '${VIRTUAL}/${STYLES}';
							const $$__style = document.createElement('style');
							$$__style.id = ${JSON.stringify(style_id)};
							$$__style.textContent = ${JSON.stringify(result.css.code)};
							document.head.append($$__style);
							$$_styles.push($$__style);
						`.replace(/\t/g, '');
				}
			} else if (/\.svelte\.(js|ts)$/.test(id)) {
				const compiler_options: any = {
					filename: name,
					generate: 'client',
					dev: true,
				};

				if (can_use_experimental_async) {
					compiler_options.experimental = { async: true };
				}

				result = svelte.compileModule(code, compiler_options);
			} else {
				return null;
			}

			for (const warning of result.warnings) {
				// postMessage cannot clone functions
				// @ts-expect-error
				delete warning.toString;
				warnings.push(warning as unknown as Warning);
			}

			const transform_result: TransformResult = {
				code: result.js.code,
				map: result.js.map,
			};

			return transform_result;
		},
	};

	const handled_css_ids = new Set<string>();
	let user_css = '';

	const bundle = await rollup({
		input: './__entry.js',
		plugins: [
			mdsvex_plugin,
			typescript_strip_types,
			repl_plugin,
			commonjs,
			json,
			svg,
			image,
			loop_protect,
			replace({
				'process.env.NODE_ENV': JSON.stringify('production'),
			}),
			{
				name: 'css',
				transform(code, id) {
					if (id.endsWith('.css')) {
						if (!handled_css_ids.has(id)) {
							handled_css_ids.add(id);
							// imports inside user css are not followed
							user_css +=
								'\n' + code.replace(/@import\s+["'][^"']+["'][^;]*;/g, '');
						}
						return { code: '', map: null };
					}
				},
			},
		],
		onwarn(warning) {
			all_warnings.push({ message: warning.message });
		},
	});

	return {
		bundle,
		css: user_css || null,
		imports: Array.from(imports),
		error: null,
		warnings,
		all_warnings,
	};
}

async function bundle(
	svelte: typeof import('svelte/compiler'),
	svelte_version: string,
	uid: number,
	files: File[],
	options: BundleOptions,
	can_use_experimental_async: boolean
): Promise<BundleResult> {
	const lookup: Map<string, File> = new Map();
	const contents = new Map<string, string>();

	for (const file of files) {
		lookup.set(file.name, file);
		contents.set(file.name, file.contents);
	}

	const add = (name: string, code: string) =>
		lookup.set(name, {
			type: 'file',
			name,
			basename: name,
			contents: code,
			text: true,
		});

	add(
		ENTRYPOINT,
		`
			import { unmount as u } from 'svelte';
			import { styles } from '${VIRTUAL}/${STYLES}';
			export { mount, untrack } from 'svelte';
			export { default as App } from '${VIRTUAL}/${WRAPPER}';
			export function unmount(component) {
				u(component);
				styles.forEach(style => style.remove());
			}
		`
	);

	const entry = JSON.stringify('./' + options.entry);
	add(
		WRAPPER,
		can_use_experimental_async
			? `
		<script>
			import App from ${entry};
		</script>

		<svelte:boundary>
			<App />

			{#snippet pending()}{/snippet}
		</svelte:boundary>
	`
			: `
		<script>
			import App from ${entry};
		</script>

		<App />
	`
	);

	add(STYLES, `export let styles = [];`);
	add(ESM_ENV, `export const BROWSER = true; export const DEV = true;`);

	try {
		const prepared = prepare(contents);
		if (prepared.error) throw prepared.error;

		const client = await get_bundle(
			svelte,
			svelte_version,
			uid,
			lookup,
			prepared,
			options,
			can_use_experimental_async
		);

		const client_result = (
			await client.bundle.generate({
				format: 'iife',
				exports: 'named',
				inlineDynamicImports: true,
			})
		).output[0];

		return {
			uid,
			error: null,
			client: client_result,
			server: null,
			css: client.css,
			imports: client.imports,
		};
	} catch (err) {
		console.error(err);

		const e = err as CompileError;

		return {
			uid,
			// not every compiler error has an enumerable message
			error: { ...e, message: e.message } as BundleResult['error'],
			client: null,
			server: null,
			css: null,
			imports: [],
		};
	}
}
