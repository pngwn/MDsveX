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
function render_all(source: string): string[] {
	const buf = parse(source);
	const plain = new CursorHTMLRenderer({ cache: false });
	plain.update(buf, source);
	const cached = new CursorHTMLRenderer();
	cached.update(buf, source);
	const mapped = new CursorHTMLRenderer({ cache: false });
	mapped.update_mapped(buf, source);
	const v3 = new CursorHTMLRenderer({ cache: false });
	v3.update_v3(buf, source, source);
	const trace = new CursorHTMLRenderer({ cache: false });
	trace.update_trace(buf, source);
	return [plain.html, cached.html, mapped.html, v3.html, trace.html];
}

function render(source: string): string {
	const all = render_all(source);
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
