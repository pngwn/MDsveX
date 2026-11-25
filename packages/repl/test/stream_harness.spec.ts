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
});
