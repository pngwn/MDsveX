import { describe, expect, test } from 'vitest';

import { compile, CompilerSession, LinkReferenceError } from '../src/main';

const caught = (source: string, filename?: string): LinkReferenceError => {
	try {
		compile(source, { filename });
	} catch (e) {
		return e as LinkReferenceError;
	}
	throw new Error('the compile did not throw');
};

describe('link references', () => {
	test('a definition below the reference resolves it', () => {
		expect(compile('[x][a] and [a][]\n\n[a]: /u "t"\n').code).toBe(
			'<p><a href="/u" title="t">x</a> and <a href="/u" title="t">a</a></p>'
		);
	});

	test('a definition below an image resolves it', () => {
		expect(compile('![alt][a]\n\n[a]: /i.png\n').code).toContain(
			'src="/i.png"'
		);
	});

	test('a reference with no definition is a LinkReferenceError at the reference', () => {
		const e = caught(
			'# t\n\ntext [x][nope] and [y][a]\n\n[a]: /u\n',
			'doc.svx'
		);
		expect(e).toBeInstanceOf(LinkReferenceError);
		expect(e.name).toBe('LinkReferenceError');
		expect(e.code).toBe('reference_undefined');
		expect(e.label).toBe('nope');
		expect([e.line, e.column]).toEqual([3, 6]);
		expect(e.message).toBe(
			'the reference [x][nope] has no definition, add `[nope]: url`, or escape the bracket as `\\[x][nope]` if it is not a reference (doc.svx:3)'
		);
	});

	test('it lists every such reference of the document, in its order', () => {
		const e = caught('[a][]\n\n![y][b] [z][c]\n\n[c]: /u\n');
		expect(e.problems).toEqual([
			{ code: 'reference_undefined', label: 'a', line: 1, column: 1 },
			{ code: 'reference_undefined', label: 'b', line: 3, column: 1 },
		]);
	});

	test('the message escapes an image at its bracket', () => {
		expect(caught('![y][b]\n').message).toContain('`!\\[y][b]`');
	});

	test('two index brackets in prose are one, escaped or in code they are not', () => {
		expect(caught('the cell m[0][1] holds\n').label).toBe('1');
		expect(compile('the cell m\\[0][1] or `m[0][1]` holds\n').code).toBe(
			'<p>the cell m[0][1] or <code>m[0][1]</code> holds</p>'
		);
	});

	test('a session throws it too, and compiles the next document', () => {
		const session = new CompilerSession();
		expect(() => session.compile('[x][a]\n')).toThrow(LinkReferenceError);
		expect(session.compile('[x][a]\n\n[a]: /u\n').code).toBe(
			'<p><a href="/u">x</a></p>'
		);
		expect(session.compile('plain\n').code).toBe('<p>plain</p>');
	});
});
