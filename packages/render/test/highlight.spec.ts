import { describe, expect, it } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { ComponentScope, CursorHTMLRenderer } from '../src/html_cursor';
import type {
	CodeHighlighter,
	HighlightedBlock,
	HighlightWarningCode,
} from '../src/html_cursor';

/** a highlighter that shows what it was asked, braces as entities */
function stub(): CodeHighlighter & {
	calls: string[];
	warned: [HighlightWarningCode, number][];
} {
	const esc = (s: string) =>
		s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/{/g, '&#123;')
			.replace(/}/g, '&#125;');
	return {
		calls: [],
		warned: [],
		block(code, lang, meta, start): HighlightedBlock | null {
			this.calls.push(`block ${lang}|${meta}|${start}`);
			if (lang === 'plain') return null;
			if (lang === 'wrap')
				return {
					before: '',
					attributes: null,
					body: `<div>${esc(code)}</div>`,
					after: '',
					props: '',
					code,
					code_template: null,
					live: null,
					dropped: null,
				};
			if (lang === 'live') {
				// the first {...} of the code stays live
				const at = code.indexOf('{');
				const end = code.indexOf('}', at) + 1;
				const head = '<code>' + esc(code.slice(0, at));
				return {
					before: '',
					attributes: '',
					body: head + code.slice(at, end) + esc(code.slice(end)) + '</code>',
					after: '',
					props: '',
					code,
					code_template: '`live`',
					live: [head.length, at, end - at],
					dropped: null,
				};
			}
			return {
				before: '<figure>',
				attributes: ` class="hl ${lang}"`,
				body: `<code>${esc(code)}</code>`,
				after: '</figure>',
				props: ' title={"t"}',
				code: code.toUpperCase(),
				code_template: null,
				live: null,
				dropped: meta.includes('drop') ? ['dropped one'] : null,
			};
		},
		inline(code, lang, start) {
			this.calls.push(`inline ${lang}|${start}`);
			if (lang === 'plain') return null;
			if (lang === 'wrap')
				return { attributes: null, body: `<b>${esc(code)}</b>` };
			return { attributes: ` class="i ${lang}"`, body: esc(code) };
		},
		warn(code, _message, start) {
			this.warned.push([code, start]);
		},
	};
}

type Walk = (r: CursorHTMLRenderer, buf: any, src: string) => void;
const WALKS: [string, Walk, boolean][] = [
	['fold', (r, buf, src) => r.update(buf, src), false],
	['cached', (r, buf, src) => r.update(buf, src), true],
	['mapped', (r, buf, src) => r.update_mapped(buf, src), false],
	['trace', (r, buf, src) => r.update_trace(buf, src), false],
	['v3', (r, buf, src) => r.update_v3(buf, src, src), false],
];

function render_all(
	source: string,
	highlight: CodeHighlighter,
	scope?: ComponentScope
): string {
	const outs: string[] = [];
	for (const [name, walk, cache] of WALKS) {
		// the cached render ignores replacements
		if (cache && scope) continue;
		const tree = new TreeBuilder(128);
		new PFMParser(tree).parse(source);
		const r = new CursorHTMLRenderer({ cache });
		r.highlight = highlight;
		if (scope) r.scope = scope;
		walk(r, tree.get_buffer(), source);
		outs.push(r.html);
		expect(r.highlight, name).toBe(highlight);
	}
	for (const out of outs) expect(out).toBe(outs[0]);
	return outs[0];
}

