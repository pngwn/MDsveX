import { describe, it, expect } from 'vitest';
import {
	PFMParser,
	WireEmitter,
	PluginDispatcher,
	SourceTextSource,
	WireTextSource,
} from '@mdsvex/parse';
import type { NodeBuffer, ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { ComponentRenderer } from '../src/component';
import { ComponentScope, CursorHTMLRenderer } from '../src/html_cursor';

const NONE = 0xffffffff;

type Attrs = Record<string, unknown>;

/** each root heading and what follows it in a wrapper of the given type */
function sectionize(type: string, attrs?: Attrs): ParsePlugin {
	let open: { close(): void } | null = null;
	return {
		heading: {
			parse(node) {
				if (node.parent?.type !== 'root') return;
				open?.close();
				open = node.wrap_from(type, attrs && { ...attrs });
			},
		},
	};
}

function steps(): ParsePlugin {
	const open = new Map<number, { close(): void }>();
	return {
		heading: {
			parse(node) {
				const parent = node.parent;
				if (
					parent?.type !== 'directive_container' ||
					parent.attrs.name !== 'steps'
				)
					return;
				open.get(parent._index)?.close();
				open.set(
					parent._index,
					node.wrap_from('directive_container', { name: 'step' })
				);
				node.wrap_from('directive_label').close();
			},
		},
	};
}

function parse(source: string, plugins: ParsePlugin[]): NodeBuffer {
	const tree = new TreeBuilder(
		source.length,
		new PluginDispatcher(plugins, new SourceTextSource(source))
	);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

/** feeds a document in chunks and calls back with the buffer after each */
function feed(
	source: string,
	plugins: ParsePlugin[],
	chunk: number,
	wire: boolean,
	each: (buf: NodeBuffer, source: string) => void
): void {
	if (wire) {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const builder = new WireTreeBuilder(
			128,
			new PluginDispatcher(plugins, new WireTextSource([]))
		);
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			emitter.set_source(source.slice(0, i + chunk));
			parser.feed(source.slice(i, i + chunk));
			builder.apply(emitter.flush());
			each(builder.get_buffer(), '');
		}
		emitter.set_source(source);
		parser.finish();
		builder.apply(emitter.flush());
		each(builder.get_buffer(), '');
		return;
	}
	const tree = new TreeBuilder(
		source.length,
		new PluginDispatcher(plugins, new SourceTextSource(source))
	);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk) {
		parser.feed(source.slice(i, i + chunk));
		each(tree.get_buffer(), source.slice(0, i + chunk));
	}
	parser.finish();
	each(tree.get_buffer(), source);
}

interface Step {
	/** kind of each top level block and whether the renderer holds it as closed */
	blocks: string[];
	html: string;
}

/** renders after every chunk and checks each cached render against a fresh one */
function stream(
	source: string,
	plugins: ParsePlugin[],
	chunk: number,
	wire: boolean
): Step[] {
	const result: Step[] = [];
	const renderer = new CursorHTMLRenderer();
	feed(source, plugins, chunk, wire, (buf, src) => {
		renderer.update(buf, src);
		const fresh = new CursorHTMLRenderer({ cache: false });
		fresh.update(buf, src);
		expect(renderer.html, `stale after ${result.length} chunks`).toBe(
			fresh.html
		);
		const closed = (renderer as any).closed as Set<number>;
		result.push({
			blocks: renderer.blocks.map(
				(b) =>
					buf.get_node(b.idx).kind + (closed.has(b.idx) ? ':cached' : ':open')
			),
			html: renderer.html,
		});
	});
	return result;
}

const DOC = 'intro\n\n## A\n\na1\n\na2\n\n## B\n\nb1\n\n## C\n\nc1\n';

const SECTION = { tag: 'section', attributes: { title: 'a & "b" <c>' } };

