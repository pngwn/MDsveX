import { expect } from 'vitest';

import { PFMParser, WireEmitter } from '../src/main';
import type { HeadingIds } from '../src/heading_ids';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { Emitter } from '../src/opcodes';
import type {
	DataChange,
	DirectiveTable,
	ParsePlugin,
	PluginDocument,
} from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer, NodeKind } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';

const NONE = 0xffffffff;

export interface ShapeOptions {
	/** attrs to print after the kind, a missing one prints nothing */
	attrs?: readonly string[];
	/** joins neighbouring text, the two builders split text around a revoke differently */
	merge_text?: boolean;
}

function text_of(nodes: NodeBuffer, source: string | null, index: number) {
	// a repair stores its delimiter as a string on either builder
	const stored = nodes._strings[index];
	if (stored !== undefined || source === null) return stored;
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

/** kinds and text of a buffer, text read from the source or a wire string */
export function shape(
	nodes: NodeBuffer,
	source: string | null,
	index = 0,
	options?: ShapeOptions
): unknown {
	const node = nodes.get_node(index);
	if (node.kind === 'text') return 'text:' + text_of(nodes, source, index);
	let name: string = node.kind;
	if (options?.attrs !== undefined) {
		const meta = nodes.metadata_at(index);
		for (const key of options.attrs) {
			if (meta && key in meta) name += ` ${key}=${JSON.stringify(meta[key])}`;
		}
	}
	const kids: unknown[] = [];
	for (const c of node.children) {
		if (nodes.get_node(c).kind === 'line_break') continue;
		const kid = shape(nodes, source, c, options);
		const last = kids[kids.length - 1];
		if (
			options?.merge_text &&
			typeof kid === 'string' &&
			typeof last === 'string' &&
			kid.startsWith('text:') &&
			last.startsWith('text:')
		) {
			kids[kids.length - 1] = last + kid.slice(5);
		} else kids.push(kid);
	}
	return kids.length === 0 ? name : [name, ...kids];
}

/** every child list is a doubly linked chain that ends at last_child */
export function expect_linked(nodes: NodeBuffer, index = 0): void {
	let prev = NONE;
	let child = nodes.first_child_at(index);
	while (child !== NONE && nodes.parent_at(child) === index) {
		expect(nodes.prev_at(child), `prev of ${child} under ${index}`).toBe(prev);
		expect_linked(nodes, child);
		prev = child;
		child = nodes.next_at(child);
	}
	expect(child, `chain under ${index} runs into another parent`).toBe(NONE);
	expect(nodes.last_child_at(index), `last child of ${index}`).toBe(prev);
}

export interface PluginRun {
	nodes: NodeBuffer;
	/** null over the wire, text is in the buffer strings */
	source: string | null;
	dispatcher: PluginDispatcher | null;
}

/** global plugins and handlers bound to directive names */
export interface PluginSetup {
	plugins?: ParsePlugin[];
	directive_handlers?: DirectiveTable[];
	/** what the handlers learn about the document through their context */
	document?: PluginDocument;
	/** follows the changes to the data of plugins */
	on_data?: (change: DataChange) => void;
	/** called with the dispatcher before the parse */
	setup?: (dispatcher: PluginDispatcher) => void;
	/** makes heading ids at each close, finished when the document ends */
	headings?: HeadingIds;
}

/** a plain array is the global plugins alone */
export type Plugins = ParsePlugin[] | PluginSetup;

function dispatcher_for(
	setup: Plugins | undefined,
	wire: boolean,
	source: string
): PluginDispatcher | undefined {
	if (setup === undefined) return undefined;
	const plugins = Array.isArray(setup) ? setup : setup.plugins;
	const bound = Array.isArray(setup) ? undefined : setup.directive_handlers;
	if (
		(plugins === undefined || plugins.length === 0) &&
		(bound === undefined || bound.length === 0)
	)
		return undefined;
	const dispatcher = new PluginDispatcher(
		plugins,
		wire ? new WireTextSource([]) : new SourceTextSource(source),
		bound
	);
	if (!Array.isArray(setup)) {
		dispatcher.set_document(setup.document);
		if (setup.on_data !== undefined) dispatcher.on_data(setup.on_data);
		if (setup.setup !== undefined) setup.setup(dispatcher);
	}
	return dispatcher;
}

function headings_of(setup: Plugins | undefined): HeadingIds | undefined {
	return setup === undefined || Array.isArray(setup)
		? undefined
		: setup.headings;
}

/**
 * passes every opcode on, the builder behind it has no parser to follow, so
 * once a plugin pushes a node its ids miss their slots and it maps them
 */
class Relay implements Emitter {
	constructor(private out: TreeBuilder) {}
	open(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		this.out.open(id, kind, start, parent, extra, pending);
	}
	close(id: number, end: number, kind?: NodeKind): void {
		this.out.close(id, end, kind);
	}
	close_pending(id: number, end: number, kind: NodeKind): void {
		this.out.close_pending(id, end, kind);
	}
	text(parent: number, start: number, end: number, kind?: NodeKind): void {
		this.out.text(parent, start, end, kind);
	}
	leaf(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		value_start: number,
		value_end: number,
		end: number
	): void {
		this.out.leaf(id, kind, start, parent, value_start, value_end, end);
	}
	attr(id: number, key: string, value: any): void {
		this.out.attr(id, key, value);
	}
	set_value_start(id: number, pos: number): void {
		this.out.set_value_start(id, pos);
	}
	set_value_end(id: number, pos: number): void {
		this.out.set_value_end(id, pos);
	}
	revoke(id: number, source_text?: string, text_start?: number): void {
		this.out.revoke(id, source_text, text_start);
	}
	commit(id: number): void {
		this.out.commit(id);
	}
	cursor(pos: number): void {
		this.out.cursor(pos);
	}
	end(): void {
		this.out.end();
	}
}

/**
 * the batch builder, a chunk size feeds the source in pieces, relayed puts an
 * emitter between the parser and the builder
 */
export function run_batch(
	source: string,
	plugins?: Plugins,
	chunk = 0,
	relayed = false
): PluginRun {
	const dispatcher = dispatcher_for(plugins, false, source);
	const tree = new TreeBuilder(source.length || 16, dispatcher);
	const headings = headings_of(plugins);
	if (headings !== undefined) {
		headings.start(source);
		tree.set_headings(headings);
	}
	const parser = new PFMParser(relayed ? new Relay(tree) : tree);
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
	const nodes = tree.get_buffer();
	if (headings !== undefined) headings.finish(nodes);
	if (dispatcher) dispatcher.run_sequential(nodes);
	return { nodes, source, dispatcher: dispatcher ?? null };
}

/**
 * the wire builder, a chunk size feeds the source in pieces so a revoke
 * arrives after its open was built
 */
export function run_wire(
	source: string,
	plugins?: Plugins,
	chunk = 0
): PluginRun {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const dispatcher = dispatcher_for(plugins, true, source);
	const builder = new WireTreeBuilder(128, dispatcher);
	const headings = headings_of(plugins);
	if (headings !== undefined) builder.set_headings(headings);
	if (chunk === 0) {
		emitter.set_source(source);
		parser.parse(source);
	} else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			emitter.set_source(source.slice(0, i + chunk));
			parser.feed(source.slice(i, i + chunk));
			builder.apply(emitter.flush());
		}
		emitter.set_source(source);
		parser.finish();
	}
	builder.apply(emitter.flush());
	builder.end();
	const nodes = builder.get_buffer();
	if (dispatcher) dispatcher.run_sequential(nodes);
	return { nodes, source: null, dispatcher: dispatcher ?? null };
}

