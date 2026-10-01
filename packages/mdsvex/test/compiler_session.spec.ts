import { describe, expect, test } from 'vitest';
import { compile, CompilerSession, _shared_session } from '../src/main';
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
		const options = { parse_plugins: [plugin], sourcemap: true };
		const compiler = new CompilerSession();

		expect(compiler.compile(documents[0], options)).toEqual(
			compile(documents[0], options)
		);
		expect(compiler.compile(documents[1], { sourcemap: true })).toEqual(
			compile(documents[1], { sourcemap: true })
		);
	});

	test('one-shot compile matches a fresh session per document', () => {
		const many_nodes = '- item *a*\n'.repeat(15000);
		const long_source = 'word '.repeat(120000) + '\n';
		const sequence = [
			'# ` ',
			'a\n~~~\nb',
			...documents,
			many_nodes,
			...documents,
			long_source,
			'',
			...documents.map((source) => source.replace(/\n/g, '\r\n')),
			'# ` ',
			'a\n~~~\nb',
		];

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

	test('the shared session drops a large arena and never sees a long source', () => {
		compile(documents[0]);
		const small = _shared_session()!.capacity;
		expect(small).toBeGreaterThan(0);

		compile('- item *a*\n'.repeat(15000), { sourcemap: true });
		expect(_shared_session()).toBe(null);

		compile(documents[0]);
		expect(_shared_session()!.capacity).toBe(small);

		compile('word '.repeat(120000) + '\n');
		expect(_shared_session()!.capacity).toBe(small);
	});

	test('the shared session holds no document after a compile', () => {
		const source =
			'# Title\n\n[link](https://example.com/a/long/path) and <b>html</b>\n';
		compile(source, { sourcemap: true });
		const session = _shared_session() as any;

		expect(session.parser.source).toBe('');
		expect(session.parser.ref_map.size).toBe(0);
		expect(session.tree.get_buffer().size).toBe(1);
		expect(session.renderer.html).toBe('');
		expect(session.renderer.out.length).toBe(0);
		expect(session.renderer.cursor.src).toBe('');
	});

	test('a throwing compile drops the shared session', () => {
		compile(documents[0]);
		expect(_shared_session()).not.toBe(null);
		const bad = { length: 3 } as unknown as string;
		expect(() => compile(bad)).toThrow();
		expect(_shared_session()).toBe(null);
		expect(compile(documents[1])).toEqual(
			new CompilerSession().compile(documents[1])
		);
	});
});