describe('wrap_from: the block cache and a root level wrapper', () => {
	for (const wire of [false, true]) {
		const path = wire ? 'wire' : 'batch';
		for (const chunk of [1, 4, 9]) {
			it(`${path} fed ${chunk}: the cached render matches a fresh one at every step`, () => {
				const all = stream(DOC, [sectionize('html', SECTION)], chunk, wire);
				const last = all[all.length - 1];
				expect(last.blocks).toEqual([
					'paragraph:cached',
					'html:cached',
					'html:cached',
					'html:cached',
				]);
				const first_cached = all.findIndex(
					(s) => s.blocks[1] === 'html:cached'
				);
				const third_seen = all.findIndex((s) => s.blocks.length === 4);
				expect(first_cached).toBeGreaterThan(-1);
				expect(first_cached).toBeLessThanOrEqual(third_seen);
				expect(all.some((s) => s.blocks[1] === 'html:open')).toBe(true);
				expect(last.html).toBe(
					'<p>intro</p>' +
						'<section title="a &amp; &quot;b&quot; &lt;c&gt;"><h2>A</h2><p>a1</p><p>a2</p></section>' +
						'<section title="a &amp; &quot;b&quot; &lt;c&gt;"><h2>B</h2><p>b1</p></section>' +
						'<section title="a &amp; &quot;b&quot; &lt;c&gt;"><h2>C</h2><p>c1</p></section>'
				);
			});
		}

		it(`${path}: a block_quote and a directive_container wrapper are cached too`, () => {
			const cases: [string, Attrs | undefined][] = [
				['block_quote', undefined],
				['directive_container', { name: 'step' }],
			];
			for (const [type, attrs] of cases) {
				const all = stream(DOC, [sectionize(type, attrs)], 4, wire);
				expect(all[all.length - 1].blocks).toEqual([
					'paragraph:cached',
					`${type}:cached`,
					`${type}:cached`,
					`${type}:cached`,
				]);
			}
		});

		it(`${path}: a wrapper closed in its own handler is cached once its heading closes`, () => {
			const alone: ParsePlugin = {
				heading: {
					parse(node) {
						node.wrap_from('block_quote').close();
					},
				},
			};
			const all = stream('## A *b*\n\ntext\n\n## C\n', [alone], 1, wire);
			expect(all[all.length - 1].blocks).toEqual([
				'block_quote:cached',
				'paragraph:cached',
				'block_quote:cached',
			]);
			expect(all[3].blocks).toEqual(['block_quote:open']);
		});

		it(`${path}: the component renderer freezes a closed wrapper`, () => {
			const renderer = new ComponentRenderer();
			const versions: number[] = [];
			feed(DOC, [sectionize('html', SECTION)], 4, wire, (buf, src) => {
				renderer.update(buf, src);
				if (renderer.blocks.length > 1) versions.push(renderer.blocks[1].v);
			});
			const frozen = versions[versions.length - 1];
			expect(frozen).toBeGreaterThan(0);
			expect(versions.slice(-4)).toEqual([frozen, frozen, frozen, frozen]);
			const buf = renderer.buf!;
			for (const block of renderer.blocks) {
				expect(buf.end_at(block.idx)).not.toBe(NONE);
			}
		});
	}

	it('the attributes of a wrapper are escaped the same open and closed', () => {
		for (const wire of [false, true]) {
			const tags = new Set<string>();
			for (const s of stream(DOC, [sectionize('html', SECTION)], 4, wire)) {
				for (const m of s.html.matchAll(/<section[^>]*>/g)) tags.add(m[0]);
			}
			expect([...tags]).toEqual([
				'<section title="a &amp; &quot;b&quot; &lt;c&gt;">',
			]);
		}
	});
});