export type RunPath = (source: string, plugins?: Plugins) => PluginRun;

/**
 * both builders, whole and fed in chunks of 7 and 1, and the batch builder
 * with its id map, which a parser it follows never needs
 */
export const PATHS: [string, RunPath][] = [
	['batch', (s, p) => run_batch(s, p)],
	['batch fed 7', (s, p) => run_batch(s, p, 7)],
	['batch fed 1', (s, p) => run_batch(s, p, 1)],
	['batch by id map', (s, p) => run_batch(s, p, 0, true)],
	['wire', (s, p) => run_wire(s, p)],
	['wire fed 7', (s, p) => run_wire(s, p, 7)],
	['wire fed 1', (s, p) => run_wire(s, p, 1)],
];

export interface ParityOptions extends ShapeOptions {
	/** false when an undo log is known to outlive the document */
	quiet?: boolean;
}

/**
 * runs a document down every path and expects one tree, sound child lists and
 * a dispatcher with nothing left over, returns that tree
 *
 * plugins come from a function so each path gets handlers with fresh state
 */
export function expect_parity(
	source: string,
	make_plugins: () => Plugins,
	options?: ParityOptions
): unknown {
	const opts = { ...options, merge_text: true };
	let first: unknown;
	for (let i = 0; i < PATHS.length; i++) {
		const [name, run] = PATHS[i];
		const out = run(source, make_plugins());
		expect_linked(out.nodes);
		if (out.dispatcher !== null && options?.quiet !== false) {
			expect(out.dispatcher.quiet(), `${name} left plugin state`).toBe(true);
		}
		const tree = shape(out.nodes, out.source, 0, opts);
		if (i === 0) first = tree;
		else expect(tree, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first;
}

/** expect_parity for plugins that write a log, every path must write the same one */
export function expect_parity_logged(
	source: string,
	make_plugins: (log: string[]) => Plugins,
	options?: ParityOptions
): { tree: unknown; log: string[] } {
	const logs: string[][] = [];
	const tree = expect_parity(
		source,
		() => {
			const log: string[] = [];
			logs.push(log);
			return make_plugins(log);
		},
		options
	);
	for (let i = 1; i < logs.length; i++) {
		expect(logs[i], `${PATHS[i][0]} log against ${PATHS[0][0]}`).toEqual(
			logs[0]
		);
	}
	return { tree, log: logs[0] };
}
