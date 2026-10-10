import { decode } from '@jridgewell/sourcemap-codec';
import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import {
	ComponentScope,
	CursorHTMLRenderer,
	DirectiveError,
} from '../src/html_cursor';

function parse(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

type Setup = (renderer: CursorHTMLRenderer) => void;

/** the html of the fold, mapped and both trace walks, which must agree */
function every_walk(source: string, setup: Setup): string {
	const folded = new CursorHTMLRenderer({ cache: false });
	const mapped = new CursorHTMLRenderer({ cache: false });
	const fused = new CursorHTMLRenderer({ cache: false });
	const traced = new CursorHTMLRenderer({ cache: false });
	for (const renderer of [folded, mapped, fused, traced]) setup(renderer);
	folded.update(parse(source), source);
	mapped.update_mapped(parse(source), source);
	fused.update_v3(parse(source), source, source);
	traced.update_trace(parse(source), source);
	const walks = [folded.html, mapped.html, fused.html, traced.html];
	for (const html of walks) expect(html).toBe(walks[0]);
	return walks[0];
}

const A = "import a from './a.png';";
const B = "import * as b from './doc.md.snippet-1.svelte';";
const extra: Setup = (r) => (r.imports = [A, B]);
const LINES = A + '\n' + B + '\n';

const scope = new ComponentScope([{ specifier: 'm', names: ['p', 'h1'] }], 'G');
const replaced: Setup = (r) => {
	r.scope = scope;
	r.imports = [A, B];
};
const wrapped: Setup = (r) => {
	r.template = { specifier: 'mdsvex:template/post', metadata: false };
	r.imports = [A, B];
};

describe('extra imports', () => {
	it('start a script in a document with no component, script or import', () => {
		expect(every_walk('# Hi\n\ntext\n', extra)).toBe(
			'<script>\n' + LINES + '</script><h1>Hi</h1><p>text</p>'
		);
	});

	it('go into the instance script ahead of its code', () => {
		expect(
			every_walk('<script>\n  let x = 1;\n</script>\n\n# Hi\n', extra)
		).toBe('<script>\n' + LINES + '\n  let x = 1;\n</script><h1>Hi</h1>');
	});

	it('go into an instance script that comes after the markup', () => {
		expect(
			every_walk('# Hi\n\n<script>\n  let x = 1;\n</script>\n', extra)
		).toBe('<h1>Hi</h1><script>\n' + LINES + '\n  let x = 1;\n</script>');
	});

	it('follow the imports of the document in the script they start', () => {
		expect(
			every_walk("import C from './C.svelte'\n\n# Hi\n\n<C />\n", extra)
		).toBe(
			"<script>\nimport C from './C.svelte'\n" +
				LINES +
				'</script><h1>Hi</h1><C />'
		);
	});

	it('follow the imports of the document in its instance script', () => {
		expect(
			every_walk(
				"import C from './C.svelte'\n\n<script>\n  let x = 1;\n</script>\n\n<C />\n",
				extra
			)
		).toBe(
			"<script>\nimport C from './C.svelte'\n" +
				LINES +
				'\n  let x = 1;\n</script><C />'
		);
	});

	it('leave a module script alone and start an instance script', () => {
		expect(
			every_walk(
				'<script module>\n  export const m = 1;\n</script>\n\n# Hi\n',
				extra
			)
		).toBe(
			'<script>\n' +
				LINES +
				'</script><script module>\n  export const m = 1;\n</script><h1>Hi</h1>'
		);
	});

	it('follow the replacement imports', () => {
		expect(every_walk('# Hi\n\ntext\n', replaced)).toBe(
			"<script>\nimport { h1 as H1_MDSVEX_G, p as P_MDSVEX_G } from 'm';\n" +
				LINES +
				'</script><H1_MDSVEX_G level={1}>Hi</H1_MDSVEX_G><P_MDSVEX_G>text</P_MDSVEX_G>'
		);
	});

	it('follow the imports of the document and the replacement imports', () => {
		expect(
			every_walk(
				"import C from './C.svelte'\n\n<script>\n  let x = 1;\n</script>\n\ntext\n",
				replaced
			)
		).toBe(
			"<script>\nimport C from './C.svelte'\nimport { p as P_MDSVEX_G } from 'm';\n" +
				LINES +
				'\n  let x = 1;\n</script><P_MDSVEX_G>text</P_MDSVEX_G>'
		);
	});

	it('are hoisted when a scope replaces nothing in the document', () => {
		expect(every_walk('- a\n', replaced)).toBe(
			'<script>\n' + LINES + '</script><ul>\n<li>a</li>\n\n</ul>'
		);
	});

	it('an empty list changes nothing', () => {
		const none: Setup = (r) => (r.imports = []);
		expect(every_walk('# Hi\n', none)).toBe('<h1>Hi</h1>');
		expect(every_walk('# Hi\n', () => {})).toBe('<h1>Hi</h1>');
	});

	it('the cached render ignores them', () => {
		const source = '# Hi\n';
		const cached = new CursorHTMLRenderer();
		cached.imports = [A];
		cached.update(parse(source), source);
		expect(cached.html).toBe('<h1>Hi</h1>');
	});
});

describe('extra imports in a wrapped render', () => {
	const T = 'Template_MDSVEX';
	const PROPS = 'let __mdsvex_props = $props();\n';

	it('follow the template import, ahead of the props', () => {
		expect(every_walk('# Hi\n', wrapped)).toBe(
			`<script>\nimport ${T} from 'mdsvex:template/post';\n` +
				LINES +
				PROPS +
				`</script><${T} {...__mdsvex_props}><h1>Hi</h1></${T}>`
		);
	});

	it('follow the template and replacement imports', () => {
		const setup: Setup = (r) => {
			wrapped(r);
			r.scope = scope;
		};
		expect(every_walk('text\n', setup)).toBe(
			`<script>\nimport ${T} from 'mdsvex:template/post';\nimport { p as P_MDSVEX_G } from 'm';\n` +
				LINES +
				PROPS +
				`</script><${T} {...__mdsvex_props}><P_MDSVEX_G>text</P_MDSVEX_G></${T}>`
		);
	});

	it('go into the instance script after the imports of the document', () => {
		expect(
			every_walk(
				"import C from './C.svelte'\n\n<script>\n  let { title } = $props();\n</script>\n\n<C />\n",
				wrapped
			)
		).toBe(
			`<script>\nimport C from './C.svelte'\nimport ${T} from 'mdsvex:template/post';\n` +
				LINES +
				`\n  let { title } = $props();\n</script><${T}><C /></${T}>`
		);
	});
});

describe('extra imports state', () => {
	it('a render without them follows one with them', () => {
		const source = '# Hi\n';
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.imports = [A];
		renderer.update(parse(source), source);
		expect(renderer.html).toBe('<script>\n' + A + '\n</script><h1>Hi</h1>');
		renderer.update_mapped(parse(source), source);
		expect(renderer.html).toBe('<script>\n' + A + '\n</script><h1>Hi</h1>');
		renderer.imports = undefined;
		renderer.update(parse(source), source);
		expect(renderer.html).toBe('<h1>Hi</h1>');
		expect(every_walk(source, () => {})).toBe('<h1>Hi</h1>');
	});

	it('a wrapped render leaves none for a plain one', () => {
		expect(every_walk('# Hi\n', wrapped)).toContain(LINES);
		const source = "import C from './C.svelte'\n\n<C />\n";
		expect(every_walk(source, () => {})).toBe(
			"<script>\nimport C from './C.svelte'\n</script><C />"
		);
	});

	it('a render that throws leaves none', () => {
		const source = ':::note[x]\ntext\n:::\n';
		for (const walk of ['update', 'update_mapped', 'update_trace'] as const) {
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.imports = [A];
			renderer.strict_directives = true;
			expect(() => renderer[walk](parse(source), source)).toThrow(
				DirectiveError
			);
		}
		const plain = "import C from './C.svelte'\n\n<C />\n";
		expect(every_walk(plain, () => {})).toBe(
			"<script>\nimport C from './C.svelte'\n</script><C />"
		);
		expect(every_walk('# Hi\n', () => {})).toBe('<h1>Hi</h1>');
	});

	it('release drops them', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.imports = [A];
		renderer.release();
		expect(renderer.imports).toBeUndefined();
		renderer.update(parse('# Hi\n'), '# Hi\n');
		expect(renderer.html).toBe('<h1>Hi</h1>');
	});
});

