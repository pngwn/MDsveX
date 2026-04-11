import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte, PFMParser } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';

describe('line ending normalization', () => {
	describe('batch mode', () => {
		test('\\r\\n is normalized to \\n in result.source', () => {
			const { source } = parse_markdown_svelte('# aaa\r\n\r\nbbb\r\n');
			expect(source).toBe('# aaa\n\nbbb\n');
		});

		test('bare \\r is normalized to \\n (commonmark 2.1)', () => {
			const { source } = parse_markdown_svelte('# aaa\rbbb\r');
			expect(source).toBe('# aaa\nbbb\n');
		});

		test('mixed \\r, \\r\\n, and \\n in the same input', () => {
			const { source } = parse_markdown_svelte('a\rb\r\nc\nd');
			expect(source).toBe('a\nb\nc\nd');
		});

		test('no-\\r input is returned unchanged (fast path)', () => {
			const input = '# hello\n\nworld\n';
			const { source } = parse_markdown_svelte(input);
			expect(source).toBe(input);
		});

		test('positions in CRLF input match positions in the equivalent LF input', () => {
			const to_plain = (r: ReturnType<typeof parse_markdown_svelte>) =>
				r.nodes.get_node().children.map((i) => {
					const n = r.nodes.get_node(i);
					return { kind: n.kind, start: n.start, end: n.end };
				});
			const crlf = parse_markdown_svelte('# aaa\r\n\r\nbbb\r\n');
			const lf = parse_markdown_svelte('# aaa\n\nbbb\n');
			expect(to_plain(crlf)).toEqual(to_plain(lf));
		});

		test('result.source can be sliced to recover node content', () => {
			const { nodes, source } = parse_markdown_svelte('abc\r\n# hello\r\n');
			const root = nodes.get_node();
			const heading = root.children
				.map((i) => nodes.get_node(i))
				.find((n) => n.kind === 'heading')!;
			expect(source.slice(heading.value[0], heading.value[1])).toBe('hello');
		});

		test('CRLF blank line is detected as a blank line', () => {
			const { nodes } = parse_markdown_svelte('aaa\r\n\r\nbbb\r\n');
			const root = nodes.get_node();
			const kinds = root.children.map((i) => nodes.get_node(i).kind);
			// two paragraphs separated by a blank line (no \r garbage inside)
			expect(kinds).toContain('paragraph');
			const paragraphs = root.children
				.map((i) => nodes.get_node(i))
				.filter((n) => n.kind === 'paragraph');
			expect(paragraphs.length).toBe(2);
		});
	});

	describe('streaming mode', () => {
		const get_source = (p: PFMParser) =>
			(p as unknown as { source: string }).source;

		test('\\r\\n split across feed() boundaries becomes one \\n', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('# abc\r');
			p.feed('\ndef');
			p.finish();
			expect(get_source(p)).toBe('# abc\ndef');
		});

		test('bare \\r at chunk end followed by non-\\n next chunk is a line end', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('abc\r');
			p.feed('def');
			p.finish();
			expect(get_source(p)).toBe('abc\ndef');
		});

		test('lone \\r followed by finish() is a single line end', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('\r');
			p.finish();
			expect(get_source(p)).toBe('\n');
		});

		test('two separate \\r chunks produce two line endings', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('\r');
			p.feed('\r');
			p.finish();
			expect(get_source(p)).toBe('\n\n');
		});

		test('\\r\\n within a chunk is normalized', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('abc\r\ndef\r\n');
			p.finish();
			expect(get_source(p)).toBe('abc\ndef\n');
		});

		test('empty feed() chunks do not disturb pending_cr state', () => {
			const tree = new TreeBuilder(128);
			const p = new PFMParser(tree);
			p.init();
			p.feed('abc\r');
			p.feed('');
			p.feed('\ndef');
			p.finish();
			expect(get_source(p)).toBe('abc\ndef');
		});
	});
});
