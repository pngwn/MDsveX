import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor';

function parse(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

/** the html of every render path, which must agree */
function render_all(source: string, module_code = ''): string[] {
	const buf = parse(source);
	const plain = new CursorHTMLRenderer({ cache: false });
	plain.update(buf, source, module_code);
	const cached = new CursorHTMLRenderer();
	cached.update(buf, source, module_code);
	const mapped = new CursorHTMLRenderer({ cache: false });
	mapped.update_mapped(buf, source, null, module_code);
	const v3 = new CursorHTMLRenderer({ cache: false });
	v3.update_v3(buf, source, source, undefined, module_code);
	const trace = new CursorHTMLRenderer({ cache: false });
	trace.update_trace(buf, source, module_code);
	return [plain.html, cached.html, mapped.html, v3.html, trace.html];
}

function render(source: string, module_code = ''): string {
	const all = render_all(source, module_code);
	for (const html of all) expect(html).toBe(all[0]);
	return all[0];
}

describe('bare imports', () => {
	it('become a script when the document has none', () => {
		expect(
			render("import Chart from './Chart.svelte'\n\n# Hi\n\n<Chart />\n")
		).toBe(
			"<script>\nimport Chart from './Chart.svelte'\n</script><h1>Hi</h1><Chart />"
		);
	});

	it('share one script', () => {
		expect(
			render("import A from './A.svelte'\nimport { b } from 'b'\n\n<A />\n")
		).toBe(
			"<script>\nimport A from './A.svelte'\nimport { b } from 'b'\n</script><A />"
		);
	});

	it('keep every line of a multi-line import', () => {
		expect(
			render(
				"import {\n  a,\n  b,\n} from 'x';\nimport C from './C.svelte'\n\n<C {a} />\n"
			)
		).toBe(
			"<script>\nimport {\n  a,\n  b,\n} from 'x';\nimport C from './C.svelte'\n</script><C {a} />"
		);
	});

	it('go into the instance script', () => {
		expect(
			render(
				"import Chart from './Chart.svelte'\n\n<script>\n  let x = 1;\n</script>\n\n<Chart />\n"
			)
		).toBe(
			"<script>\nimport Chart from './Chart.svelte'\n\n  let x = 1;\n</script><Chart />"
		);
	});

	it('skip a module script for the instance script', () => {
		expect(
			render(
				'import A from \'a\'\n\n<script module>\n  export const m = 1;\n</script>\n\n<script lang="ts">\n  let x = 1;\n</script>\n'
			)
		).toBe(
			'<script module>\n  export const m = 1;\n</script><script lang="ts">\nimport A from \'a\'\n\n  let x = 1;\n</script>'
		);
	});

	it('make their own script beside a module script only', () => {
		expect(
			render('import A from \'a\'\n\n<script context="module">\n</script>\n')
		).toBe(
			'<script>\nimport A from \'a\'\n</script><script context="module">\n</script>'
		);
	});

	it('map to their source', () => {
		const source = "import A from 'a'\n\n<A />\n";
		const r = new CursorHTMLRenderer({ cache: false });
		const { mappings } = r.update_mapped(parse(source), source);
		const at = r.html.indexOf("import A from 'a'");
		const hit = mappings.find((m) => m.generatedOffsets[0] === at);
		expect(hit?.sourceOffsets[0]).toBe(0);
		expect(hit?.lengths[0]).toBe("import A from 'a'".length);
	});
});

describe('top level external scripts', () => {
	const embed =
		'<blockquote class="twitter-tweet"><p>Hi</p>by H</blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>\n';

	it('render as svelte:element', () => {
		expect(render(embed + '\n' + embed)).toBe(
			(
				'<blockquote class="twitter-tweet"><p>Hi</p>by H</blockquote> ' +
				'<svelte:element this={"script"} async src="https://platform.twitter.com/widgets.js" charset="utf-8"></svelte:element>'
			).repeat(2)
		);
	});

	it('leave the instance script alone', () => {
		expect(
			render(
				'<script>\n  let x = 1;\n</script>\n\n<script src="a.js"></script>\n'
			)
		).toBe(
			'<script>\n  let x = 1;\n</script><svelte:element this={"script"} src="a.js"></svelte:element>'
		);
	});

	it('stay scripts inside markup', () => {
		expect(render('<div>\n<script src="a.js"></script>\n</div>\n')).toBe(
			'<div><script src="a.js"></script></div>'
		);
	});

	it('stay scripts with a body', () => {
		expect(render('<script src="a.js">x()</script>\n')).toBe(
			'<script src="a.js">x()</script>'
		);
	});
});

describe('module code', () => {
	const code = 'export const metadata = {"title":"Hi"};';

	it('renders as a module script in place of the frontmatter', () => {
		expect(render('---\ntitle: Hi\n---\n\n# Hi\n', code)).toBe(
			'<script module>\n' + code + '\n</script><h1>Hi</h1>'
		);
	});

	it('goes into the module script', () => {
		expect(
			render(
				'---\ntitle: Hi\n---\n\n<script module>\n  export const x = 1;\n</script>\n\n# Hi\n',
				code
			)
		).toBe(
			'<script module>\n' +
				code +
				'\n\n  export const x = 1;\n</script><h1>Hi</h1>'
		);
	});

	it('goes into a svelte 4 module script after the instance script', () => {
		expect(
			render(
				'---\ntitle: Hi\n---\n<script>\n  let y = 2;\n</script>\n\n<script context="module" lang="ts">\n  export const x = 1;\n</script>\n',
				code
			)
		).toBe(
			'<script>\n  let y = 2;\n</script><script context="module" lang="ts">\n' +
				code +
				'\n\n  export const x = 1;\n</script>'
		);
	});

	it('shares the document with hoisted imports', () => {
		expect(
			render(
				"---\ntitle: Hi\n---\nimport A from 'a'\n\n<script module>\n</script>\n\n<A />\n",
				code
			)
		).toBe(
			"<script>\nimport A from 'a'\n</script><script module>\n" +
				code +
				'\n\n</script><A />'
		);
		expect(
			render("---\ntitle: Hi\n---\nimport A from 'a'\n\n<A />\n", code)
		).toBe(
			'<script module>\n' +
				code +
				"\n</script><script>\nimport A from 'a'\n</script><A />"
		);
	});

	it('skips nested and external module scripts', () => {
		expect(
			render(
				'---\ntitle: Hi\n---\n<div>\n<script module>\n</script>\n</div>\n\n<script module src="a.js"></script>\n',
				code
			)
		).toBe(
			'<script module>\n' +
				code +
				'\n</script><div><script module>\n</script></div><svelte:element this={"script"} module src="a.js"></svelte:element>'
		);
	});

	it('renders nothing without code', () => {
		expect(render('---\ntitle: Hi\n---\n\n# Hi\n')).toBe('<h1>Hi</h1>');
	});

	it('is not cached between updates', () => {
		const source = '---\ntitle: Hi\n---\n\n# Hi\n';
		const buf = parse(source);
		const r = new CursorHTMLRenderer();
		r.update(buf, source, code);
		r.update(buf, source, 'export const metadata = {};');
		expect(r.html).toBe(
			'<script module>\nexport const metadata = {};\n</script><h1>Hi</h1>'
		);
	});

	it('leaves the instance script mapped to its source', () => {
		const source =
			'---\ntitle: Hi\n---\n<script module>\nlet m = 1;\n</script>\n';
		const r = new CursorHTMLRenderer({ cache: false });
		const { mappings } = r.update_mapped(parse(source), source, null, code);
		const at = r.html.indexOf('let m = 1;');
		const hit = mappings.find(
			(m) =>
				m.generatedOffsets[0] <= at &&
				at < m.generatedOffsets[0] + m.lengths[0] &&
				m.generatedLengths === undefined
		);
		expect(hit).toBeDefined();
		const s = hit!.sourceOffsets[0] + (at - hit!.generatedOffsets[0]);
		expect(source.slice(s, s + 10)).toBe('let m = 1;');
	});
});