describe('extra imports and mappings', () => {
	const source = '# Hi *there*\n\nsome `code` text\n';
	const PREFIX = '<script>\n' + LINES + '</script>';

	it('the script they start shifts every mapping by its length', () => {
		const plain = new CursorHTMLRenderer({ cache: false });
		const want = plain.update_mapped(parse(source), source).mappings;
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.imports = [A, B];
		const got = renderer.update_mapped(parse(source), source).mappings;
		expect(renderer.html).toBe(PREFIX + plain.html);
		expect(got.length).toBeGreaterThan(0);
		const plain_data = (m: (typeof got)[number], shift: number) => ({
			sourceOffsets: m.sourceOffsets,
			generatedOffsets: m.generatedOffsets.map((o) => o + shift),
			lengths: m.lengths,
			generatedLengths: m.generatedLengths,
			data: m.data,
		});
		expect(got.map((m) => plain_data(m, 0))).toEqual(
			want.map((m) => plain_data(m, PREFIX.length))
		);
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

	it('the script they start shifts every trace segment by its length', () => {
		const plain = new CursorHTMLRenderer({ cache: false });
		const want = points(
			plain.update_v3(parse(source), source, source),
			plain.html
		);
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.imports = [A, B];
		const got = points(
			renderer.update_v3(parse(source), source, source),
			renderer.html
		);
		expect(renderer.html).toBe(PREFIX + plain.html);
		expect(got.length).toBeGreaterThan(0);
		expect(got).toEqual(want.map(([g, s]) => [g + PREFIX.length, s]));
	});

	it('lines in the instance script leave its code mapped to the source', () => {
		const doc = '<script>\n  let x = 1;\n</script>\n\n{x} text\n';
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.imports = [A, B];
		const { mappings } = renderer.update_mapped(parse(doc), doc);
		const html = renderer.html;
		expect(html).toBe(
			'<script>\n' + LINES + '\n  let x = 1;\n</script><p>{x} text</p>'
		);
		const same = mappings.filter(
			(m) => m.lengths[0] === (m.generatedLengths?.[0] ?? m.lengths[0])
		);
		const texts = same.map((m) =>
			html.slice(m.generatedOffsets[0], m.generatedOffsets[0] + m.lengths[0])
		);
		expect(texts).toContain('\n  let x = 1;\n');
		for (let i = 0; i < same.length; i++) {
			const at = same[i].sourceOffsets[0];
			expect(texts[i]).toBe(doc.slice(at, at + same[i].lengths[0]));
		}
	});
});
