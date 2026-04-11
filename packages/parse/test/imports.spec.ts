import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';

describe('import statements', () => {
	test('single import at start of document', () => {
		const input = 'import Component from "./Component.svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import Component from "./Component.svelte"'
		);
	});

	test('multiple imports', () => {
		const input =
			'import A from "./A.svelte"\nimport B from "./B.svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const imp1 = nodes.get_node(1);
		expect(imp1.kind).toBe('import_statement');
		expect(input.slice(imp1.value[0], imp1.value[1])).toBe(
			'import A from "./A.svelte"'
		);

		const imp2 = nodes.get_node(2);
		expect(imp2.kind).toBe('import_statement');
		expect(input.slice(imp2.value[0], imp2.value[1])).toBe(
			'import B from "./B.svelte"'
		);
	});

	test('import after frontmatter', () => {
		const input =
			'---\ntitle: hello\n---\nimport Component from "./Component.svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');

		const imp = nodes.get_node(2);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import Component from "./Component.svelte"'
		);
	});

	test('import after frontmatter with blank line between', () => {
		const input =
			'---\ntitle: hello\n---\n\nimport Component from "./Component.svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).toContain('import_statement');
	});

	test('import not allowed after other content', () => {
		const input = '# Hello\n\nimport Component from "./Component.svelte"\n';
		const { nodes } = parse_markdown_svelte(input);

		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).not.toContain('import_statement');
		// Should be parsed as a paragraph
		expect(kinds).toContain('paragraph');
	});

	test('import with destructured binding', () => {
		const input = 'import { onMount } from "svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import { onMount } from "svelte"'
		);
	});

	test('import with curly brace (no space)', () => {
		const input = 'import{onMount} from "svelte"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import{onMount} from "svelte"'
		);
	});

	test('import with namespace', () => {
		const input = 'import * as utils from "./utils"\n';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import * as utils from "./utils"'
		);
	});

	test('side-effect import', () => {
		const input = 'import "./styles.css"\n';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import "./styles.css"'
		);
	});

	test('import at EOF without trailing newline', () => {
		const input = 'import A from "./A.svelte"';
		const { nodes } = parse_markdown_svelte(input);

		const imp = nodes.get_node(1);
		expect(imp.kind).toBe('import_statement');
		expect(input.slice(imp.value[0], imp.value[1])).toBe(
			'import A from "./A.svelte"'
		);
	});

	test('word starting with import is not an import', () => {
		const input = 'important things to know\n';
		const { nodes } = parse_markdown_svelte(input);

		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).not.toContain('import_statement');
	});

	test('import NodeKind is findable', () => {
		const input = 'import A from "./A"\n';
		const { nodes } = parse_markdown_svelte(input);

		const imps = nodes.get_kinds(NodeKind.import_statement);
		expect(imps.length).toBe(1);
	});

	test('imports with blank lines between them', () => {
		const input =
			'import A from "./A"\n\nimport B from "./B"\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const imps = nodes.get_kinds(NodeKind.import_statement);
		expect(imps.length).toBe(2);
	});

	test('import not allowed after paragraph', () => {
		const input = 'Some text.\n\nimport A from "./A"\n';
		const { nodes } = parse_markdown_svelte(input);

		const imps = nodes.get_kinds(NodeKind.import_statement);
		expect(imps.length).toBe(0);
	});
});
