import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte, PFMParser } from '../src/main';
import { NodeKind } from '../src/utils';
import type { NodeBuffer } from '../src/utils';
import { TreeBuilder } from '../src/tree_builder';
import { WireEmitter } from '../src/wire_emitter';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { Cursor } from '../src/cursor';
import { print_ast } from './print';

function non_breaks(nodes: NodeBuffer, parent: number = 0) {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i))
		.filter((n) => n.kind !== 'line_break');
}

function get_children(nodes: NodeBuffer, index: number) {
	return nodes.get_node(index).children.map((i) => nodes.get_node(i));
}

/**
 * Get the text content of a table cell by reading its child text node's value.
 * Returns empty string if the cell has no children.
 */
function cell_text(
	nodes: NodeBuffer,
	cell_index: number,
	source: string
): string {
	const children = get_children(nodes, cell_index);
	if (children.length === 0) return '';
	return children
		.filter((n) => n.kind === 'text')
		.map((n) => source.slice(n.value[0], n.value[1]))
		.join('');
}

function parse_incremental(input: string, chunk_size: number = 1) {
	const tree = new TreeBuilder(input.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < input.length; i += chunk_size) {
		parser.feed(input.slice(i, i + chunk_size));
	}
	parser.finish();
	return tree.get_buffer();
}

