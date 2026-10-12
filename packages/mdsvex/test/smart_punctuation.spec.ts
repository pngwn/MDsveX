import { describe, it, expect } from 'vitest';
import { CompilerSession, compile, compile_inputs } from '../src/compile';
import type { TraceTarget } from '../src/compile';
import { smart_of } from '../src/smart_punctuation';

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

const SOURCE = '# It\'s "a" -- b...\n\n"c" `"d"` {"e"}\n';

describe('smart_punctuation', () => {
	it('is off by default', () => {
		const plain =
			"<h1>It's &quot;a&quot; -- b...</h1>" +
			'<p>&quot;c&quot; <code>&quot;d&quot;</code> {"e"}</p>';
		expect(compile(SOURCE).code).toBe(plain);
		expect(compile(SOURCE, { smart_punctuation: false }).code).toBe(plain);
		expect(
			compile(SOURCE, {
				smart_punctuation: { quotes: false, dashes: false, ellipses: false },
			}).code
		).toBe(plain);
	});

	it('true replaces quotes, dashes and ellipses in prose', () => {
		expect(compile(SOURCE, { smart_punctuation: true }).code).toBe(
			'<h1>It’s “a” – b…</h1><p>“c” <code>&quot;d&quot;</code> {"e"}</p>'
		);
	});

	it('an object turns a kind off or replaces the quotes', () => {
		expect(compile(SOURCE, { smart_punctuation: { dashes: false } }).code).toBe(
			'<h1>It’s “a” -- b…</h1><p>“c” <code>&quot;d&quot;</code> {"e"}</p>'
		);
		expect(
			compile('"a \'b\'"\n', {
				smart_punctuation: { quotes: ['„', '“', '‚', '‘'] },
			}).code
		).toBe('<p>„a ‚b‘“</p>');
	});

	it('every entry point renders the same text', () => {
		const html = compile(SOURCE, { smart_punctuation: true }).code;
		expect(
			compile(SOURCE, { smart_punctuation: true, sourcemap: true }).code
		).toBe(html);
		const session = new CompilerSession();
		const options = { smart_punctuation: true } as const;
		expect(session.compile(SOURCE, options).code).toBe(html);
		expect(session.compile(SOURCE, { ...options, sourcemap: true }).code).toBe(
			html
		);
	});

	it('the positional entry points take it in their trailing object', () => {
		const html = compile(SOURCE, { smart_punctuation: true }).code;
		const session = new CompilerSession();
		const options = { smart_punctuation: true } as const;
		const none = [
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		] as const;
		expect(session.compile_v3(SOURCE, 'a.md', ...none, options).code).toBe(
			html
		);
		expect(session.compile_trace(SOURCE, ...none, options).code).toBe(html);
	});

	it('the option does not outlive its compile in a session', () => {
		const session = new CompilerSession();
		session.compile(SOURCE, { smart_punctuation: true });
		expect(session.compile(SOURCE).code).toBe(compile(SOURCE).code);
	});

	it('the plugin path, one inputs object for every document', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.smart_punctuation = smart_of(true);
		const doc = target();
		session.compile_into('"a" -- b\n', inputs, doc);
		expect(doc.html).toBe('<p>“a” – b</p>');
		inputs.smart_punctuation = undefined;
		session.compile_into('"a" -- b\n', inputs, doc);
		expect(doc.html).toBe('<p>&quot;a&quot; -- b</p>');
	});

	it('a template wraps a document with the option', () => {
		const { code } = compile('"a" -- b\n', {
			smart_punctuation: true,
			templates: { default: { specifier: './T.svelte' } },
		});
		expect(code).toContain('<p>“a” – b</p>');
	});

	it('a heading id is made from the text as written', () => {
		const source = '# It\'s "a" -- b... c\n';
		const off = compile(source, { heading_ids: true }).code;
		const on = compile(source, {
			heading_ids: true,
			smart_punctuation: true,
		}).code;
		const id = /<h1 id="([^"]*)"/;
		expect(off.match(id)![1]).toBe('its-a----b-c');
		expect(on.match(id)![1]).toBe('its-a----b-c');
		expect(on).toContain('>It’s “a” – b… c</h1>');
	});

	it('a value that is not the option throws before the parse', () => {
		const bad: unknown[] = [
			'on',
			1,
			null,
			[],
			{ quotes: 'german' },
			{ quotes: ['a', 'b'] },
			{ quotes: ['a', 'b', 'c', 4] },
			{ dashes: 'em' },
			{ ellipses: 1 },
		];
		for (const value of bad)
			expect(() =>
				compile('a\n', { smart_punctuation: value as true })
			).toThrow('[mdsvex] smart_punctuation');
	});

	it('smart_of gives undefined for off', () => {
		expect(smart_of(undefined)).toBeUndefined();
		expect(smart_of(false)).toBeUndefined();
		expect(
			smart_of({ quotes: false, dashes: false, ellipses: false })
		).toBeUndefined();
		expect(smart_of(true)).toBe(true);
		const options = { dashes: false };
		expect(smart_of(options)).toBe(options);
	});
});
