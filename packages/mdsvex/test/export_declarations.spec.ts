import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { read_exports } from '../src/read_exports';

/** the names typescript reads from the exports of js */
function oracle(js: string): string[] {
	const sf = ts.createSourceFile('x.js', js, ts.ScriptTarget.Latest);
	const out: string[] = [];
	const bound = (n: ts.BindingName) => {
		if (ts.isIdentifier(n)) out.push(n.text);
		else
			for (const e of n.elements) if (!ts.isOmittedExpression(e)) bound(e.name);
	};
	for (const s of sf.statements) {
		if (ts.isExportDeclaration(s) && s.exportClause) {
			const c = s.exportClause;
			if (ts.isNamespaceExport(c)) out.push(c.name.text);
			else for (const e of c.elements) out.push(e.name.text);
		} else if (
			ts.isVariableStatement(s) &&
			s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
		)
			for (const d of s.declarationList.declarations) bound(d.name);
	}
	return out;
}

describe('export const, let and var', () => {
	test.each([
		['export const p = P,\n\th1 = H1;', ['p', 'h1']],
		['export let a = 1, b;', ['a', 'b']],
		['export const { x, y: z } = parts;', ['x', 'z']],
		['export const [ , d] = x;', ['d']],
		['export const [...r] = x, {...o} = y;', ['r', 'o']],
		['export const { [k]: v, "s": w, 1: one } = x;', ['v', 'w', 'one']],
		['export const { a: { b }, c = { d: 1, e: [2, 3] } } = x;', ['b', 'c']],
		[
			'export const f = () => { return /,/.test(a, b); }, g = `${h, i}`, j = 2\nexport const k = 3',
			['f', 'g', 'j', 'k'],
		],
		['export const a = 1\nfoo(), bar()\nexport { a as b }', ['a', 'b']],
		['export const a = x\n/ 2 / y, b = 1', ['a', 'b']],
		[
			"const s = 'export const fake = 1';\nexport const real = 1, also = 2;",
			['real', 'also'],
		],
		['if (x) /[(]/.test(y);\nexport const a = 1, b = 2;', ['a', 'b']],
	])('%j', (code, names) => {
		expect(read_exports(code, 'js').names).toEqual(names);
	});

	test('keeps the order of every other export', () => {
		expect(
			read_exports(
				"export default 1;\nexport const q = 1, r = 2;\nexport function s() {}\nexport * as t from './t.js';",
				'js'
			).names
		).toEqual(['default', 'q', 'r', 's', 't']);
	});

	test('agrees with typescript on generated declarations', () => {
		const patterns = [
			'a',
			'{ b, c: d }',
			'[e, , f]',
			'{ g = 1, ...h }',
			'[[i], { j: [k] }]',
			'{ [key]: l, "m": n }',
			'[...o]',
		];
		const values = [
			'1',
			'x / 2 / y',
			'/[,}]/g',
			'`a${b, `c${d}`}e`',
			'() => { return [1, 2], { a: 3 }; }',
			'f(\'a,b\', "c,d") // a, comment\n',
			'{ a: [1, { b: 2 }], c }',
			'function () { if (x) /[(]/.test(y); }',
			'a ? b : c',
			'class { m() { return 1, 2; } }',
		];
		let seed = 7;
		const pick = <T>(list: T[]) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return list[seed % list.length];
		};
		for (let round = 0; round < 300; round++) {
			let n = 0;
			const rename = (p: string) => p.replace(/[a-o](?![\w'"])/g, (m) => m + n);
			const declarators = [];
			for (let k = 1 + (round % 3); k > 0; k--, n++)
				declarators.push(`${rename(pick(patterns))} = ${pick(values)}`);
			const end = pick([';', '\n', ';\n', '\n\n']);
			const code =
				`const before = ${pick(values)};\n` +
				`export ${pick(['const', 'let', 'var'])} ${declarators.join(pick([', ', ',\n\t']))}${end}` +
				`export const after = ${pick(values)}\n`;
			const syntax = ts.transpileModule(code, {
				reportDiagnostics: true,
				fileName: 'x.js',
			}).diagnostics;
			expect(syntax, code).toEqual([]);
			expect(read_exports(code, 'js').names, code).toEqual(oracle(code));
		}
	});
});