describe('Tables (GFM)', () => {
	test('basic table with header and data rows', () => {
		const input = '| foo | bar |\n| --- | --- |\n| baz | bim |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('table');

		const table = children[0];
		expect(table.metadata.col_count).toBe(2);
		expect(table.metadata.alignments).toEqual(['none', 'none']);

		const table_children = get_children(nodes, table.index);
		// header + 1 data row
		expect(table_children.length).toBe(2);
		expect(table_children[0].kind).toBe('table_header');
		expect(table_children[1].kind).toBe('table_row');

		// Header cells
		const header_cells = get_children(nodes, table_children[0].index);
		expect(header_cells.length).toBe(2);
		expect(header_cells[0].kind).toBe('table_cell');
		expect(header_cells[1].kind).toBe('table_cell');
		expect(cell_text(nodes, header_cells[0].index, input)).toBe('foo');
		expect(cell_text(nodes, header_cells[1].index, input)).toBe('bar');

		// Data row cells
		const row_cells = get_children(nodes, table_children[1].index);
		expect(row_cells.length).toBe(2);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('baz');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('bim');
	});

	test('table with alignment', () => {
		const input =
			'| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const table = children[0];
		expect(table.metadata.alignments).toEqual(['left', 'center', 'right']);
	});

	test('table with no body rows', () => {
		const input = '| foo | bar |\n| --- | --- |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('table');

		const table_children = get_children(nodes, children[0].index);
		expect(table_children.length).toBe(1); // header only
		expect(table_children[0].kind).toBe('table_header');
	});

	test('table with multiple data rows', () => {
		const input = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const table = children[0];
		const table_children = get_children(nodes, table.index);
		// header + 3 data rows
		expect(table_children.length).toBe(4);
		expect(table_children[0].kind).toBe('table_header');
		expect(table_children[1].kind).toBe('table_row');
		expect(table_children[2].kind).toBe('table_row');
		expect(table_children[3].kind).toBe('table_row');
	});

	test('fewer cells than header pads with empty cells', () => {
		const input = '| a | b | c |\n| - | - | - |\n| 1 |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const table = children[0];
		const table_children = get_children(nodes, table.index);
		const row_cells = get_children(nodes, table_children[1].index);

		// Should be padded to 3 cells
		expect(row_cells.length).toBe(3);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('1');
		// Empty cells have no text content
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('');
		expect(cell_text(nodes, row_cells[2].index, input)).toBe('');
	});

	test('more cells than header truncates to col_count', () => {
		const input = '| a | b |\n| - | - |\n| 1 | 2 | 3 | 4 |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const table = children[0];
		const table_children = get_children(nodes, table.index);
		const row_cells = get_children(nodes, table_children[1].index);

		// Truncated to 2 cells
		expect(row_cells.length).toBe(2);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('1');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('2');
	});

	test('header/delimiter count mismatch is not a table', () => {
		const input = '| a | b |\n| - |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Should be a paragraph, not a table
		expect(children[0].kind).toBe('paragraph');
	});

	test('table terminated by blank line', () => {
		const input = '| a | b |\n| - | - |\n| 1 | 2 |\n\nparagraph\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children[0].kind).toBe('table');
		expect(children[1].kind).toBe('paragraph');

		const table_children = get_children(nodes, children[0].index);
		expect(table_children.length).toBe(2); // header + 1 row
	});

	test('table terminated by heading', () => {
		const input = '| a | b |\n| - | - |\n| 1 | 2 |\n# Heading\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children[0].kind).toBe('table');
		// Table should have header + 1 data row (heading line closes the table)
		const table_children = get_children(nodes, children[0].index);
		expect(table_children.length).toBe(2);
	});

	test('escaped pipe in cell', () => {
		const input = '| a \\| b | c |\n| --- | --- |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children[0].kind).toBe('table');
		const table = children[0];
		expect(table.metadata.col_count).toBe(2);

		const header_cells = get_children(
			nodes,
			get_children(nodes, table.index)[0].index
		);
		expect(header_cells.length).toBe(2);
		// First cell contains the escaped pipe (backslash removed)
		expect(cell_text(nodes, header_cells[0].index, input)).toBe('a | b');
	});

	test('single column table', () => {
		const input = '| a |\n| - |\n| b |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children[0].kind).toBe('table');
		expect(children[0].metadata.col_count).toBe(1);
	});

	test('alignment variations', () => {
		const input = '| a | b | c | d |\n| --- | :--- | ---: | :---: |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children[0].metadata.alignments).toEqual([
			'none',
			'left',
			'right',
			'center',
		]);
	});

	test('cell content is trimmed', () => {
		const input = '|  foo  |  bar  |\n| --- | --- |\n|  baz  |  bim  |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];

		const header_cells = get_children(
			nodes,
			get_children(nodes, table.index)[0].index
		);
		expect(cell_text(nodes, header_cells[0].index, input)).toBe('foo');
		expect(cell_text(nodes, header_cells[1].index, input)).toBe('bar');

		const row_cells = get_children(
			nodes,
			get_children(nodes, table.index)[1].index
		);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('baz');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('bim');
	});

	test('incremental: byte-by-byte produces same result as batch', () => {
		const input = '| foo | bar |\n| --- | --- |\n| baz | bim |\n';
		const batch = parse_markdown_svelte(input).nodes;
		const incremental = parse_incremental(input, 1);

		const batch_table = non_breaks(batch)[0];
		const inc_table = non_breaks(incremental)[0];

		expect(inc_table.kind).toBe('table');
		expect(inc_table.metadata.col_count).toBe(batch_table.metadata.col_count);
		expect(inc_table.metadata.alignments).toEqual(
			batch_table.metadata.alignments
		);

		const batch_children = get_children(batch, batch_table.index);
		const inc_children = get_children(incremental, inc_table.index);
		expect(inc_children.length).toBe(batch_children.length);
	});

	test('incremental: line-by-line produces same result as batch', () => {
		const input = '| foo | bar |\n| --- | --- |\n| baz | bim |\n';
		const batch = parse_markdown_svelte(input).nodes;

		const tree = new TreeBuilder(input.length);
		const parser = new PFMParser(tree);
		parser.init();
		// Feed line by line
		const lines = input.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const chunk = i < lines.length - 1 ? lines[i] + '\n' : lines[i];
			if (chunk) parser.feed(chunk);
		}
		parser.finish();
		const incremental = tree.get_buffer();

		const batch_table = non_breaks(batch)[0];
		const inc_table = non_breaks(incremental)[0];

		expect(inc_table.kind).toBe('table');
		expect(inc_table.metadata.col_count).toBe(batch_table.metadata.col_count);
	});

	test('not a table: no delimiter row', () => {
		const input = '| foo | bar |\n| baz | bim |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// First line starts a paragraph since second line isn't a delimiter
		expect(children[0].kind).toBe('paragraph');
	});

	test('table with empty cells', () => {
		const input = '| a | b |\n| - | - |\n|  |  |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const table = children[0];
		const table_children = get_children(nodes, table.index);
		const row_cells = get_children(nodes, table_children[1].index);
		expect(row_cells.length).toBe(2);
		// Empty trimmed cells
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('');
	});

	test('incremental: cell text streams eagerly byte-by-byte', () => {
		// After header+delimiter are confirmed, data row cells should emit
		// open opcodes as content arrives, not wait for the full row.
		const header = '| a | b |\n| - | - |\n';
		const data_row = '| foo | bar |\n';
		const input = header + data_row;

		const tree = new TreeBuilder(input.length);
		const parser = new PFMParser(tree);
		parser.init();

		// Feed the header+delimiter, table is confirmed but no data rows yet
		parser.feed(header);
		const after_header = tree.get_buffer();
		const table_after_header = non_breaks(after_header);
		expect(table_after_header.length).toBe(1);
		expect(table_after_header[0].kind).toBe('table');
		// Only header child, no data rows yet
		expect(get_children(after_header, table_after_header[0].index).length).toBe(
			1
		);

		// Feed '| f', row+cell should open, text node should open with 'f'
		parser.feed('| f');
		const after_f = tree.get_buffer();
		const table_f = non_breaks(after_f)[0];
		const children_f = get_children(after_f, table_f.index);
		expect(children_f.length).toBe(2); // header + 1 data row
		expect(children_f[1].kind).toBe('table_row');
		const cells_f = get_children(after_f, children_f[1].index);
		expect(cells_f.length).toBe(1); // first cell open
		// Cell has a text child node open with value_start set
		const text_children = get_children(after_f, cells_f[0].index);
		expect(text_children.length).toBe(1);
		expect(text_children[0].kind).toBe('text');

		// Feed remaining and finish
		parser.feed('oo | bar |\n');
		parser.finish();
		const final = tree.get_buffer();
		const final_table = non_breaks(final)[0];
		const final_children = get_children(final, final_table.index);
		expect(final_children.length).toBe(2);
		const final_cells = get_children(final, final_children[1].index);
		expect(final_cells.length).toBe(2);
		expect(cell_text(final, final_cells[0].index, input)).toBe('foo');
		expect(cell_text(final, final_cells[1].index, input)).toBe('bar');
	});

	test('table with no body and no trailing newline', () => {
		const input = '| Feature | Status |\n|:---|:---:|\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		expect(children[0].kind).toBe('table');
	});

	test('incremental: header-only table no trailing newline', () => {
		const input =
			'| Feature        | Status | Priority | Owner          | Notes                                                                                              |\n|:---------------|:------:|---------:|:---------------|:---------------------------------------------------------------------------------------------------|\n';
		const nodes = parse_incremental(input, 1);
		const children = non_breaks(nodes);
		expect(children[0].kind).toBe('table');
	});

	test('inline emphasis in table cell', () => {
		const input = '| *foo* | bar |\n| --- | --- |\n| baz | *bim* |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const header_cells = get_children(
			nodes,
			get_children(nodes, table.index)[0].index
		);
		// Header cell 1 should have emphasis child
		const h1_children = get_children(nodes, header_cells[0].index);
		expect(h1_children.some((c) => c.kind === 'strong_emphasis')).toBe(true);

		// Data row cell 2 should have emphasis
		const row_cells = get_children(
			nodes,
			get_children(nodes, table.index)[1].index
		);
		const r2_children = get_children(nodes, row_cells[1].index);
		expect(r2_children.some((c) => c.kind === 'strong_emphasis')).toBe(true);
	});

	test('inline code span in table cell', () => {
		const input = '| `code` | bar |\n| --- | --- |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const header_cells = get_children(
			nodes,
			get_children(nodes, table.index)[0].index
		);
		const h1_children = get_children(nodes, header_cells[0].index);
		expect(h1_children.some((c) => c.kind === 'code_span')).toBe(true);
	});

	test('inline code span in data row cell', () => {
		const input = '| a |\n| - |\n| Use `console.log()` to debug |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const row_cells = get_children(
			nodes,
			get_children(nodes, table.index)[1].index
		);
		const cell_children = get_children(nodes, row_cells[0].index);
		const kinds = cell_children.map((c) => c.kind);
		expect(kinds).toContain('code_span');
	});

	test('mixed inline content in table cell', () => {
		const input = '| hello *world* | _foo_ bar |\n| --- | --- |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const header_cells = get_children(
			nodes,
			get_children(nodes, table.index)[0].index
		);
		// Cell 1: text + strong_emphasis
		const h1_kinds = get_children(nodes, header_cells[0].index).map(
			(c) => c.kind
		);
		expect(h1_kinds).toContain('text');
		expect(h1_kinds).toContain('strong_emphasis');
		// Cell 2: emphasis + text
		const h2_kinds = get_children(nodes, header_cells[1].index).map(
			(c) => c.kind
		);
		expect(h2_kinds).toContain('emphasis');
		expect(h2_kinds).toContain('text');
	});

	test('inline content preserves whitespace between words', () => {
		const input =
			'| a | b |\n| - | - |\n| Finished the *OAuth handshake* and *token refresh* logic |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const row_cells = get_children(
			nodes,
			get_children(nodes, table.index)[1].index
		);
		// Collect all text content from cell children
		const cell_children = get_children(nodes, row_cells[0].index);
		const texts: string[] = [];
		for (const child of cell_children) {
			if (child.kind === 'text') {
				texts.push(input.slice(child.value[0], child.value[1]));
			} else if (child.kind === 'strong_emphasis') {
				const inner = get_children(nodes, child.index);
				for (const t of inner) {
					if (t.kind === 'text')
						texts.push(input.slice(t.value[0], t.value[1]));
				}
			}
		}
		const full = texts.join('');
		// Spaces between words must be preserved
		expect(full).toContain('the ');
		expect(full).toContain(' and ');
		expect(full).toContain(' logic');
	});

	test('inline emphasis closed before pipe does not leak', () => {
		const input =
			'| one | two |\n|:---|:---:|\n| *Auth flow* | ok |\n| Search index | ok |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];

		const rows = get_children(nodes, table.index);
		expect(rows.length).toBe(3); // header + 2 data rows

		// Data row 1: cell 1 = emphasis "Auth flow", cell 2 = "ok"
		const row1_cells = get_children(nodes, rows[1].index);
		expect(row1_cells.length).toBe(2);
		expect(cell_text(nodes, row1_cells[1].index, input)).toBe('ok');

		// Data row 2: cell 1 = "Search index", cell 2 = "ok"
		const row2_cells = get_children(nodes, rows[2].index);
		expect(row2_cells.length).toBe(2);
		expect(cell_text(nodes, row2_cells[0].index, input)).toBe('Search index');
		expect(cell_text(nodes, row2_cells[1].index, input)).toBe('ok');

		// Same result byte-by-byte
		const inc = parse_incremental(input, 1);
		const inc_children = non_breaks(inc);
		const inc_table = inc_children[0];
		const inc_rows = get_children(inc, inc_table.index);
		expect(inc_rows.length).toBe(3);
		const inc_row1 = get_children(inc, inc_rows[1].index);
		expect(inc_row1.length).toBe(2);
		expect(cell_text(inc, inc_row1[1].index, input)).toBe('ok');
		const inc_row2 = get_children(inc, inc_rows[2].index);
		expect(inc_row2.length).toBe(2);
		expect(cell_text(inc, inc_row2[0].index, input)).toBe('Search index');
	});

	test('emphasis in cell: opcode structure is correct', () => {
		const input =
			'| one | two |\n|:---|:---:|\n| *Auth flow* | ok |\n| Search index | ok |\n';

		// Check byte-by-byte incremental
		const inc = parse_incremental(input, 1);
		const inc_table = non_breaks(inc)[0];
		const inc_rows = get_children(inc, inc_table.index);

		// Row 1 cell 1: emphasis + content
		const r1_cells = get_children(inc, inc_rows[1].index);
		expect(r1_cells.length).toBe(2);
		const r1c1_children = get_children(inc, r1_cells[0].index);
		// Should have emphasis child, NOT have text from other cells
		for (const child of r1c1_children) {
			if (child.kind === 'text') {
				const val = input.slice(child.value[0], child.value[1]);
				expect(val).not.toContain('ok');
				expect(val).not.toContain('Search');
				expect(val).not.toContain('|');
			}
		}

		// Row 1 cell 2: just "ok"
		expect(cell_text(inc, r1_cells[1].index, input)).toBe('ok');

		// Row 2 should exist and be separate
		const r2_cells = get_children(inc, inc_rows[2].index);
		expect(r2_cells.length).toBe(2);
		expect(cell_text(inc, r2_cells[0].index, input)).toBe('Search index');
	});

	test('unclosed emphasis in cell is revoked at cell boundary', () => {
		const input = '| a | b |\n| - | - |\n| *foo | bar |\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const table = children[0];
		const row_cells = get_children(
			nodes,
			get_children(nodes, table.index)[1].index
		);

		// Cell 1: unclosed * should be revoked, content is "*foo" as text
		const c1_kids = get_children(nodes, row_cells[0].index);
		// Should NOT have emphasis, it was revoked
		expect(c1_kids.every((c) => c.kind === 'text')).toBe(true);

		// Cell 2: should be unaffected
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('bar');
	});

	test('code span in paragraph renders correctly', () => {
		const input = 'Use `console.log()` to debug\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		expect(children[0].kind).toBe('paragraph');
		const para_kids = get_children(nodes, children[0].index);
		const kinds = para_kids.map((c) => c.kind);
		expect(kinds).toContain('code_span');
	});

	test('incremental: pipe immediately closes cell', () => {
		const header = '| a | b |\n| - | - |\n';
		const input = header + '| x | y |\n';

		const tree = new TreeBuilder(input.length);
		const parser = new PFMParser(tree);
		parser.init();
		parser.feed(header);

		// Feed '| x ', cell open, text streaming
		parser.feed('| x ');
		const before_pipe = tree.get_buffer();
		const t1 = non_breaks(before_pipe)[0];
		const rows1 = get_children(before_pipe, t1.index);
		expect(rows1.length).toBe(2); // header + data row
		const cells1 = get_children(before_pipe, rows1[1].index);
		expect(cells1.length).toBe(1); // only first cell

		// Feed '|', immediately closes first cell, opens second
		parser.feed('|');
		const at_pipe = tree.get_buffer();
		const t2 = non_breaks(at_pipe)[0];
		const rows2 = get_children(at_pipe, t2.index);
		const cells2 = get_children(at_pipe, rows2[1].index);
		expect(cells2.length).toBe(2); // first cell closed, second cell open
		expect(cell_text(at_pipe, cells2[0].index, input)).toBe('x');

		// Feed ' y |\n', fills second cell and closes row
		parser.feed(' y |\n');
		parser.finish();
		const final = tree.get_buffer();
		const tf = non_breaks(final)[0];
		const rowsf = get_children(final, tf.index);
		const cellsf = get_children(final, rowsf[1].index);
		expect(cellsf.length).toBe(2);
		expect(cell_text(final, cellsf[0].index, input)).toBe('x');
		expect(cell_text(final, cellsf[1].index, input)).toBe('y');
	});

	test('table inside html block element', () => {
		const input =
			'<div>\n\n| foo | bar |\n| --- | --- |\n| baz | bim |\n\n</div>\n';
		const { nodes } = parse_markdown_svelte(input);
		const root_children = non_breaks(nodes);
		expect(root_children.length).toBe(1);
		expect(root_children[0].kind).toBe('html');

		const html_children = non_breaks(nodes, root_children[0].index);
		expect(html_children.length).toBe(1);
		expect(html_children[0].kind).toBe('table');

		const table_children = get_children(nodes, html_children[0].index);
		expect(table_children[0].kind).toBe('table_header');
		expect(table_children[1].kind).toBe('table_row');

		const header_cells = get_children(nodes, table_children[0].index);
		expect(cell_text(nodes, header_cells[0].index, input)).toBe('foo');
		expect(cell_text(nodes, header_cells[1].index, input)).toBe('bar');

		const row_cells = get_children(nodes, table_children[1].index);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('baz');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('bim');
	});

	test('table inside svelte block branch', () => {
		const input =
			'{#if x}\n\n| foo | bar |\n| --- | --- |\n| baz | bim |\n\n{/if}\n';
		const { nodes } = parse_markdown_svelte(input);
		const root_children = non_breaks(nodes);
		expect(root_children.length).toBe(1);
		expect(root_children[0].kind).toBe('svelte_block');

		const block_children = get_children(nodes, root_children[0].index);
		const branch = block_children.find((n) => n.kind === 'svelte_branch');
		expect(branch).toBeDefined();

		const branch_children = non_breaks(nodes, branch!.index);
		expect(branch_children.length).toBe(1);
		expect(branch_children[0].kind).toBe('table');

		const table_children = get_children(nodes, branch_children[0].index);
		expect(table_children[0].kind).toBe('table_header');
		expect(table_children[1].kind).toBe('table_row');

		const header_cells = get_children(nodes, table_children[0].index);
		expect(cell_text(nodes, header_cells[0].index, input)).toBe('foo');
		expect(cell_text(nodes, header_cells[1].index, input)).toBe('bar');

		const row_cells = get_children(nodes, table_children[1].index);
		expect(cell_text(nodes, row_cells[0].index, input)).toBe('baz');
		expect(cell_text(nodes, row_cells[1].index, input)).toBe('bim');
	});
});