describe('highlighting', () => {
	it('a fence renders as the highlighter has it, in every walk', () => {
		const h = stub();
		expect(render_all('```ts a {1}\nx {y}\n```\n', h)).toBe(
			'<figure><pre class="hl ts"><code>x &#123;y&#125;</code></pre></figure>'
		);
		expect(new Set(h.calls)).toEqual(new Set(['block ts|a {1}|0']));
	});

	it('a fence with no info has no language', () => {
		const h = stub();
		render_all('a\n\n```\nx\n```\n', h);
		expect(new Set(h.calls)).toEqual(new Set(['block ||3']));
	});

	it('null renders plain', () => {
		expect(render_all('```plain x\n{a}\n```\n\n`#!plain b`\n', stub())).toBe(
			'<pre><code class="language-plain">&#123;a&#125;</code></pre><p><code>b</code></p>'
		);
	});

	it('a block that is not one pre renders its body alone', () => {
		expect(render_all('```wrap\na\n```\n', stub())).toBe('<div>a</div>');
	});

	it('a code span with a #! hint highlights, one without does not', () => {
		const h = stub();
		expect(render_all('`#!ts {a}` `{b}` `#!wrap c`\n', h)).toBe(
			'<p><code class="i ts">&#123;a&#125;</code> <code>&#123;b&#125;</code> <b>c</b></p>'
		);
		expect(new Set(h.calls)).toEqual(
			new Set(['inline ts|0', 'inline wrap|17'])
		);
	});

	it('a code span hint keeps its newlines as spaces', () => {
		expect(render_all('`#!ts a\nb`\n', stub())).toBe(
			'<p><code class="i ts">a b</code></p>'
		);
	});

	it('a pre replacement gets the props and the <pre> as children, no figure', () => {
		const h = stub();
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['pre', 'code'] }],
			'G'
		);
		expect(
			render_all(
				'```ts title="t" drop\na\n```\n\n```wrap\nb\n```\n\n`#!ts c`\n',
				h,
				scope
			)
		).toBe(
			"<script>\nimport { pre as Pre_MDSVEX_G, code as Code_MDSVEX_G } from 'm';\n</script>" +
				'<Pre_MDSVEX_G lang={"ts"} meta={"title=\\"t\\" drop"} title={"t"} code={"A"}><pre class="hl ts"><code>a</code></pre></Pre_MDSVEX_G>' +
				'<Pre_MDSVEX_G lang={"wrap"} code={"b"}><div>b</div></Pre_MDSVEX_G>' +
				'<p><Code_MDSVEX_G lang={"ts"} class="i ts">c</Code_MDSVEX_G></p>'
		);
		expect(h.warned.every(([code]) => code === 'meta_prop_ignored')).toBe(true);
		expect(h.warned.length).toBeGreaterThan(0);
	});

	it('a code replacement warns when the span is not one <code>', () => {
		const h = stub();
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['code'] }],
			'G'
		);
		expect(render_all('`#!wrap a`\n', h, scope)).toContain('<p><b>a</b></p>');
		expect(new Set(h.warned.map(([c]) => c))).toEqual(
			new Set(['code_replacement_skipped'])
		);
	});

	it('the fence body maps as one code content record', () => {
		const source = '```ts\nlet a\n```\n';
		const tree = new TreeBuilder(128);
		new PFMParser(tree).parse(source);
		const r = new CursorHTMLRenderer({ cache: false });
		r.highlight = stub();
		const { mappings } = r.update_mapped(tree.get_buffer(), source);
		const content = mappings.filter((m) => m.data.role === 'content');
		expect(content).toHaveLength(1);
		const [m] = content;
		expect(
			source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0])
		).toBe('let a');
		expect(
			r.html.slice(
				m.generatedOffsets[0],
				m.generatedOffsets[0] + m.generatedLengths![0]
			)
		).toBe('<code>let a</code>');
	});

	it('a live expression maps one to one as svelte content in every walk', () => {
		const source = '> ```live\n> a {b.c} d\n> ```\n';
		const scope = new ComponentScope([{ specifier: 'm', names: ['pre'] }], 'G');
		expect(render_all(source, stub())).toContain(
			'<pre><code>a {b.c} d</code></pre>'
		);
		expect(render_all(source, stub(), scope)).toContain(
			'<Pre_MDSVEX_G lang={"live"} code={`live`}><pre><code>a {b.c} d</code></pre></Pre_MDSVEX_G>'
		);
		for (const s of [null, scope]) {
			const tree = new TreeBuilder(128);
			new PFMParser(tree).parse(source);
			const r = new CursorHTMLRenderer({ cache: false });
			r.highlight = stub();
			if (s) r.scope = s;
			const { mappings } = r.update_mapped(tree.get_buffer(), source);
			const content = mappings
				.filter((m) => m.data.role === 'content')
				.map((m) => [
					source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]),
					r.html.slice(
						m.generatedOffsets[0],
						m.generatedOffsets[0] + (m.generatedLengths?.[0] ?? m.lengths[0])
					),
					m.data.verification === true,
				]);
			expect(content).toEqual([
				['> a ', '<code>a ', false],
				['{b.c}', '{b.c}', true],
				[' d', ' d</code>', false],
			]);
		}
	});
});
