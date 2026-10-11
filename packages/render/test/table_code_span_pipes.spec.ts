import { describe, expect, it } from 'vitest';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { Cursor } from '@mdsvex/parse/cursor';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import {
	ComponentScope,
	CursorHTMLRenderer,
	_mapped_begin,
	_mapped_end,
	_node,
} from '../src/html_cursor';
import type { CodeHighlighter } from '../src/html_cursor';

const SOURCE =
	'| `a\\|b` | x |\n|---|---|\n| `c \\| d` and ``e\\|<f`` | ` g\\|h ` |\n\n`i\\|j`\n';

const HTML =
	'<table>\n<thead>\n<tr>\n<th><code>a|b</code></th>\n<th>x</th>\n</tr>\n</thead>\n' +
	'<tbody>\n<tr>\n<td><code>c | d</code> and <code>e|&lt;f</code></td>\n<td><code>g|h</code></td>\n</tr>\n</tbody>\n' +
	'</table><p><code>i\\|j</code></p>';

function parse(source: string, chunk: number) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
	return tree.get_buffer();
}

/** the tree a client builds from the wire, it has no source */
function over_wire(source: string, chunk: number) {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const builder = new WireTreeBuilder();
	parser.init();
	for (let i = 0; i < source.length; i += chunk) {
		emitter.set_source(source.slice(0, i + chunk));
		parser.feed(source.slice(i, i + chunk));
		builder.apply(emitter.flush());
	}
	emitter.set_source(source);
	parser.finish();
	builder.apply(emitter.flush());
	return builder.get_buffer();
}

/** the html every walk renders, the cached and unfolded ones only without replacements */
function every_walk(
	source: string,
	chunk: number,
	set?: (r: CursorHTMLRenderer) => void
): string {
	const walks: string[] = [];
	const folded = new CursorHTMLRenderer({ cache: false });
	const mapped = new CursorHTMLRenderer({ cache: false });
	const fused = new CursorHTMLRenderer({ cache: false });
	const traced = new CursorHTMLRenderer({ cache: false });
	if (set) for (const r of [folded, mapped, fused, traced]) set(r);
	folded.update(parse(source, chunk), source);
	mapped.update_mapped(parse(source, chunk), source);
	fused.update_v3(parse(source, chunk), source, source);
	traced.update_trace(parse(source, chunk), source);
	walks.push(folded.html, mapped.html, fused.html, traced.html);
	if (!set) {
		const cached = new CursorHTMLRenderer();
		cached.update(parse(source, chunk), source);
		walks.push(cached.html);
		const buf = parse(source, chunk);
		_mapped_begin(buf, source, '');
		_node(new Cursor(buf, source));
		walks.push(_mapped_end());
	}
	for (const html of walks) expect(html).toBe(walks[0]);
	return walks[0];
}

describe('an escaped pipe in a code span in a table cell', () => {
	it.each([0, 1, 2, 3])(
		'renders without its backslash in every walk, fed %i',
		(chunk) => {
			expect(every_walk(SOURCE, chunk)).toBe(HTML);
		}
	);

	it.each([1, 2, 3, SOURCE.length])(
		'renders the same over the wire, fed %i',
		(chunk) => {
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.update(over_wire(SOURCE, chunk), '');
			expect(renderer.html).toBe(HTML);
		}
	);

	it('a replaced code gets the code without the backslash', () => {
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['code'] }],
			'G'
		);
		const html = every_walk('|`a\\|b`|\n|-|\n|`c\\|d`|\n', 0, (r) => {
			r.scope = scope;
		});
		expect(html).toContain('<Code_MDSVEX_G>a|b</Code_MDSVEX_G>');
		expect(html).toContain('<Code_MDSVEX_G>c|d</Code_MDSVEX_G>');
	});

	it('the highlighter gets the code without the backslash', () => {
		const seen: string[] = [];
		const highlight: CodeHighlighter = {
			block: () => null,
			inline(code, lang) {
				seen.push(`${lang} ${code}`);
				return { attributes: '', body: `<i>${code}</i>` };
			},
			warn() {},
		};
		const html = every_walk(
			'|`#!ts string \\| number`|\n|-|\n|`#!ts a\\|b`|\n',
			0,
			(r) => {
				r.highlight = highlight;
			}
		);
		expect(new Set(seen)).toEqual(new Set(['ts string | number', 'ts a|b']));
		expect(html).toContain('<code><i>string | number</i></code>');
		expect(html).toContain('<code><i>a|b</i></code>');
	});

	it('maps the code to its whole source range', () => {
		const source = '|`a\\|b`|\n|-|\n';
		const renderer = new CursorHTMLRenderer({ cache: false });
		const { mappings } = renderer.update_mapped(parse(source, 0), source);
		const html = renderer.html;
		const at = html.indexOf('a|b');
		const content = mappings.filter((m) => m.generatedOffsets[0] === at);
		expect(content.length).toBe(1);
		const [m] = content;
		expect(m.generatedLengths?.[0]).toBe(3);
		expect(
			source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0])
		).toBe('a\\|b');
	});
});
