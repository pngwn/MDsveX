import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
	get_all_child_kinds,
	get_child_range,
	get_content,
	print_all_nodes,
} from './utils';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(
	this_dir,
	'../../pfm-tests/tests/emphasis_and_strong_emphasis'
);

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('emphasis and strong emphasis', () => {
	// strong emphasis
	test('pfm example 350', () => {
		const input = load_fixture('350');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const strong_emphasis = nodes.get_node(paragraph.children[0]);
		const text = nodes.get_node(strong_emphasis.children[0]);

		// root(1) + paragraph(1) + strong_emphasis(1) + text(1) + line_break(1) = 5
		expect(nodes.size).toBe(5);
		expect(paragraph.kind).toBe('paragraph');
		expect(strong_emphasis.kind).toBe('strong_emphasis');
		expect(text.kind).toBe('text');

		const paragraph_content = get_content(nodes, paragraph.index, input);
		expect(paragraph_content.content).toBe(input.trim());
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'strong_emphasis',
		]);

		const strong_emphasis_content = get_content(
			nodes,
			strong_emphasis.index,
			input
		);
		expect(strong_emphasis_content.content).toBe(input.trim());
		expect(get_all_child_kinds(nodes, strong_emphasis.index)).toEqual(['text']);

		expect(strong_emphasis.start).toBe(paragraph.start);
		expect(strong_emphasis.end).toBe(paragraph.end);

		const text_content = get_content(nodes, text.index, input);
		expect(text_content.content).toBe('foo bar');
		expect(text_content.value).toEqual('foo bar');
	});

	//text
	test('pfm example 351', () => {
		const input = load_fixture('351');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);

		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		// +1 for trailing line_break
		expect(nodes.size).toBe(6);
		expect(paragraph.kind).toBe('paragraph');

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('a * foo bar*');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);
	});

	//text
	test('pfm example 352', () => {
		const input = load_fixture('352');
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		// +1 for trailing line_break
		expect(nodes.size).toBe(6);
		expect(paragraph.kind).toBe('paragraph');

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('a*"foo"*');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		const emphasis = nodes.get_node(paragraph.children[0]);
		const emphasis_content = get_content(nodes, emphasis.index, input);
		const emphasis_child_content = get_child_range(
			nodes,
			emphasis.index,
			input
		);
	});

	//text
	test('pfm example 353', () => {
		const input = load_fixture('353');
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();

		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		// +1 for trailing line_break
		expect(nodes.size).toBe(5);
		expect(paragraph.kind).toBe('paragraph');

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'strong_emphasis',
		]);

		expect(paragraph_child_content.content).toBe('* a *');

		const strong_emphasis = nodes.get_node(paragraph.children[0]);
		const strong_emphasis_content = get_content(
			nodes,
			strong_emphasis.index,
			input
		);
		const strong_emphasis_child_content = get_child_range(
			nodes,
			strong_emphasis.index,
			input
		);

		expect(strong_emphasis.kind).toBe('strong_emphasis');
		expect(strong_emphasis_content.content).toBe(input.trim());
		expect(get_all_child_kinds(nodes, strong_emphasis.index)).toEqual(['text']);

		expect(strong_emphasis_child_content.content).toBe(' a ');
	});

	//text
	test('pfm example 354', () => {
		const input = load_fixture('354');
		const { nodes } = parse_markdown_svelte(input);
		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const [p1, p2, p3] = p_kinds;
		const paragraph_one = nodes.get_node(p1);
		const paragraph_one_content = get_content(nodes, p1, input);
		const paragraph_child_content = get_child_range(nodes, p1, input);

		// expect(nodes.size).toBe(13);
		expect(paragraph_one.kind).toBe('paragraph');

		expect(paragraph_one_content.content).toBe('*$*alpha.');
		expect(paragraph_child_content.content).toBe('*$*alpha.');
		expect(paragraph_child_content.content).toBe('*$*alpha.');
		expect(get_all_child_kinds(nodes, p1)).toEqual(['text', 'text', 'text']);

		const paragraph_two = nodes.get_node(p2);
		const paragraph_two_content = get_content(nodes, p2, input);
		const paragraph_two_child_content = get_child_range(nodes, p2, input);

		expect(paragraph_two.kind).toBe('paragraph');
		expect(paragraph_two_content.content).toBe('*£*bravo.');
		expect(paragraph_two_child_content.content).toBe('*£*bravo.');
		expect(get_all_child_kinds(nodes, p2)).toEqual(['text', 'text', 'text']);

		const paragraph_three = nodes.get_node(p3);
		const paragraph_three_content = get_content(nodes, p3, input);
		const paragraph_three_child_content = get_child_range(nodes, p3, input);

		expect(paragraph_three.kind).toBe('paragraph');
		expect(paragraph_three_content.content).toBe('*€*charlie.');
		expect(paragraph_three_child_content.content).toBe('*€*charlie.');
		expect(get_all_child_kinds(nodes, p3)).toEqual(['text', 'text', 'text']);
	});

	//text
	test('pfm example 355', () => {
		const input = load_fixture('355');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('foo*bar*');
	});

	//text
	test('pfm example 356', () => {
		const input = load_fixture('356');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('5*6*78');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);
	});

	//emphasis
	test.todo('pfm example 357', () => {
		const input = load_fixture('357');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 358', () => {
		const input = load_fixture('358');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 359', () => {
		const input = load_fixture('359');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 360', () => {
		const input = load_fixture('360');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 361', () => {
		const input = load_fixture('361');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 362', () => {
		const input = load_fixture('362');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 363', () => {
		const input = load_fixture('363');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 364', () => {
		const input = load_fixture('364');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 365', () => {
		const input = load_fixture('365');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test('pfm example 366', () => {
		const input = load_fixture('366');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('*foo bar *');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);
	});

	//strong emphasis
	test('pfm example 367', () => {
		const input = load_fixture('367');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('*foo bar\n*');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);
	});

	//text
	test('pfm example 368', () => {
		const input = load_fixture('368');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);

		expect(paragraph_child_content.content).toBe('*(*foo)');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'text',
			'text',
			'text',
		]);
	});

	// strong_emphasis
	test('pfm example 369', () => {
		const input = load_fixture('369');
		const { nodes } = parse_markdown_svelte(input);
		print_all_nodes(nodes, input);
		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const paragraph_content = get_content(nodes, paragraph.index, input);
		const paragraph_child_content = get_child_range(
			nodes,
			paragraph.index,
			input
		);

		expect(paragraph.kind).toBe('paragraph');
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'strong_emphasis',
		]);

		expect(paragraph_content.content).toBe(input.trim());
		expect(paragraph_child_content.content).toBe(input.trim());

		expect(paragraph.start).toBe(0);
		expect(paragraph.start).toBe(paragraph_child_content.start);
		expect(paragraph.end).toBe(paragraph_child_content.end);
	});

	//text
	test.todo('pfm example 370', () => {
		const input = load_fixture('370');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 371', () => {
		const input = load_fixture('371');
		const { nodes } = parse_markdown_svelte(input);
	});

	//text
	test.todo('pfm example 372', () => {
		const input = load_fixture('372');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 373', () => {
		const input = load_fixture('373');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 374', () => {
		const input = load_fixture('374');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 375', () => {
		const input = load_fixture('375');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 376', () => {
		const input = load_fixture('376');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 377', () => {
		const input = load_fixture('377');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 378', () => {
		const input = load_fixture('378');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 379', () => {
		const input = load_fixture('379');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 380', () => {
		const input = load_fixture('380');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 381', () => {
		const input = load_fixture('381');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 382', () => {
		const input = load_fixture('382');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 383', () => {
		const input = load_fixture('383');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 384', () => {
		const input = load_fixture('384');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 385', () => {
		const input = load_fixture('385');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 386', () => {
		const input = load_fixture('386');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 387', () => {
		const input = load_fixture('387');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 388', () => {
		const input = load_fixture('388');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 389', () => {
		const input = load_fixture('389');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 390', () => {
		const input = load_fixture('390');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 391', () => {
		const input = load_fixture('391');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 392', () => {
		const input = load_fixture('392');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 393', () => {
		const input = load_fixture('393');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 394', () => {
		const input = load_fixture('394');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 395', () => {
		const input = load_fixture('395');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 396', () => {
		const input = load_fixture('396');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 397', () => {
		const input = load_fixture('397');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 398', () => {
		const input = load_fixture('398');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 399', () => {
		const input = load_fixture('399');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 400', () => {
		const input = load_fixture('400');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 401', () => {
		const input = load_fixture('401');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 402', () => {
		const input = load_fixture('402');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 403', () => {
		const input = load_fixture('403');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 404', () => {
		const input = load_fixture('404');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 405', () => {
		const input = load_fixture('405');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 406', () => {
		const input = load_fixture('406');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 407', () => {
		const input = load_fixture('407');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 408', () => {
		const input = load_fixture('408');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 409', () => {
		const input = load_fixture('409');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 410', () => {
		const input = load_fixture('410');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 411', () => {
		const input = load_fixture('411');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 412', () => {
		const input = load_fixture('412');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 413', () => {
		const input = load_fixture('413');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 414', () => {
		const input = load_fixture('414');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 415', () => {
		const input = load_fixture('415');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 416', () => {
		const input = load_fixture('416');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 417', () => {
		const input = load_fixture('417');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 418', () => {
		const input = load_fixture('418');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 419', () => {
		const input = load_fixture('419');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 420', () => {
		const input = load_fixture('420');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 421', () => {
		const input = load_fixture('421');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 422', () => {
		const input = load_fixture('422');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 423', () => {
		const input = load_fixture('423');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 424', () => {
		const input = load_fixture('424');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 425', () => {
		const input = load_fixture('425');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 426', () => {
		const input = load_fixture('426');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 427', () => {
		const input = load_fixture('427');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 428', () => {
		const input = load_fixture('428');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 429', () => {
		const input = load_fixture('429');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 430', () => {
		const input = load_fixture('430');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 431', () => {
		const input = load_fixture('431');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 432', () => {
		const input = load_fixture('432');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 433', () => {
		const input = load_fixture('433');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text
	test.todo('pfm example 434', () => {
		const input = load_fixture('434');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 435', () => {
		const input = load_fixture('435');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 436', () => {
		const input = load_fixture('436');
		const { nodes } = parse_markdown_svelte(input);
	});

	//	 strong emphasis
	test.todo('pfm example 437', () => {
		const input = load_fixture('437');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 438', () => {
		const input = load_fixture('438');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 439', () => {
		const input = load_fixture('439');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 440', () => {
		const input = load_fixture('440');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 441', () => {
		const input = load_fixture('441');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 442', () => {
		const input = load_fixture('442');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 443', () => {
		const input = load_fixture('443');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 444', () => {
		const input = load_fixture('444');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 445', () => {
		const input = load_fixture('445');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 446', () => {
		const input = load_fixture('446');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 447', () => {
		const input = load_fixture('447');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 448', () => {
		const input = load_fixture('448');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 449', () => {
		const input = load_fixture('449');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 450', () => {
		const input = load_fixture('450');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 451', () => {
		const input = load_fixture('451');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 452', () => {
		const input = load_fixture('452');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 453', () => {
		const input = load_fixture('453');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 454', () => {
		const input = load_fixture('454');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 455', () => {
		const input = load_fixture('455');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 456', () => {
		const input = load_fixture('456');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 457', () => {
		const input = load_fixture('457');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 458', () => {
		const input = load_fixture('458');
		const { nodes } = parse_markdown_svelte(input);
	});

	// emphasis
	test.todo('pfm example 459', () => {
		const input = load_fixture('459');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 460', () => {
		const input = load_fixture('460');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 461', () => {
		const input = load_fixture('461');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 462', () => {
		const input = load_fixture('462');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 463', () => {
		const input = load_fixture('463');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 464', () => {
		const input = load_fixture('464');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 465', () => {
		const input = load_fixture('465');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 466', () => {
		const input = load_fixture('466');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 467', () => {
		const input = load_fixture('467');
		const { nodes } = parse_markdown_svelte(input);
	});

	//  emphasis
	test.todo('pfm example 468', () => {
		const input = load_fixture('468');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	test.todo('pfm example 469', () => {
		const input = load_fixture('469');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis + emphasis
	test.todo('pfm example 470', () => {
		const input = load_fixture('470');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	// TODO: understand semantic meaning
	test.todo('pfm example 471', () => {
		const input = load_fixture('471');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis
	// TODO: understand semantic meaning
	test.todo('pfm example 472', () => {
		const input = load_fixture('472');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + url
	// TODO: implement when we have link support
	test.todo('pfm example 473', () => {
		const input = load_fixture('473');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + url
	// TODO: implement when we have link support
	test.todo('pfm example 474', () => {
		const input = load_fixture('474');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + image
	// TODO: implement when we have image support
	test.todo('pfm example 475', () => {
		const input = load_fixture('475');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + autolink
	// TODO: implement when we have autolink support
	test.todo('pfm example 476', () => {
		const input = load_fixture('476');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + autolink
	// TODO: implement when we have autolink support
	test.todo('pfm example 477', () => {
		const input = load_fixture('477');
		const { nodes } = parse_markdown_svelte(input);
	});

	// strong emphasis + code span
	test.todo('pfm example 478', () => {
		const input = load_fixture('478');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + autolink
	// TODO: implement when we have autolink support
	test.todo('pfm example 479', () => {
		const input = load_fixture('479');
		const { nodes } = parse_markdown_svelte(input);
	});

	// text + autolink
	// TODO: implement when we have autolink support
	test.todo('pfm example 480', () => {
		const input = load_fixture('480');
		const { nodes } = parse_markdown_svelte(input);
	});
});
