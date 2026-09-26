// suites, modes, and how an arm loads its build
//
// both arms load dist by absolute path into one process, each through its own workspace links, so the module graphs never touch
// the modes cover every user path, because moving work from parsing into rendering or setup is not a win

import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { corpus } from './corpus.mjs';

export const DIST_FILES = {
	parse: 'packages/parse/dist/main.js',
	tree_builder: 'packages/parse/dist/tree-builder.js',
	render: 'packages/render/dist/html_cursor.js',
	sourcemap: 'packages/render/dist/sourcemap.js',
	mdsvex: 'packages/mdsvex/dist/main.js',
};

// path filters, because the workspace root is also named mdsvex
export const BUILD_ARGS = [
	'--filter',
	'./packages/parse',
	'--filter',
	'./packages/render',
	'--filter',
	'./packages/mdsvex',
	'-r',
	'build',
];

export function missing_dist(root) {
	return Object.values(DIST_FILES)
		.map((f) => join(root, f))
		.filter((p) => !existsSync(p));
}

export async function load_arm(root, label) {
	root = realpathSync(resolve(root));
	const missing = missing_dist(root);
	if (missing.length > 0) {
		throw new Error(
			`arm "${label}" at ${root} is not built, missing:\n  ${missing.join('\n  ')}\n` +
				`run: cd ${root} && pnpm ${BUILD_ARGS.join(' ')}`
		);
	}
	const modules = {};
	for (const [key, file] of Object.entries(DIST_FILES)) {
		modules[key] = await import(pathToFileURL(join(root, file)).href);
	}
	return {
		label,
		root,
		modules,
		parse_markdown_svelte: modules.parse.parse_markdown_svelte,
		PFMParser: modules.parse.PFMParser,
		TreeBuilder: modules.tree_builder.TreeBuilder,
		CursorHTMLRenderer: modules.render.CursorHTMLRenderer,
		mappings_to_v3: modules.sourcemap.mappings_to_v3,
		compile: modules.mdsvex.compile,
		CompilerSession: modules.mdsvex.CompilerSession,
		mdsvex: modules.mdsvex.mdsvex,
	};
}

/** a candidate that dropped an entry point fails the comparison instead of shrinking it */
export function arms_comparable(a, b) {
	const problems = [];
	for (const key of Object.keys(DIST_FILES)) {
		const dropped = Object.keys(a.modules[key]).filter(
			(k) => !(k in b.modules[key])
		);
		if (dropped.length > 0) {
			problems.push(
				`${DIST_FILES[key]}: ${b.label} lacks ${dropped.join(', ')}`
			);
		}
		if (a.modules[key] === b.modules[key]) {
			problems.push(`${DIST_FILES[key]}: both arms share one module instance`);
		}
	}
	return problems;
}

export const CHUNK_SIZES = [64, 1024];

export const DOC_MODES = [
	'parse',
	'parse-direct',
	'incremental-64',
	'incremental-1024',
	'render',
	'render-mapped',
	'compile',
	'compile-mapped',
	'compile-reused',
	'compile-reused-mapped',
	'sourcemap-v3',
	'vite-transform',
];

export const SETUP_MODES = ['setup'];

export const MODES = [...DOC_MODES, ...SETUP_MODES];

// incremental names both chunk sizes on the command line
export function expand_modes(modes) {
	return modes.flatMap((m) =>
		m === 'incremental' ? CHUNK_SIZES.map((n) => `incremental-${n}`) : [m]
	);
}

// at 3.8MB 64 char feeds take about 30s a call and the v3 map about half an hour, so those run on sized only
export const HUGE_MODES = [
	'parse',
	'parse-direct',
	'incremental-1024',
	'render',
	'render-mapped',
	'compile',
	'compile-mapped',
	'compile-reused',
	'compile-reused-mapped',
];

export const SUITES = {
	// iterating, not evidence for a claim
	quick: {
		families: ['real'],
		modes: ['parse', 'render-mapped', 'vite-transform'],
	},
	// the default and what calibration measures, one mode per distinct code path, near duplicates run in full
	core: {
		families: ['micro', 'real'],
		modes: [
			'parse',
			'incremental-64',
			'render',
			'render-mapped',
			'compile-mapped',
			'sourcemap-v3',
			'vite-transform',
		],
		extra: { fixtures: ['parse'] },
		setup: true,
	},
	// everything, before proposing a merge
	full: {
		families: ['micro', 'fixtures', 'real', 'sized', 'huge'],
		modes: DOC_MODES,
		setup: true,
	},
	// how cost grows with input length
	scale: {
		families: ['sized', 'huge'],
		modes: [
			'parse',
			'incremental-64',
			'incremental-1024',
			'render-mapped',
			'compile-mapped',
			'sourcemap-v3',
			'vite-transform',
		],
	},
};

function split_chunks(src, size) {
	const out = [];
	for (let i = 0; i < src.length; i += size) out.push(src.slice(i, i + size));
	return out;
}

