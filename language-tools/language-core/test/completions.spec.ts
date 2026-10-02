import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
	completion_context,
	probe_for,
	props_of,
	template_named,
} from '../src/completions';
import { project } from './ts_harness';

/** the context at | in marked, with its range as text */
function at(marked: string) {
	const offset = marked.indexOf('|');
	const source = marked.replace('|', '');
	const fm = source.startsWith('---\n')
		? { start: 4, end: source.indexOf('\n---', 4) + 1 }
		: null;
	const ctx = completion_context(source, offset, fm);
	if (ctx === null) return null;
	const { range, ...rest } = ctx;
	return { ...rest, text: source.slice(range.start, range.end) };
}

describe('completion_context', () => {
	it('finds the template value', () => {
		expect(at('---\ntemplate: do|cs\n---\n')).toEqual({
			kind: 'template',
			text: 'docs',
		});
	});

	it('finds a frontmatter key being typed, leaving out keys already written', () => {
		expect(at('---\ntitle: x\ndr|\nlevel: 1\n---\n')).toEqual({
			kind: 'frontmatter_key',
			text: 'dr',
			existing: ['title', 'level'],
		});
		expect(at('---\n|\n---\n')).toMatchObject({
			kind: 'frontmatter_key',
			text: '',
		});
		// a key with its colon takes a value, a nested line takes nothing
		expect(at('---\ndr|aft: x\n---\n')).toBeNull();
		expect(at('---\nnested:\n  de|\n---\n')).toBeNull();
	});

	it('finds a frontmatter value, up to a comment', () => {
		expect(at('---\nlevel: beg|inner # x\n---\n')).toEqual({
			kind: 'frontmatter_value',
			key: 'level',
			text: 'beginner',
		});
		expect(at('---\nlevel: |\n---\n')).toEqual({
			kind: 'frontmatter_value',
			key: 'level',
			text: '',
		});
	});

	it('finds a directive arg name or value, leaving out args already given', () => {
		expect(at(':::Note[x](tone=info, si|)')).toEqual({
			kind: 'arg_key',
			directive: 'Note',
			inline: false,
			text: 'si',
			existing: ['tone'],
		});
		expect(at('see :kbd[x](|) here')).toMatchObject({
			kind: 'arg_key',
			directive: 'kbd',
			inline: true,
		});
		expect(at(':::Note[a [b] c](tone="in|fo", x=y)')).toEqual({
			kind: 'arg_value',
			directive: 'Note',
			key: 'tone',
			text: '"info"',
		});
		// before the args or in a link there is nothing to complete
		expect(at(':::No|te[x](tone=info)')).toBeNull();
		expect(at('[link](/ur|l)')).toBeNull();
	});
});

describe('template_named', () => {
	const named = (fm: string) =>
		template_named(fm, { start: 0, end: fm.length });
	it('reads the template the frontmatter names as text', () => {
		expect(named('title: x\ntemplate: docs # main\n')).toBe('docs');
		expect(named("template: 'docs'\n")).toBe('docs');
		expect(named('template: false\n')).toBe(false);
		expect(named('template:\n')).toBeUndefined();
		expect(named('title: x\n')).toBeUndefined();
	});
});

describe('props_of', () => {
	it('reads the props of each probe, with their literal values and docs', () => {
		const p = project({
			'src/T.svelte': [
				'<script lang="ts">',
				"  import type { Snippet } from 'svelte';",
				'  interface Props {',
				'    /** shown as the page heading */',
				'    title: string;',
				"    level?: 'beginner' | 'advanced';",
				'    draft?: boolean;',
				'    children: Snippet;',
				'  }',
				'  let p: Props = $props();',
				'</script>',
				'',
			].join('\n'),
			'src/doc.svx': '# x\n',
		});
		try {
			p.write(
				'node_modules/.mdsvex/manifest.json',
				JSON.stringify({
					version: 1,
					root: p.root,
					extensions: ['.svx'],
					component_mode: 'markdown',
					frontmatter_parse: false,
					directive_plugins: false,
					select_template: false,
					templates: {
						t: {
							id: 'mdsvex:template/t',
							file: p.path('src/T.svelte'),
							components: [],
							extra: null,
							directives: [],
						},
					},
					components: [],
					directives: [],
					documents: {},
				})
			);
			const doc = p.path('src/doc.svx');
			// the document has no template, its probe still holds the props
			expect(p.diagnostics('src/doc.svx')).toEqual([]);
			const probe = probe_for(
				[{ kind: 'template', name: 't', alias: '__mdsvex_props_0' }],
				'template',
				't',
				undefined
			)!;
			const props = props_of(ts, p.program(), doc, probe.alias)!;
			expect(props.map((x) => [x.name, x.optional, x.values])).toEqual([
				['title', false, []],
				['level', true, ['beginner', 'advanced']],
				['draft', true, ['false', 'true']],
				['children', false, []],
			]);
			expect(props[0]).toMatchObject({
				type: 'string',
				documentation: 'shown as the page heading',
			});
			expect(props_of(ts, p.program(), doc, '__mdsvex_props_9')).toBeNull();
		} finally {
			p.dispose();
		}
	});
});

describe('probe_for', () => {
	const probes = [
		{ kind: 'directive' as const, name: 'Note', alias: 'a' },
		{ kind: 'directive' as const, name: 'Note', template: 'docs', alias: 'b' },
	];
	it('prefers a directive in the scope of the template to the root', () => {
		expect(probe_for(probes, 'directive', 'Note', 'docs')?.alias).toBe('b');
		expect(probe_for(probes, 'directive', 'Note', 'blog')?.alias).toBe('a');
		expect(probe_for(probes, 'directive', 'Note', undefined)?.alias).toBe('a');
	});
});
