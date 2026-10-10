import { decode } from '@jridgewell/sourcemap-codec';
import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import {
	ComponentScope,
	CursorHTMLRenderer,
	_mapped_begin,
	_mapped_end,
	_node,
} from '../src/html_cursor';
import type { UrlLookup } from '../src/html_cursor';

function parse(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

type Setup = (renderer: CursorHTMLRenderer) => void;

/**
 * the html every walk renders, which must agree, a setup adds a scope or a
 * template, which the cached and unfolded walks do not take
 */
function every_walk(
	source: string,
	urls: UrlLookup | null,
	setup?: Setup
): string {
	const folded = new CursorHTMLRenderer({ cache: false });
	const mapped = new CursorHTMLRenderer({ cache: false });
	const fused = new CursorHTMLRenderer({ cache: false });
	const traced = new CursorHTMLRenderer({ cache: false });
	for (const renderer of [folded, mapped, fused, traced]) {
		if (urls) renderer.urls = urls;
		setup?.(renderer);
	}
	folded.update(parse(source), source);
	mapped.update_mapped(parse(source), source);
	fused.update_v3(parse(source), source, source);
	traced.update_trace(parse(source), source);
	const walks = [folded.html, mapped.html, fused.html, traced.html];
	if (!setup) {
		const cached = new CursorHTMLRenderer();
		if (urls) cached.urls = urls;
		cached.update(parse(source), source);
		walks.push(cached.html);
		const buf = parse(source);
		_mapped_begin(buf, source, '', urls);
		_node(new Cursor(buf, source));
		walks.push(_mapped_end());
	}
	for (const html of walks) expect(html).toBe(walks[0]);
	return walks[0];
}

const DOC =
	'[doc](./other.md "T") and ![alt *x*](./a.png "I") and [out](https://x.dev/?a=1&b=2)\n';
const PLAIN =
	'<p><a href="./other.md" title="T">doc</a> and ' +
	'<img src="./a.png" alt="alt x" title="I" /> and ' +
	'<a href="https://x.dev/?a=1&amp;b=2">out</a></p>';

/** routes for .md links, an import binding for relative images, the rest stays */
const swap: UrlLookup = (url, image) => {
	if (image)
		return url.startsWith('./')
			? { type: 'expression', value: '__img_0' }
			: null;
	if (url.endsWith('.md')) return '/docs/' + url.slice(2, -3);
	return undefined;
};
const SWAPPED =
	'<p><a href="/docs/other" title="T">doc</a> and ' +
	'<img src={__img_0} alt="alt x" title="I" /> and ' +
	'<a href="https://x.dev/?a=1&amp;b=2">out</a></p>';

describe('url sources', () => {
	it('no lookup renders the urls of the source', () => {
		expect(every_walk(DOC, null)).toBe(PLAIN);
	});

	it('a lookup that keeps every url changes nothing', () => {
		expect(every_walk(DOC, () => null)).toBe(PLAIN);
		expect(every_walk(DOC, () => undefined)).toBe(PLAIN);
		expect(every_walk(DOC, (url) => url)).toBe(PLAIN);
	});

	it('a string replaces the url and an expression goes in braces', () => {
		expect(every_walk(DOC, swap)).toBe(SWAPPED);
	});

	it('a link takes an expression and an image a string', () => {
		expect(
			every_walk('[a](/x) ![b](y.png)\n', (url, image) =>
				image
					? '/static/' + url
					: { type: 'expression', value: "base + '" + url + "'" }
			)
		).toBe(
			'<p><a href={base + \'/x\'}>a</a> <img src="/static/y.png" alt="b" /></p>'
		);
	});

	it('a string is escaped as a url of the source is', () => {
		expect(
			every_walk('[a](x) [b](y)\n', (url) =>
				url === 'x' ? '/q?a=1&b="2"&amp;<c>' : '/&copy;'
			)
		).toBe(
			'<p><a href="/q?a=1&amp;b=&quot;2&quot;&amp;&lt;c&gt;">a</a> <a href="/&copy;">b</a></p>'
		);
	});

	it('an empty string leaves the attribute out, as an empty url does', () => {
		expect(every_walk('[a]() ![b]()\n', null)).toBe(
			'<p><a>a</a> <img alt="b" /></p>'
		);
		expect(every_walk('[a](x "t") ![b](y)\n', () => '')).toBe(
			'<p><a title="t">a</a> <img alt="b" /></p>'
		);
	});

	it('the lookup gets each url once, never an empty one or a typed href', () => {
		const source =
			'[a](./one.md) ![b](./two.png) [c]() <https://x.dev> ![e](./two.png)\n\n' +
			'<a href="./typed.md">typed</a>\n';
		const walks: [string, boolean][][] = [];
		const seen = (calls: [string, boolean][]): UrlLookup => {
			walks.push(calls);
			return (url, image) => void calls.push([url, image]);
		};
		const folded = new CursorHTMLRenderer({ cache: false });
		folded.urls = seen([]);
		folded.update(parse(source), source);
		const mapped = new CursorHTMLRenderer({ cache: false });
		mapped.urls = seen([]);
		mapped.update_mapped(parse(source), source);
		const traced = new CursorHTMLRenderer({ cache: false });
		traced.urls = seen([]);
		traced.update_trace(parse(source), source);
		for (const calls of walks) {
			expect(calls).toEqual([
				['./one.md', false],
				['./two.png', true],
				['https://x.dev', false],
				['./two.png', true],
			]);
		}
		expect(folded.html).toBe(mapped.html);
		expect(folded.html).toBe(traced.html);
	});
});

describe('url sources and replacements', () => {
	const scope = new ComponentScope(
		[{ specifier: 'm', names: ['a', 'img'] }],
		'G'
	);
	const replaced: Setup = (r) => (r.scope = scope);
	const IMPORT =
		"<script>\nimport { a as A_MDSVEX_G, img as Img_MDSVEX_G } from 'm';\n</script>";

	it('a replaced a and img keep the urls of the source without a lookup', () => {
		expect(every_walk(DOC, null, replaced)).toBe(
			IMPORT +
				'<p><A_MDSVEX_G href="./other.md" title="T">doc</A_MDSVEX_G> and ' +
				'<Img_MDSVEX_G src="./a.png" alt="alt x" title="I" /> and ' +
				'<A_MDSVEX_G href="https://x.dev/?a=1&amp;b=2">out</A_MDSVEX_G></p>'
		);
	});

	it('a replaced a and img take a string or an expression as the prop', () => {
		expect(every_walk(DOC, swap, replaced)).toBe(
			IMPORT +
				'<p><A_MDSVEX_G href="/docs/other" title="T">doc</A_MDSVEX_G> and ' +
				'<Img_MDSVEX_G src={__img_0} alt="alt x" title="I" /> and ' +
				'<A_MDSVEX_G href="https://x.dev/?a=1&amp;b=2">out</A_MDSVEX_G></p>'
		);
		expect(
			every_walk(
				'[a](/x)\n',
				() => ({ type: 'expression', value: "base + '/x'" }),
				replaced
			)
		).toBe(
			"<script>\nimport { a as A_MDSVEX_G } from 'm';\n</script>" +
				"<p><A_MDSVEX_G href={base + '/x'}>a</A_MDSVEX_G></p>"
		);
	});

	it('an image import joins the script through the extra imports', () => {
		const lines = ["import __img_0 from './a.png';"];
		const setup: Setup = (r) => {
			r.scope = scope;
			r.imports = lines;
		};
		expect(every_walk('![b](./a.png)\n', swap, setup)).toBe(
			"<script>\nimport { img as Img_MDSVEX_G } from 'm';\nimport __img_0 from './a.png';\n</script>" +
				'<p><Img_MDSVEX_G src={__img_0} alt="b" /></p>'
		);
		expect(
			every_walk('![b](./a.png)\n', swap, (r) => (r.imports = lines))
		).toBe(
			"<script>\nimport __img_0 from './a.png';\n</script>" +
				'<p><img src={__img_0} alt="b" /></p>'
		);
	});
});

describe('url sources in a wrapped render', () => {
	const T = 'Template_MDSVEX';
	const HEAD =
		`<script>\nimport ${T} from 'mdsvex:template/post';\n` +
		`let __mdsvex_props = $props();\n</script><${T} {...__mdsvex_props}>`;
	const wrapped: Setup = (r) => {
		r.template = { specifier: 'mdsvex:template/post', metadata: false };
	};

	it('keeps the urls of the source without a lookup', () => {
		expect(every_walk(DOC, null, wrapped)).toBe(HEAD + PLAIN + `</${T}>`);
	});

	it('replaces them with a lookup', () => {
		expect(every_walk(DOC, swap, wrapped)).toBe(HEAD + SWAPPED + `</${T}>`);
	});

	it('replaces them in a replaced a and img', () => {
		const scope = new ComponentScope(
			[{ specifier: 't', names: ['a', 'img'] }],
			'T'
		);
		const setup: Setup = (r) => {
			wrapped(r);
			r.scope = scope;
		};
		expect(every_walk('[doc](./other.md) ![b](./a.png)\n', swap, setup)).toBe(
			`<script>\nimport ${T} from 'mdsvex:template/post';\n` +
				"import { a as A_MDSVEX_T, img as Img_MDSVEX_T } from 't';\n" +
				`let __mdsvex_props = $props();\n</script><${T} {...__mdsvex_props}>` +
				'<p><A_MDSVEX_T href="/docs/other">doc</A_MDSVEX_T> ' +
				'<Img_MDSVEX_T src={__img_0} alt="b" /></p>' +
				`</${T}>`
		);
	});
});

describe('url sources state', () => {
	it('a render without a lookup follows one with it', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.urls = swap;
		renderer.update(parse(DOC), DOC);
		expect(renderer.html).toBe(SWAPPED);
		renderer.update_mapped(parse(DOC), DOC);
		expect(renderer.html).toBe(SWAPPED);
		renderer.urls = undefined;
		renderer.update_trace(parse(DOC), DOC);
		expect(renderer.html).toBe(PLAIN);
		expect(every_walk(DOC, null)).toBe(PLAIN);
	});

	it('a lookup that throws leaves none', () => {
		const boom: UrlLookup = () => {
			throw new Error('boom');
		};
		for (const walk of ['update', 'update_mapped', 'update_trace'] as const) {
			for (const template of [false, true]) {
				const renderer = new CursorHTMLRenderer({ cache: false });
				renderer.urls = boom;
				if (template) renderer.template = { specifier: 't', metadata: false };
				expect(() => renderer[walk](parse(DOC), DOC)).toThrow('boom');
			}
		}
		const cached = new CursorHTMLRenderer();
		cached.urls = boom;
		expect(() => cached.update(parse(DOC), DOC)).toThrow('boom');
		// a render of parts takes no renderer, it would read a lookup left behind
		const buf = parse(DOC);
		_mapped_begin(buf, DOC, '');
		_node(new Cursor(buf, DOC));
		expect(_mapped_end()).toBe(PLAIN);
	});

	it('a render of parts drops its lookup when it ends', () => {
		const buf = parse(DOC);
		_mapped_begin(buf, DOC, '', swap);
		_node(new Cursor(buf, DOC));
		expect(_mapped_end()).toBe(SWAPPED);
		_mapped_begin(buf, DOC, '');
		_node(new Cursor(buf, DOC));
		expect(_mapped_end()).toBe(PLAIN);
	});

	it('release drops the lookup', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.urls = swap;
		renderer.release();
		expect(renderer.urls).toBeUndefined();
		renderer.update(parse(DOC), DOC);
		expect(renderer.html).toBe(PLAIN);
	});
});

