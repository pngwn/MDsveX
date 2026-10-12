import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { every_path, lines } from './stream_shape';

const BODY = '\nline one\n  indented *x*\n\n# line three\n';

function raw_text(source: string): string | undefined {
	const { nodes } = parse_markdown_svelte(source);
	const walk = (index: number): string | undefined => {
		const node = nodes.get_node(index);
		if (node.kind === 'html') {
			return (
				nodes._strings[index] ?? source.slice(node.value[0], node.value[1])
			);
		}
		for (const child of node.children) {
			const found = walk(child);
			if (found !== undefined) return found;
		}
		return undefined;
	};
	return walk(0);
}

describe.each(['pre', 'textarea', 'script', 'style'])(
	'the content of <%s>',
	(tag) => {
		test('is text as written, with no blocks and no inline nodes', () => {
			const source = `<${tag}>${BODY}</${tag}>\n\nafter\n`;
			expect(every_path(source)).toBe(
				lines(
					'root',
					`  html tag="${tag}"`,
					'  line_break',
					'  line_break',
					'  paragraph',
					'    text "after"',
					'  line_break'
				)
			);
			expect(raw_text(source)).toBe(BODY);
		});

		test('keeps its attributes', () => {
			expect(every_path(`<${tag} class="a">x *y*</${tag}>\n`)).toBe(
				lines('root', `  html tag="${tag}" class="a"`, '  line_break')
			);
		});

		test('does not hold the markers of a block quote', () => {
			const source = `> <${tag}>\n> a\n>   b\n> </${tag}>\n`;
			expect(every_path(source)).toBe(
				lines('root', '  block_quote', `    html tag="${tag}"`, '  line_break')
			);
			expect(raw_text(source)).toBe('\na\n  b\n');
		});

		test('does not hold the indent of a list item', () => {
			const source = `- <${tag}>\n  a\n    b\n  </${tag}>\n`;
			expect(every_path(source)).toBe(
				lines(
					'root',
					'  list ordered=false start=0 tight=true',
					'    list_item',
					`      html tag="${tag}"`,
					'  line_break'
				)
			);
			expect(raw_text(source)).toBe('\na\n  b\n');
		});

		test('is text inside a paragraph', () => {
			expect(every_path(`a <${tag}>*b*  c</${tag}> d\n`)).toBe(
				lines(
					'root',
					'  paragraph',
					'    text "a "',
					`    html tag="${tag}"`,
					'    text " d"',
					'  line_break'
				)
			);
		});
	}
);

test('an element named like a raw text one is an element', () => {
	expect(every_path('<present>*a*</present>\n')).toBe(
		lines(
			'root',
			'  html tag="present"',
			'    strong_emphasis',
			'      text "a"',
			'  line_break'
		)
	);
});

describe('a <pre> at the start of a line', () => {
	test('ends the paragraph before it', () => {
		expect(every_path('a\n<pre>\n  b *c*\n</pre>\nd\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a"',
				'  line_break',
				'  html tag="pre"',
				'  line_break',
				'  paragraph',
				'    text "d"',
				'  line_break'
			)
		);
	});

	test('ends a table', () => {
		expect(every_path('| a |\n|---|\n<pre>\n| b |\n</pre>\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'  html tag="pre"',
				'  line_break'
			)
		);
	});

	test('ends the paragraph of a list item and the list', () => {
		expect(every_path('- a\n<pre>\n- b\n</pre>\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a"',
				'  line_break',
				'  html tag="pre"',
				'  line_break'
			)
		);
	});

	test('text after its close tag starts a paragraph', () => {
		expect(every_path('<pre>a</pre> b\n')).toBe(
			lines(
				'root',
				'  html tag="pre"',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
	});
});
