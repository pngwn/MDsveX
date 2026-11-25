import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { stream_harness } from '../src/workers/stream_harness';

const compiles = (source: string) =>
	compile(source, { generate: 'client', filename: 'Stream.svelte' }).js.code;

describe('the stream harness', () => {
	it('builds no highlighter when highlight is off', () => {
		const source = stream_harness('App.svx', {}, [], false, null);
		expect(source).not.toContain('mdsvex/highlight');
		expect(source).not.toContain('create_highlight');
		expect(() => compiles(source)).not.toThrow();
	});

	it('loads the languages the document names and hands the highlighter to every node', () => {
		const source = stream_harness('App.svx', {}, [], false, {
			options: {
				languages: { mine: 'typescript' },
				annotations: ['hl', 'shiki_notation'],
				line_numbers: true,
			},
			languages: ['typescript', 'css'],
		});
		expect(source).toContain(`from 'mdsvex/highlight'`);
		expect(source).toContain('const language_names = ["typescript","css"];');
		expect(source).toContain('"line_numbers":true');
		expect(source).toContain('{highlight} plugin_data={data}');
		expect(() => compiles(source)).not.toThrow();
	});

	it('loads no math library when the document has no math', () => {
		const source = stream_harness('App.svx', {}, [], false, null, null);
		expect(source).not.toContain('mdsvex/math');
		expect(source).not.toContain('load_math');
		expect(() => compiles(source)).not.toThrow();
	});

	it('loads temml with the options of the config and hands the renderer to every node', () => {
		const source = stream_harness('App.svx', {}, [], false, null, {
			options: { macros: { '\\RR': '\\mathbb{R}' } },
		});
		expect(source).toContain(`from 'mdsvex/math'`);
		expect(source).toContain(
			'load_math({ options: {"macros":{"\\\\RR":"\\\\mathbb{R}"}} })'
		);
		expect(source).toContain('plugin_data={data} {math} />');
		expect(() => compiles(source)).not.toThrow();
	});

	it('shows katex math as its latex, as the compile here does', () => {
		const source = stream_harness('App.svx', {}, [], false, null, {
			renderer: 'katex',
		});
		expect(source).toContain('math = source_math;');
		expect(source).not.toContain('load_math(');
		expect(() => compiles(source)).not.toThrow();
	});
});
