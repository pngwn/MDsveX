import { describe, expect, test } from 'vitest';
import { compile, CompilerSession } from '../src/main';
import type { ParsePlugin } from '../src/main';

const documents = [
	'# Heading\n\nA paragraph with *emphasis* and [a link](https://example.com).\n',
	'| left | right |\n| :--- | ---: |\n| one | two |\n',
	'```ts\nconst value = 1;\n```\n\n<section>{value}</section>\n',
	'short\n',
];

describe('CompilerSession', () => {
	test('matches one-shot HTML and mappings across sequential documents', () => {
		const compiler = new CompilerSession();

		for (let pass = 0; pass < 4; pass++) {
			for (const source of documents) {
				expect(compiler.compile(source)).toEqual(compile(source));
				expect(compiler.compile(source, { sourcemap: true })).toEqual(
					compile(source, { sourcemap: true })
				);
			}
		}
	});

	test('matches one-shot output for CRLF sources', () => {
		const compiler = new CompilerSession();
		const crlf = documents.map((source) => source.replace(/\n/g, '\r\n'));

		for (const source of [...crlf, ...documents, ...crlf]) {
			expect(compiler.compile(source)).toEqual(compile(source));
			expect(compiler.compile(source, { sourcemap: true })).toEqual(
				compile(source, { sourcemap: true })
			);
		}
	});

	test('does not mutate a prior result when its arena is reset', () => {
		const compiler = new CompilerSession();
		const first = compiler.compile(documents[0], { sourcemap: true });
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compiler.compile(documents[i % documents.length], { sourcemap: true });
		}

		expect(first).toEqual(snapshot);
	});

	test('falls back safely for source-bound plugins', () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = 'session-heading';
				},
			},
		};
		const options = { parsePlugins: [plugin], sourcemap: true };
		const compiler = new CompilerSession();

		expect(compiler.compile(documents[0], options)).toEqual(
			compile(documents[0], options)
		);
		expect(compiler.compile(documents[1], { sourcemap: true })).toEqual(
			compile(documents[1], { sourcemap: true })
		);
	});

	test('one-shot compile matches a fresh session per document', () => {
		// one-shot compile shares a module-level session, so check it against
		// sessions that have never seen another document, the big one passes
		// the node cap so the session is dropped and rebuilt
		const big = '- item *a*\n'.repeat(15000);
		const sequence = [...documents, big, ...documents, '', ...documents];

		for (const source of sequence) {
			for (const sourcemap of [false, true]) {
				const expected = new CompilerSession().compile(source, { sourcemap });
				expect(compile(source, { sourcemap })).toEqual(expected);
			}
		}
	});

	test('one-shot results survive later one-shot compiles', () => {
		const first = compile(documents[0], { sourcemap: true });
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compile(documents[i % documents.length], { sourcemap: true });
		}

		expect(first).toEqual(snapshot);
	});
});
