import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, NodeKind } from '../src/main';
import type { ParsePlugin } from '../src/plugin_types';
import { PluginDispatcher } from '../src/plugin_dispatch';
import { WireTextSource } from '../src/node_view';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { NodeBuffer, kind_to_string } from '../src/utils';

/** the batches of a document fed a character at a time, without the finish when cut short */
function batches_of(source: string, finish = true): unknown[][][] {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();
	const out: unknown[][][] = [];
	let fed = '';
	for (let i = 0; i < source.length; i++) {
		fed += source[i];
		emitter.set_source(fed);
		parser.feed(source[i]);
		out.push(emitter.flush());
	}
	if (finish) {
		emitter.set_source(fed);
		parser.finish();
		out.push(emitter.flush());
	}
	return out;
}

function apply(builder: WireTreeBuilder, source: string, finish = true): void {
	for (const batch of batches_of(source, finish)) builder.apply(batch);
}

/** the tree under a node as nested kind names, text nodes as their string */
function outline(buf: NodeBuffer, idx: number): string {
	if (buf.kind_at(idx) === NodeKind.text)
		return JSON.stringify(buf._strings[idx]);
	const name = kind_to_string(buf.kind_at(idx));
	const children = buf.get_node(idx).children;
	if (children.length === 0) return name;
	return `${name}(${children.map((c) => outline(buf, c)).join(' ')})`;
}

function paragraphs(buf: NodeBuffer): string[] {
	return buf
		.get_node(0)
		.children.filter((i) => buf.kind_at(i) === NodeKind.paragraph)
		.map((i) => outline(buf, i));
}

describe('WireTreeBuilder reset', () => {
	it('builds the next document in strings of its own', () => {
		const builder = new WireTreeBuilder();
		apply(builder, 'first *one*\n');
		const first = builder.get_buffer();

		builder.reset();
		apply(builder, 'second\n');
		const second = builder.get_buffer();

		expect(paragraphs(second)).toEqual(['paragraph("second")']);
		expect(paragraphs(first)).toEqual([
			'paragraph("first " strong_emphasis("one"))',
		]);
		const untouched = new NodeBuffer();
		expect(untouched._strings).not.toBe(second._strings);
		expect(untouched._strings.length).toBe(0);
	});

	it('plugins read the text of the document after the reset', () => {
		const seen: string[] = [];
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					return () => {
						seen.push(node.text_content);
					};
				},
			},
		};
		const dispatcher = new PluginDispatcher([plugin], new WireTextSource([]));
		const builder = new WireTreeBuilder(128, dispatcher);

		apply(builder, 'first one\n');
		builder.reset();
		apply(builder, 'second\n');

		expect(seen).toEqual(['first one', 'second']);
	});

	it('plugin state of a document cut short does not reach the next', () => {
		const closed: string[] = [];
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					node.wrap_inner('link');
					return () => {
						closed.push(node.text_content);
					};
				},
			},
		};
		const dispatcher = new PluginDispatcher([plugin], new WireTextSource([]));
		const builder = new WireTreeBuilder(128, dispatcher);

		apply(builder, 'line one\nline', false);
		builder.reset();
		apply(builder, 'x `y` z\n');

		expect(paragraphs(builder.get_buffer())).toEqual([
			'paragraph(link("x " code_span " z"))',
		]);
		expect(closed).toEqual(['x y z']);
		expect(dispatcher.quiet()).toBe(true);
	});
});