describe('url sources and mappings', () => {
	const source = '# T\n\n' + DOC + '\nafter ![z](./a.png) *end*\n';
	const SWAPS: [string, string][] = [
		['href="./other.md"', 'href="/docs/other"'],
		['src="./a.png"', 'src={__img_0}'],
	];

	/** where an offset of the plain html lands once every attribute is swapped */
	function mover(plain: string): (at: number) => number {
		const moves: [number, number][] = [];
		for (const [from, to] of SWAPS) {
			for (
				let i = plain.indexOf(from);
				i !== -1;
				i = plain.indexOf(from, i + 1)
			)
				moves.push([i + from.length, to.length - from.length]);
		}
		return (at) => {
			let d = 0;
			for (const [end, delta] of moves) if (at >= end) d += delta;
			return at + d;
		};
	}

	function swapped(plain: string): string {
		let html = plain;
		for (const [from, to] of SWAPS) html = html.split(from).join(to);
		return html;
	}

	it('the mapped walk maps around a replaced url', () => {
		const plain = new CursorHTMLRenderer({ cache: false });
		const want = plain.update_mapped(parse(source), source).mappings;
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.urls = swap;
		const got = renderer.update_mapped(parse(source), source).mappings;
		expect(renderer.html).toBe(swapped(plain.html));
		expect(renderer.html).not.toBe(plain.html);
		const move = mover(plain.html);
		const flat = (m: (typeof got)[number], at: (g: number) => number) => {
			const g = m.generatedOffsets[0];
			const len = m.generatedLengths?.[0] ?? m.lengths[0];
			return [m.sourceOffsets[0], m.lengths[0], at(g), at(g + len), m.data];
		};
		expect(got.length).toBe(want.length);
		expect(got.map((m) => flat(m, (g) => g))).toEqual(
			want.map((m) => flat(m, move))
		);
		const spans = got.map((m) => {
			const g = m.generatedOffsets[0];
			return renderer.html.slice(g, g + (m.generatedLengths?.[0] ?? 0));
		});
		expect(spans).toContain('<a href="/docs/other" title="T">doc</a>');
		expect(spans).toContain('<img src={__img_0} alt="alt x" title="I" />');
		expect(spans).toContain('<img src={__img_0} alt="z" />');
	});

	/** every segment as generated offset and source offset */
	function points(map: { mappings: string }, html: string): number[][] {
		const starts = (text: string) => {
			const at = [0];
			for (let i = 0; i < text.length; i++)
				if (text.charCodeAt(i) === 10) at.push(i + 1);
			return at;
		};
		const gen = starts(html);
		const src = starts(source);
		const out: number[][] = [];
		decode(map.mappings).forEach((line, i) => {
			for (const seg of line)
				out.push([gen[i] + seg[0], src[seg[2]!] + seg[3]!]);
		});
		return out;
	}

	it('the trace walk maps around a replaced url', () => {
		const plain = new CursorHTMLRenderer({ cache: false });
		const want = points(
			plain.update_v3(parse(source), source, source),
			plain.html
		);
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.urls = swap;
		const got = points(
			renderer.update_v3(parse(source), source, source),
			renderer.html
		);
		expect(renderer.html).toBe(swapped(plain.html));
		const move = mover(plain.html);
		expect(got.length).toBeGreaterThan(4);
		expect(got).toEqual(want.map(([g, s]) => [move(g), s]));
		const at = (text: string) => source.indexOf(text);
		const starts = new Map(got.map(([g, s]) => [s, renderer.html.slice(g)]));
		expect(starts.get(at('[doc]'))).toMatch(/^<a href="\/docs\/other"/);
		expect(starts.get(at('![alt'))).toMatch(
			/^<img src=\{__img_0\} alt="alt x"/
		);
		expect(starts.get(at('![z]'))).toMatch(/^<img src=\{__img_0\} alt="z"/);
		expect(starts.get(at('*end*'))).toMatch(/^<strong>end/);
	});

	it('the walks map a replaced a and img the same way', () => {
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['a', 'img'] }],
			'G'
		);
		const plain = new CursorHTMLRenderer({ cache: false });
		plain.scope = scope;
		const want = points(
			plain.update_v3(parse(source), source, source),
			plain.html
		);
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.scope = scope;
		renderer.urls = swap;
		const got = points(
			renderer.update_v3(parse(source), source, source),
			renderer.html
		);
		expect(renderer.html).toBe(swapped(plain.html));
		expect(renderer.html).toContain('<Img_MDSVEX_G src={__img_0} alt="z" />');
		const move = mover(plain.html);
		expect(got).toEqual(want.map(([g, s]) => [move(g), s]));

		const mapped_plain = new CursorHTMLRenderer({ cache: false });
		mapped_plain.scope = scope;
		const a = mapped_plain.update_mapped(parse(source), source).mappings;
		const mapped = new CursorHTMLRenderer({ cache: false });
		mapped.scope = scope;
		mapped.urls = swap;
		const b = mapped.update_mapped(parse(source), source).mappings;
		expect(mapped.html).toBe(renderer.html);
		expect(b.map((m) => [m.sourceOffsets[0], m.generatedOffsets[0]])).toEqual(
			a.map((m) => [m.sourceOffsets[0], move(m.generatedOffsets[0])])
		);
	});
});