describe('wrap_from: the steps tree through a directive scope', () => {
	const source =
		':::steps[]\nintro\n\n## One\n\nfirst\n\n## Two\n\nsecond\n:::\n';
	const scope = new ComponentScope(
		[{ specifier: './steps.js', names: ['steps', 'step'] }],
		'_d'
	);

	it('every walk renders each heading in the label snippet of its step', () => {
		const walks: string[] = [];
		const make = () => {
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.directives = scope;
			renderer.strict_directives = true;
			return renderer;
		};
		const folded = make();
		const mapped = make();
		const fused = make();
		const traced = make();
		folded.update(parse(source, [steps()]), source);
		mapped.update_mapped(parse(source, [steps()]), source);
		fused.update_v3(parse(source, [steps()]), source, source);
		traced.update_trace(parse(source, [steps()]), source);
		walks.push(folded.html, mapped.html, fused.html, traced.html);
		for (const html of walks) expect(html).toBe(walks[0]);
		expect(walks[0].replace(/^<script>[^]*?<\/script>/, '')).toBe(
			'<Steps_MDSVEX__d>\n<p>intro</p>' +
				'<Step_MDSVEX__d>{#snippet label()}<h2>One</h2>{/snippet}\n<p>first</p>\n</Step_MDSVEX__d>' +
				'<Step_MDSVEX__d>{#snippet label()}<h2>Two</h2>{/snippet}\n<p>second</p>\n</Step_MDSVEX__d>' +
				'\n</Steps_MDSVEX__d>'
		);
	});

	it('the wrappers render the same streamed and whole', () => {
		const whole = new CursorHTMLRenderer({ cache: false });
		whole.directives = scope;
		whole.update(parse(source, [steps()]), source);
		for (const chunk of [1, 5]) {
			let buf: NodeBuffer | null = null;
			feed(source, [steps()], chunk, false, (b) => {
				buf = b;
			});
			const streamed = new CursorHTMLRenderer({ cache: false });
			streamed.directives = scope;
			streamed.update(buf!, source);
			expect(streamed.html).toBe(whole.html);
		}
	});

	it('a step has no source of its own, an error for it points at its heading', () => {
		const strict = new CursorHTMLRenderer({ cache: false });
		strict.directives = new ComponentScope(
			[{ specifier: './steps.js', names: ['steps'] }],
			'_d'
		);
		strict.strict_directives = true;
		let error: any = null;
		try {
			strict.update(parse(source, [steps()]), source);
		} catch (e) {
			error = e;
		}
		expect(error).not.toBe(null);
		expect(String(error.message)).toContain('step');
		expect(error.start).toBe(source.indexOf('## One'));
	});
});

describe('the synthetic flag in the renderer', () => {
	const made = (attrs: Attrs): ParsePlugin => ({
		heading: {
			parse(node) {
				node.append('html', attrs);
			},
		},
	});

	it('a self closing element a plugin made is built from its attrs, not sliced from the source', () => {
		const source = '# title\n';
		const plugin = made({
			tag: 'img',
			self_closing: true,
			attributes: { alt: 'a & b' },
		});
		const walks: string[] = [];
		const folded = new CursorHTMLRenderer({ cache: false });
		const mapped = new CursorHTMLRenderer({ cache: false });
		const traced = new CursorHTMLRenderer({ cache: false });
		const cached = new CursorHTMLRenderer();
		folded.update(parse(source, [plugin]), source);
		mapped.update_mapped(parse(source, [plugin]), source);
		traced.update_trace(parse(source, [plugin]), source);
		cached.update(parse(source, [plugin]), source);
		walks.push(folded.html, mapped.html, traced.html, cached.html);
		for (const html of walks) {
			expect(html).toBe('<h1><img alt="a &amp; b" />title</h1>');
		}
	});

	it('an element the author typed keeps its attribute text while it is still open', () => {
		const source = '<div title="a &amp; b">\n\ntext\n\n</div>\n';
		const seen = new Set<string>();
		for (const s of stream(source, [], 6, false)) {
			for (const m of s.html.matchAll(/<div[^>]*>/g)) seen.add(m[0]);
		}
		expect([...seen]).toEqual(['<div title="a &amp; b">']);
	});

	it('a plugin made element is replaced by a component, a typed one is not', () => {
		const source = '# title\n\n<span>typed</span>\n';
		const plugin = made({ tag: 'span' });
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.scope = new ComponentScope(
			[{ specifier: './c.js', names: ['span'] }],
			'_c'
		);
		renderer.update(parse(source, [plugin]), source);
		const body = renderer.html.replace(/^<script>[^]*?<\/script>/, '');
		expect(body).toContain('<h1><Span_MDSVEX__c></Span_MDSVEX__c>title</h1>');
		expect(body).toContain('<span>typed</span>');
	});
});
