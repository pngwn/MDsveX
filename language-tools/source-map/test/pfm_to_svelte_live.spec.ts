import { describe, expect, it } from 'vitest';
import { svelte2tsx } from 'svelte2tsx';
import { create_highlight } from 'mdsvex/highlight';
import { default_languages } from 'mdsvex/highlight/languages';
import type { Mapping, MappingData } from '@mdsvex/render/mappings';

import { pfmToSvelte } from '../src/pfm_to_svelte';

const highlight = create_highlight({ languages: default_languages });

function src_of(source: string, m: Mapping<MappingData>) {
	return source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]);
}

function gen_of(code: string, m: Mapping<MappingData>) {
	const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
	return code.slice(m.generatedOffsets[0], m.generatedOffsets[0] + len);
}

const DOC = [
	'<script>',
	'  let some_val = 1;',
	'</script>',
	'',
	'```js',
	'function my_func() {',
	'  console.log({ a: {some_val} }) // [!eval ="{some_val}"]',
	'}',
	'```',
	'',
].join('\n');

describe('live expressions in code', () => {
	it('each maps one to one with every capability', () => {
		const r = pfmToSvelte(DOC, { compile: { highlight } });
		expect(r.diagnostics).toEqual([]);
		const live = r.mappings.filter(
			(m) =>
				src_of(DOC, m) === '{some_val}' && gen_of(r.code, m) === '{some_val}'
		);
		expect(live).toHaveLength(1);
		expect(live[0].data).toMatchObject({
			verification: true,
			completion: true,
			semantic: true,
			navigation: true,
			role: 'content',
		});
		const g = live[0].generatedOffsets[0];
		const over = r.mappings.filter((m) => {
			if (m.data.role !== 'content') return false;
			const start = m.generatedOffsets[0];
			const end = start + (m.generatedLengths?.[0] ?? m.lengths[0]);
			return start < g + 10 && end > g;
		});
		expect(over).toEqual(live);
	});

	it('svelte2tsx reads it as a reference', () => {
		const r = pfmToSvelte(DOC, { compile: { highlight } });
		const tsx = svelte2tsx(r.code, { filename: 'doc.svelte', mode: 'ts' }).code;
		expect(tsx).toMatch(/\bsome_val\b[^]*\bsome_val\b/);
		expect(tsx).not.toContain('my_func');
	});

	it('a half typed live expression is a diagnostic, the document still converts', () => {
		const doc = DOC.replace(
			'console.log',
			'f({some_val) // [!eval]\n  console.log'
		);
		const r = pfmToSvelte(doc, { compile: { highlight } });
		expect(r.diagnostics).toHaveLength(1);
		const [d] = r.diagnostics;
		expect(d.severity).toBe('error');
		expect(d.message).toMatch(/must close on its line/);
		expect(doc.slice(d.start, d.start + 4)).toBe('{som');
		expect(r.code).toContain('<pre><code');
	});

	it('without highlight nothing is live', () => {
		const r = pfmToSvelte(DOC);
		expect(r.code).not.toContain('{some_val}');
	});
});
