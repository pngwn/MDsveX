import '../polyfills';
import type { CompileResult } from 'svelte/compiler';
import type { CompilerRequest, Compiled } from '../workers';
import { load_svelte } from '../npm';
import { strip_types } from '../typescript_strip_types';
import {
	compile_markdown,
	is_markdown,
	prepare,
	type MarkdownResult,
} from '../mdsvex';
import { chain, offset_mapper } from '../sourcemap';
import { pfm_ast, type PfmNode } from '../pfm_ast';

// magic-string reads window, this must stay in this module
self.window = self;

declare var self: Window &
	typeof globalThis & { svelte: typeof import('svelte/compiler') };

const cache: Record<string, ReturnType<typeof load_svelte>> = {};

function reply(id: number, filename: string, payload: Compiled) {
	postMessage({ id, filename, payload });
}

/** compile errors and warnings cannot be cloned until their methods are gone */
function plain(e: any) {
	const copy = { ...e, message: e.message };
	delete copy.toString;
	return copy;
}

addEventListener('message', async (event: MessageEvent<CompilerRequest>) => {
	const { id, file, files, version, options } = event.data;

	cache[version] ??= load_svelte(version);
	cache[version].catch(() => {
		delete cache[version];
	});
	const { can_use_experimental_async, svelte } = await cache[version];

	const prepared = prepare(new Map(files));
	const markdown = is_markdown(file.name, prepared.config);

	if (
		!markdown &&
		!file.name.endsWith('.svelte') &&
		!/\.svelte\.(js|ts)$/.test(file.name)
	) {
		reply(id, file.name, {
			error: null,
			result: null,
			markdown: null,
			pfm: null,
		});
		return;
	}

	// built first so a failed compile still shows the tree, and a parser crash cannot hide the compile result
	let pfm: PfmNode | null = null;
	if (markdown) {
		try {
			pfm = pfm_ast(file.contents);
		} catch {}
	}

	let md: MarkdownResult | null = null;
	let to_source: ((offset: number) => number) | null = null;

	try {
		if (prepared.error) throw prepared.error;

		let source = file.contents;
		if (markdown) {
			md = compile_markdown(file.contents, file.name, prepared.options);
			source = md.code;
			to_source = offset_mapper(md.map, md.code, file.contents);
		}

		let result: CompileResult;

		if (markdown || file.name.endsWith('.svelte')) {
			const compiler_options: any = {
				generate: options.generate,
				dev: options.dev,
				filename: file.name,
				fragments: options.fragments,
				modernAst: true,
			};

			if (can_use_experimental_async) {
				compiler_options.experimental = { async: true };
			}

			if (compiler_options.fragments == null) {
				delete compiler_options.fragments;
			}

			result = svelte.compile(source, compiler_options);
		} else {
			const compiler_options: any = {
				generate: options.generate,
				dev: options.dev,
				filename: file.name,
			};

			if (can_use_experimental_async) {
				compiler_options.experimental = { async: true };
			}

			const content = file.name.endsWith('.ts') ? strip_types(source) : source;
			result = svelte.compileModule(content, compiler_options);
		}

		const warnings = result.warnings.map((w: any) => {
			const warning = plain(w);
			if (to_source && warning.start && warning.end) {
				warning.start = {
					...warning.start,
					character: to_source(warning.start.character),
				};
				warning.end = {
					...warning.end,
					character: to_source(warning.end.character),
				};
			}
			return warning;
		});

		let { js, css } = result;
		if (md) {
			// svelte defines map as a lazy getter, so chained maps go on copies
			js = { code: js.code, map: chain(js.map, md.map, file.name) };
			if (css) css = { ...css, map: chain(css.map, md.map, file.name) };
		}

		reply(id, file.name, {
			error: null,
			result: { ...result, js, css, warnings } as CompileResult,
			markdown: md,
			pfm,
		});
	} catch (error) {
		const e = plain(error);

		if (!e.position && e.loc && e.pos != null) {
			// errors from the typescript stripper carry acorn positions
			e.position = [e.pos, e.raisedAt ?? e.pos];
		}

		if (to_source && e.position) {
			e.position = [to_source(e.position[0]), to_source(e.position[1])];
		}

		reply(id, file.name, { error: e, result: null, markdown: md, pfm });
	}
});