/** read by cursor so wire strings and source slices compare alike */
function data_cell_texts(nodes: NodeBuffer, source: string): string[] {
	const cursor = new Cursor(nodes, source);
	const texts: string[] = [];
	const table = non_breaks(nodes)[0];
	for (const row of get_children(nodes, table.index)) {
		if (row.kind !== 'table_row') continue;
		for (const cell of get_children(nodes, row.index)) {
			let text = '';
			for (const child of cell.children) {
				cursor.move_to(child);
				if (cursor.kind === NodeKind.text) text += cursor.text();
			}
			texts.push(text);
		}
	}
	return texts;
}

/** one line per row, each cell as its column and text plus +cN or +rN spans, a wire tree holds its own text */
function grid(nodes: NodeBuffer, source: string | null): string[] {
	const table = non_breaks(nodes).find((n) => n.kind === 'table');
	if (!table) return [];
	return get_children(nodes, table.index).map((row) => {
		const cells = get_children(nodes, row.index).map((cell) => {
			const text = get_children(nodes, cell.index)
				.filter((n) => n.kind === 'text')
				.map((n) =>
					source === null
						? nodes._strings[n.index]
						: source.slice(n.value[0], n.value[1])
				)
				.join('');
			let s = `${nodes.extra_at(cell.index)}:${text}`;
			if (cell.metadata?.colspan) s += `+c${cell.metadata.colspan}`;
			if (cell.metadata?.rowspan) s += `+r${cell.metadata.rowspan}`;
			return s;
		});
		return (row.kind === 'table_header' ? 'head ' : 'row  ') + cells.join(' ');
	});
}