function capacity(src) {
	return src.length >> 3 || 128;
}

const VITE_ID = '/corpus/doc.svx';

/** one callable per mode, bound to one arm and one source */
export function make_doc_run(arm, mode, src) {
	const {
		parse_markdown_svelte,
		PFMParser,
		TreeBuilder,
		CursorHTMLRenderer,
		compile,
		CompilerSession,
		mappings_to_v3,
	} = arm;
	switch (mode) {
		case 'parse':
			return () => parse_markdown_svelte(src);
		case 'parse-direct':
			return () => {
				const tree = new TreeBuilder(capacity(src));
				new PFMParser(tree).parse(src);
				return tree;
			};
		case 'incremental-64':
		case 'incremental-1024': {
			const chunks = split_chunks(src, Number(mode.slice(12)));
			return () => {
				const tree = new TreeBuilder(capacity(src));
				const parser = new PFMParser(tree);
				parser.init();
				for (let i = 0; i < chunks.length; i++) parser.feed(chunks[i]);
				parser.finish();
				return tree;
			};
		}
		case 'render':
		case 'render-mapped': {
			const { nodes, source } = parse_markdown_svelte(src);
			return mode === 'render'
				? () => {
						const r = new CursorHTMLRenderer({ cache: false });
						r.update(nodes, source);
						return r.html;
					}
				: () =>
						new CursorHTMLRenderer({ cache: false }).update_mapped(
							nodes,
							source
						);
		}
		case 'compile':
			return () => compile(src);
		case 'compile-mapped':
			return () => compile(src, { sourcemap: true });
		case 'compile-reused': {
			const session = new CompilerSession();
			return () => session.compile(src);
		}
		case 'compile-reused-mapped': {
			const session = new CompilerSession();
			return () => session.compile(src, { sourcemap: true });
		}
		case 'sourcemap-v3': {
			const { code, mappings } = compile(src, { sourcemap: true });
			return () => mappings_to_v3(mappings, src, code, VITE_ID);
		}
		case 'vite-transform': {
			// the pre transform vite calls per svx file, the post transform needs a live svelte compile
			const [pre] = arm.mdsvex();
			return () => pre.transform(src, VITE_ID);
		}
		default:
			throw new Error(`unknown mode "${mode}"`);
	}
}

export function make_setup_runs(arm) {
	const { PFMParser, TreeBuilder, CursorHTMLRenderer, CompilerSession } = arm;
	return {
		parser: () => new PFMParser(new TreeBuilder(128)),
		renderer: () => new CursorHTMLRenderer({ cache: false }),
		session: () => new CompilerSession(),
		plugin: () => arm.mdsvex(),
	};
}

/** workload ids, families, modes and sources with no arm bound, both arms instantiate the same plan */
export function plan_workloads(suite_name = 'core', filter = {}) {
	const suite = SUITES[suite_name];
	if (!suite) {
		throw new Error(
			`unknown suite "${suite_name}" (have: ${Object.keys(SUITES).join(', ')})`
		);
	}
	const mode_filter = filter.modes ? expand_modes(filter.modes) : null;
	const family_filter = filter.families ?? null;
	const keep_mode = (m) => mode_filter === null || mode_filter.includes(m);
	const keep_family = (f) =>
		family_filter === null || family_filter.includes(f);

	const plan = [];
	const groups = suite.families.map((f) => [f, suite.modes]);
	for (const [f, m] of Object.entries(suite.extra ?? {})) {
		if (!suite.families.includes(f)) groups.push([f, m]);
	}
	for (const [family, modes] of groups) {
		if (!keep_family(family)) continue;
		for (const entry of corpus({ families: [family] })) {
			for (const mode of modes) {
				if (!keep_mode(mode)) continue;
				if (family === 'huge' && !HUGE_MODES.includes(mode)) continue;
				plan.push({
					id: `${entry.id}:${mode}`,
					family,
					doc: entry.stem,
					mode,
					bytes: entry.bytes,
					entry,
				});
			}
		}
	}
	if (suite.setup && keep_family('setup') && keep_mode('setup')) {
		for (const what of ['parser', 'renderer', 'session', 'plugin']) {
			plan.push({
				id: `setup/${what}:setup`,
				family: 'setup',
				doc: what,
				mode: 'setup',
				bytes: 0,
			});
		}
	}
	return plan;
}

/** binds each workload just before it is measured, alternating which arm is built first, so no heap state accumulates across workloads */
export function bind_workloads(plan, a, b) {
	return plan.map((w, i) => ({
		...w,
		bind() {
			const b_first = i % 2 === 1;
			const make = (arm) =>
				w.mode === 'setup'
					? make_setup_runs(arm)[w.doc]
					: make_doc_run(arm, w.mode, w.entry.source);
			if (b_first) {
				const run_b = make(b);
				return { a: make(a), b: run_b };
			}
			const run_a = make(a);
			return { a: run_a, b: make(b) };
		},
	}));
}
