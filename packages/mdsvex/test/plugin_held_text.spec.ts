import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	WireEmitter,
	WireTextSource,
} from '@mdsvex/parse';
import type { NodeBuffer, NodeView, ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import { describe, expect, test } from 'vitest';

import { compile, compile_async } from '../src/main';
import type { Bundle, ComponentSource } from '../src/main';
import { create_highlight, load_default_languages } from '../src/highlight';

type Make = (paragraph: NodeView) => void;

/** a paragraph that a plugin adds to when it closes, by make */
function closes(make: Make): Bundle {
	return {
		name: 'closes',
		parse: { paragraph: { parse: (node) => () => make(node) } },
	};
}

/** the same, from a task that waits */
function later(make: Make): Bundle {
	return {
		name: 'later',
		parse: {
			paragraph: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (paragraph) => {
							await new Promise((done) => setTimeout(done, 1));
							make(paragraph);
						});
				},
			},
		},
	};
}

const span: Make = (paragraph) => {
	const code = paragraph.append('code_span');
	code.append('text', 'a < b');
	code.append('text', ' && {c}');
};
const hinted: Make = (paragraph) =>
	void paragraph.append('code_span', { info: 'ts' }).append('text', 'let a');
const comment: Make = (paragraph) =>
	void paragraph.append('html_comment').append('text', ' note ');

/** each node a plugin makes, the document, and the document with the node typed */
const CASES: [string, Make, string, string][] = [
	['a code span', span, 'hi\n', 'hi`a < b && {c}`\n'],
	['a code span with a hint', hinted, 'hi\n', 'hi`#!ts let a`\n'],
	['a comment', comment, 'hi\n', 'hi<!-- note -->\n'],
];

const CODE: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['code'] },
];

describe('the text a plugin puts in a node that keeps its text', () => {
	for (const [name, make, source, typed] of CASES) {
		test(`renders, ${name}`, () => {
			const { code } = compile(source, { plugins: [closes(make)] });
			expect(code).not.toMatch(/<code><\/code>|<!---->/);
			expect(code).toBe(compile(typed).code);
		});

		test(`renders with a source map, ${name}`, () => {
			const plugins = [closes(make)];
			expect(compile(source, { plugins, sourcemap: true }).code).toBe(
				compile(typed, { sourcemap: true }).code
			);
		});

		test(`goes to a code replacement, ${name}`, () => {
			const plugins = [closes(make)];
			expect(compile(source, { plugins, components: CODE }).code).toBe(
				compile(typed, { components: CODE }).code
			);
		});

		test(`from a task, ${name}`, async () => {
			const { code } = await compile_async(source, {
				plugins: [later(make)],
			});
			expect(code).toBe(compile(typed).code);
		});
	}

	test('goes through the highlighter', async () => {
		const highlight = create_highlight({
			languages: await load_default_languages(),
		});
		const { code } = compile('hi\n', {
			plugins: [closes(hinted)],
			highlight,
		});
		expect(code).toContain('<span');
		expect(code).toBe(compile('hi`#!ts let a`\n', { highlight }).code);
	});

	test('follows the text of a typed code span', () => {
		const more: Bundle = {
			name: 'more',
			parse: {
				code_span: {
					parse: (node) => () => void node.append('text', ' + b'),
				},
			},
		};
		expect(compile('`a`\n', { plugins: [more] }).code).toBe(
			compile('`a + b`\n').code
		);
	});

	test('is its text_content', () => {
		const read: string[] = [];
		compile('hi\n', {
			plugins: [
				closes((paragraph) => {
					span(paragraph);
					read.push(paragraph.last_child!.text_content);
					comment(paragraph);
					read.push(paragraph.last_child!.text_content);
				}),
			],
		});
		expect(read).toEqual(['a < b && {c}', ' note ']);
	});
});

/** builds source with the batch or the wire builder, whole or fed in chunks */
function build(
	source: string,
	wire: boolean,
	chunk: number,
	plugins: ParsePlugin[]
): { nodes: NodeBuffer; dispatcher: PluginDispatcher } {
	if (!wire) {
		const dispatcher = new PluginDispatcher(
			plugins,
			new SourceTextSource(source)
		);
		dispatcher.allow_async = true;
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		if (chunk === 0) parser.parse(source);
		else {
			parser.init();
			for (let i = 0; i < source.length; i += chunk)
				parser.feed(source.slice(i, i + chunk));
			parser.finish();
		}
		return { nodes: tree.get_buffer(), dispatcher };
	}
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const dispatcher = new PluginDispatcher(plugins, new WireTextSource([]));
	dispatcher.allow_async = true;
	const builder = new WireTreeBuilder(128, dispatcher);
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
	return { nodes: builder.get_buffer(), dispatcher };
}

/** the html of source built on a path, after its plugins settled */
async function html_of(
	source: string,
	wire: boolean,
	chunk: number,
	bundles: Bundle[]
): Promise<string> {
	const { nodes, dispatcher } = build(
		source,
		wire,
		chunk,
		bundles.map((b) => ({ ...b.parse!, name: b.name }))
	);
	dispatcher.run_sequential(nodes);
	await dispatcher.finish(nodes);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(nodes, source);
	return renderer.html;
}

describe('the text a plugin puts in a node that keeps its text, on every path a parse takes', () => {
	for (const wire of [false, true])
		for (const chunk of [0, 7, 1]) {
			const name = `${wire ? 'wire' : 'batch'}${chunk === 0 ? '' : ` fed ${chunk}`}`;
			test(name, async () => {
				for (const [how, make, source, typed] of CASES) {
					const want = await html_of(typed, wire, chunk, []);
					for (const bundle of [closes(make), later(make)])
						expect(await html_of(source, wire, chunk, [bundle]), how).toBe(
							want
						);
				}
			});
		}
});
