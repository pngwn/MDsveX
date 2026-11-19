import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';
import {
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

describe('frontmatter', () => {
	test('basic frontmatter with content after', () => {
		const input = '---\ntitle: hello\n---\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.start).toBe(0);
		expect(fm.end).toBe(21); // includes trailing \n after closing ---
		expect(input.slice(fm.value[0], fm.value[1])).toBe('title: hello\n');
	});

	test('frontmatter value excludes fences', () => {
		const input = '---\nfoo: bar\nbaz: qux\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(input.slice(fm.value[0], fm.value[1])).toBe('foo: bar\nbaz: qux\n');
	});

	test('frontmatter with empty content', () => {
		const input = '---\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.start).toBe(0);
		expect(fm.end).toBe(8);
		expect(input.slice(fm.value[0], fm.value[1])).toBe('');
	});

	test('frontmatter must start on first line', () => {
		const input = '\n---\ntitle: hello\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		// Should NOT be parsed as frontmatter, the first node should be
		// a line_break or thematic_break, not frontmatter
		const first = nodes.get_node(1);
		expect(first.kind).not.toBe('frontmatter');
	});

	test('--- in middle of document is thematic break', () => {
		const input = '# Title\n\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).not.toContain('frontmatter');
		expect(kinds).toContain('thematic_break');
	});

	test('frontmatter closes on \\n--- regardless of yaml content', () => {
		const input = '---\nblock: |\n  line1\n  line2\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(input.slice(fm.value[0], fm.value[1])).toBe(
			'block: |\n  line1\n  line2\n'
		);
	});

	test('frontmatter followed by markdown content', () => {
		const input = '---\ntitle: test\n---\n\nSome paragraph.';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');

		// Find the paragraph
		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).toContain('paragraph');
	});

	test('frontmatter at EOF without closing fence is not frontmatter', () => {
		const input = '---\ntitle: hello\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const children = root.children.map((i) => nodes.get_node(i));
		const kinds = children.map((n) => n.kind);
		expect(kinds).not.toContain('frontmatter');
	});

	test('--- followed by non-newline is not frontmatter', () => {
		const input = '---foo\n';
		const { nodes } = parse_markdown_svelte(input);

		const first = nodes.get_node(1);
		expect(first.kind).not.toBe('frontmatter');
	});

	test('closing --- with trailing content is not a valid close', () => {
		const input = '---\ntitle: hello\n---extra\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		// The value should include everything up to the real closing ---
		expect(input.slice(fm.value[0], fm.value[1])).toBe(
			'title: hello\n---extra\n'
		);
	});

	test('frontmatter NodeKind is findable', () => {
		const input = '---\nk: v\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fms = nodes.get_kinds(NodeKind.frontmatter);
		expect(fms.length).toBe(1);
	});

	test('frontmatter at EOF (no trailing newline after closing fence)', () => {
		const input = '---\nk: v\n---';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.end).toBe(12);
		expect(input.slice(fm.value[0], fm.value[1])).toBe('k: v\n');
	});
});

describe('spaces and tabs after a frontmatter fence', () => {
	test('after the opening fence', () => {
		expect(every_path('--- \ntitle: hi\n---\n\n# Body\n')).toBe(
			lines(
				'root',
				'  frontmatter "title: hi\\n"',
				'  line_break',
				'  heading depth=1 "Body"',
				'    text "Body"',
				'  line_break'
			)
		);
		expect(every_path('---\t \t\nk: v\n---\n')).toBe(
			lines('root', '  frontmatter "k: v\\n"')
		);
	});

	test('after the closing fence', () => {
		expect(every_path('---\ntitle: hi\n--- \n\n# Body\n')).toBe(
			lines(
				'root',
				'  frontmatter "title: hi\\n"',
				'  line_break',
				'  heading depth=1 "Body"',
				'    text "Body"',
				'  line_break'
			)
		);
		expect(every_path('---\nk: v\n---\t\nx\n')).toBe(
			lines(
				'root',
				'  frontmatter "k: v\\n"',
				'  paragraph',
				'    text "x"',
				'  line_break'
			)
		);
	});

	test('after both, and at the end of the source', () => {
		expect(every_path('---  \nk: v\n---  ')).toBe(
			lines('root', '  frontmatter "k: v\\n"')
		);
		expect(every_path('--- \n--- \n')).toBe(lines('root', '  frontmatter'));
	});

	test('the node ends after the closing line', () => {
		const input = '--- \nk: v\n---\t \nx';
		const { nodes } = parse_markdown_svelte(input);
		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect([fm.start, fm.end]).toEqual([0, 16]);
		expect(fm.value).toEqual([5, 10]);
	});

	test('with windows line endings', () => {
		const input = '--- \r\nk: v\r\n---\t\r\nx\r\n';
		const { nodes } = parse_markdown_svelte(input);
		expect(nodes.get_node(1).kind).toBe('frontmatter');
	});

	test('anything else after a fence is not a fence', () => {
		expect(every_path('--- x\nk: v\n---\n')).not.toContain('frontmatter');
		expect(every_path('---\na: 1\n--- x\nb: 2\n--- \n')).toBe(
			lines('root', '  frontmatter "a: 1\\n--- x\\nb: 2\\n"')
		);
	});

	test('no closing fence leaves a thematic break and a paragraph', () => {
		expect(every_path('--- \ntitle: hi\n')).toBe(
			lines(
				'root',
				'  thematic_break',
				'  paragraph',
				'    text "title: hi"',
				'  line_break'
			)
		);
	});

	test('random fences build one tree whole and fed', () => {
		const rand = random(906);
		const ends = ['', '', ' ', '\t', '  ', ' \t', ' x', '-'];
		const bodies = ['', 'k: v\n', 'a: 1\nb: 2\n', '\n', '--- x\n', '# h\n'];
		const tails = ['', '\n', '\n# h\n', '\nx', '\n---\n'];
		for (let i = 0; i < 600; i++) {
			const source = `---${pick(rand, ends)}\n${pick(rand, bodies)}---${pick(rand, ends)}${pick(rand, tails)}`;
			expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			for (const chunk of [0, 1, 3]) {
				expect(
					problems(source, chunk),
					`${JSON.stringify(source)} fed ${chunk}`
				).toEqual([]);
			}
		}
	});
});