function table_meta(nodes: NodeBuffer) {
	return non_breaks(nodes).find((n) => n.kind === 'table')?.metadata;
}

function parse_over_wire(source: string, chunk: number): NodeBuffer {
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

/** the grid and table metadata of a batch parse, checked against every chunked and wire parse */
function extended(input: string) {
	const nodes = parse_markdown_svelte(input).nodes;
	const g = grid(nodes, input);
	const meta = table_meta(nodes);
	for (let chunk = 1; chunk <= 7; chunk++) {
		const inc = parse_incremental(input, chunk);
		expect(grid(inc, input), `chunk ${chunk}`).toEqual(g);
		expect(table_meta(inc), `chunk ${chunk}`).toEqual(meta);
		const wire = parse_over_wire(input, chunk);
		expect(grid(wire, null), `wire chunk ${chunk}`).toEqual(g);
		expect(table_meta(wire), `wire chunk ${chunk}`).toEqual(meta);
	}
	return { grid: g, meta };
}

describe('Tables (header columns)', () => {
	test('a || marks left header columns', () => {
		const { grid, meta } = extended(
			'| maybe || title | title 2 |\n|-------||-------|---------|\n| hello || text  | text 2  |\n'
		);
		expect(meta?.col_count).toBe(3);
		expect(meta?.header_columns).toEqual([1, 0]);
		expect(meta?.spans).toBeUndefined();
		expect(grid).toEqual([
			'head 0:maybe 1:title 2:title 2',
			'row  0:hello 1:text 2:text 2',
		]);
	});

	test('a || nearer the right marks right header columns', () => {
		const { grid, meta } = extended(
			'| title | title 2 || |\n|-------|---------||--------|\n| text | text 2 || head 1 |\n'
		);
		expect(meta?.header_columns).toEqual([0, 1]);
		expect(grid).toEqual([
			'head 0:title 1:title 2 2:',
			'row  0:text 1:text 2 2:head 1',
		]);
	});

	test('one || between equal sides heads the left', () => {
		const { meta } = extended('| a | b || c | d |\n|---|---||---|---|\n');
		expect(meta?.header_columns).toEqual([2, 0]);
	});

	test('two || mark both sides', () => {
		const { grid, meta } = extended(
			'| a || b || c |\n|---||---||---|\n| x || y || z |\n'
		);
		expect(meta?.header_columns).toEqual([1, 1]);
		expect(grid).toEqual(['head 0:a 1:b 2:c', 'row  0:x 1:y 2:z']);
	});

	test('a body row may use a single pipe at the boundary', () => {
		const { grid } = extended('| a || b |\n|---||---|\n| x | y |\n');
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:x 1:y']);
	});

	test('a || away from the boundary is an empty cell', () => {
		const { grid } = extended(
			'| a || b | c | d |\n|---||---|---|---|\n| x || y || z |\n'
		);
		expect(grid).toEqual(['head 0:a 1:b 2:c 3:d', 'row  0:x 1:y 2: 3:z']);
	});

	test('a || only in the header row is an empty cell', () => {
		const { grid, meta } = extended('| a || b |\n|---|---|---|\n| x | | y |\n');
		expect(meta?.header_columns).toBeUndefined();
		expect(grid).toEqual(['head 0:a 1: 2:b', 'row  0:x 1: 2:y']);
	});

	test('a || only in the delimiter row is not a table', () => {
		const { nodes } = parse_markdown_svelte('| a | b |\n|---||---|\n');
		expect(non_breaks(nodes)[0].kind).toBe('paragraph');
	});
});

describe('Tables (merged cells)', () => {
	test('lone > cells widen the header cell before them', () => {
		const { grid, meta } = extended(
			'| title |>  |>  |\n|-------|---|---|\n| text  | b | c |\n'
		);
		expect(meta?.spans).toBe(true);
		expect(grid).toEqual(['head 0:title+c3', 'row  0:text 1:b 2:c']);
	});

	test('a > with spaces around it merges in a body row', () => {
		const { grid } = extended('| a | b | c |\n|---|---|---|\n| x | > | y |\n');
		expect(grid).toEqual(['head 0:a 1:b 2:c', 'row  0:x+c2 2:y']);
	});

	test('lone ^ cells extend the cell above', () => {
		const { grid } = extended(
			'| title | B | C |\n|-------|---|---|\n| text  | b | c |\n|^      | b |^  |\n'
		);
		expect(grid).toEqual([
			'head 0:title 1:B 2:C',
			'row  0:text+r2 1:b 2:c+r2',
			'row  1:b',
		]);
	});

	test('a ^ chain spans three rows', () => {
		const { grid } = extended('| a |\n|---|\n| x |\n| ^ |\n| ^ |\n| y |\n');
		// a row every column of which merged up keeps its tr
		expect(grid).toEqual([
			'head 0:a',
			'row  0:x+r3',
			'row  ',
			'row  ',
			'row  0:y',
		]);
	});

	test('> and ^ together merge a rectangle', () => {
		const { grid } = extended(
			'| a | b | c |\n|---|---|---|\n| x |>  | y |\n|^  |^  | z |\n'
		);
		expect(grid).toEqual([
			'head 0:a 1:b 2:c',
			'row  0:x+c2+r2 2:y',
			'row  2:z',
		]);
	});

	test('merges compose with header columns', () => {
		const { grid, meta } = extended(
			'| || spanning |> |\n|-----------||-----------|---|\n| left head || text | b |\n|^ || more |> |\n'
		);
		expect(meta?.header_columns).toEqual([1, 0]);
		expect(grid).toEqual([
			'head 0: 1:spanning+c2',
			'row  0:left head+r2 1:text 2:b',
			'row  1:more+c2',
		]);
	});

	test('a marker as the last cell before a linefeed or the end merges', () => {
		const { grid } = extended('| a | b |\n|---|---|\n| x |>');
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:x+c2']);
	});

	test('a > in the first column stays text', () => {
		const { grid } = extended('| a | b |\n|---|---|\n| > | y |\n');
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:> 1:y']);
	});

	test('a > never crosses a header column boundary', () => {
		const { grid } = extended('| a || b |>|\n|---||---|---|\n| x || > | y |\n');
		expect(grid).toEqual(['head 0:a 1:b+c2', 'row  0:x 1:> 2:y']);
	});

	test('a ^ under the header row stays text', () => {
		const { grid } = extended('| a | b |\n|---|---|\n| ^ | y |\n');
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:^ 1:y']);
	});

	test('a ^ in the header row stays text', () => {
		const { grid } = extended('| a | ^ |\n|---|---|\n');
		expect(grid).toEqual(['head 0:a 1:^']);
	});

	test('a cell with more than the marker stays text', () => {
		const { grid } = extended(
			'| a | b | c |\n|---|---|---|\n| x | > quote | >> |\n'
		);
		expect(grid[1]).toBe('row  0:x 1:> quote 2:>>');
	});

	test('an escaped marker stays text', () => {
		const { grid } = extended(
			'| a | b |\n|---|---|\n| x | \\> |\n| \\^ | y |\n'
		);
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:x 1:>', 'row  0:^ 1:y']);
	});

	test('a ^ under part of a wide cell stays text', () => {
		const { grid } = extended(
			'| a | b |\n|---|---|\n| x |>  |\n|^  | q |\n| y | ^ |\n'
		);
		expect(grid).toEqual([
			'head 0:a 1:b',
			'row  0:x+c2',
			'row  0:^ 1:q+r2',
			'row  0:y',
		]);
	});

	test('a > after a ^ stays text', () => {
		const { grid } = extended('| a | b |\n|---|---|\n| x | y |\n|^  |>  |\n');
		expect(grid).toEqual(['head 0:a 1:b', 'row  0:x+r2 1:y', 'row  1:>']);
	});
});

describe('unclosed delimiters revoked at a cell boundary', () => {
	test('`^2` stays literal without the trailing space', () => {
		const input = '| a |\n|---|\n| ^2 |\n';
		expect(print_ast(parse_markdown_svelte(input).nodes, input)).toBe(
			[
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "^2"',
			].join('\n')
		);
	});

	const cases: [string, string][] = [
		['| a |\n|---|\n| ^2 |\n', '^2'],
		['| a |\n|---|\n| ~2 |\n', '~2'],
		['| a |\n|---|\n| *2 |\n', '*2'],
		['| a |\n|---|\n| [2 |\n', '[2'],
		['| a |\n|---|\n| x ^2 y |\n', 'x ^2 y'],
		['| a |\n|---|\n| `2 |\n', '`2'],
		['| a |\n|---|\n| x ` |\n', 'x `'],
		['| a | b |\n|---|---|\n| ` x | y |\n', '` x|y'],
		['| a |\n|---|\n| x ` \nfoo\n', 'x `|foo'],
		['| a | b |\n|---|---|\n| ^2 | ~3\t|\n', '^2|~3'],
	];

	test.each(cases)('%j: batch, incremental and wire agree', (input, cells) => {
		const expected = cells.split('|');
		const batch = parse_markdown_svelte(input).nodes;
		const batch_ast = print_ast(batch, input);
		expect(data_cell_texts(batch, input)).toEqual(expected);
		for (const size of [1, 2, 3, 5]) {
			const inc = parse_incremental(input, size);
			expect(print_ast(inc, input)).toBe(batch_ast);
		}
		expect(data_cell_texts(parse_over_wire(input, 1), input)).toEqual(expected);
	});
});
