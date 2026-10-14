// a browser host like the playground loads these entries as they are
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const packages = resolve(pkg, '..');

const ENTRIES = ['compile.ts', 'math.ts', 'highlight.ts', 'host.ts'];

// bundled into compile.js, so their sources are walked
const WORKSPACE: Record<string, string> = {
	'@mdsvex/parse': join(packages, 'parse'),
	'@mdsvex/render': join(packages, 'render'),
};

// each runs in a browser, add one only once the bundle test passes with it
const ALLOWED = [
	/^@twinkleplop\//,
	/^temml$/,
	/^katex$/,
	/^es-module-lexer\/js$/,
];

const BANNED = [/^vite(\/|$)/, /^rollup(\/|$)/, /^@rollup\//, /^node:/];
const NODE_GLOBALS = new Set([
	'process',
	'Buffer',
	'__dirname',
	'__filename',
	'require',
	'module',
	'global',
]);
const META_GLOBALS = new Set(['env', 'hot']);

type Finding = { file: string; line: number; what: string };

const posix = (path: string) => path.replace(/\\/g, '/');

function resolve_workspace(spec: string): string | undefined {
	for (const [name, dir] of Object.entries(WORKSPACE)) {
		if (spec !== name && !spec.startsWith(name + '/')) continue;
		const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
		const sub = '.' + spec.slice(name.length);
		const types: string | undefined = json.exports?.[sub]?.types;
		if (!types) throw new Error(`${spec} is not exported by ${name}`);
		// the declarations mirror src, ./dist/tree_builder.d.ts is src/tree_builder.ts
		const file = join(
			dir,
			types.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts')
		);
		if (!existsSync(file)) throw new Error(`no source for ${spec} at ${file}`);
		return file;
	}
}

function resolve_relative(from: string, spec: string): string {
	const base = resolve(dirname(from), spec);
	for (const file of [
		base,
		base + '.ts',
		base.replace(/\.js$/, '.ts'),
		join(base, 'index.ts'),
	])
		if (/\.ts$/.test(file) && existsSync(file)) return file;
	throw new Error(`cannot resolve ${spec} from ${from}`);
}

function type_only(node: ts.ImportDeclaration | ts.ExportDeclaration) {
	if (ts.isExportDeclaration(node)) return node.isTypeOnly;
	const clause = node.importClause;
	if (!clause) return false;
	if (clause.isTypeOnly) return true;
	if (clause.name) return false;
	const bindings = clause.namedBindings;
	return (
		!!bindings &&
		ts.isNamedImports(bindings) &&
		bindings.elements.length > 0 &&
		bindings.elements.every((e) => e.isTypeOnly)
	);
}

// a top level `const NAME: string = 'literal'`, math.ts imports katex that way
function constant(source: ts.SourceFile, name: string): string | undefined {
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const d of statement.declarationList.declarations)
			if (
				ts.isIdentifier(d.name) &&
				d.name.text === name &&
				d.initializer &&
				ts.isStringLiteral(d.initializer)
			)
				return d.initializer.text;
	}
}

function binds(names: ts.BindingName, name: string): boolean {
	if (ts.isIdentifier(names)) return names.text === name;
	return names.elements.some(
		(e) => !ts.isOmittedExpression(e) && binds(e.name, name)
	);
}

// true when a scope around the reference declares the name
function declared(node: ts.Node, name: string): boolean {
	for (let at = node.parent; at; at = at.parent) {
		if (ts.isFunctionLike(at) && at.parameters.some((p) => binds(p.name, name)))
			return true;
		if (ts.isCatchClause(at) && at.variableDeclaration)
			if (binds(at.variableDeclaration.name, name)) return true;
		const statements =
			ts.isSourceFile(at) || ts.isBlock(at) || ts.isModuleBlock(at)
				? at.statements
				: undefined;
		if (!statements) continue;
		for (const s of statements) {
			if (ts.isVariableStatement(s))
				for (const d of s.declarationList.declarations)
					if (binds(d.name, name)) return true;
			if (
				(ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
				s.name?.text === name
			)
				return true;
			if (ts.isImportDeclaration(s) && s.importClause) {
				const c = s.importClause;
				if (c.name?.text === name) return true;
				const b = c.namedBindings;
				if (b && ts.isNamespaceImport(b) && b.name.text === name) return true;
				if (b && ts.isNamedImports(b))
					if (b.elements.some((e) => e.name.text === name)) return true;
			}
		}
	}
	return false;
}

// `typeof process`, or inside a branch that a `typeof process` test guards
function guarded(node: ts.Node, name: string): boolean {
	const tests = (e: ts.Node) =>
		new RegExp(`typeof\\s+${name}\\b`).test(e.getText());
	if (ts.isTypeOfExpression(node.parent)) return true;
	for (let at: ts.Node = node; at.parent; at = at.parent) {
		const p = at.parent;
		if (ts.isIfStatement(p) && p.thenStatement === at && tests(p.expression))
			return true;
		if (
			ts.isConditionalExpression(p) &&
			p.whenTrue === at &&
			tests(p.condition)
		)
			return true;
		if (
			ts.isBinaryExpression(p) &&
			p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
			p.right === at &&
			tests(p.left)
		)
			return true;
	}
	return false;
}

function reference(node: ts.Identifier): boolean {
	const p = node.parent;
	if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
	if (ts.isPropertyAssignment(p) && p.name === node) return false;
	if (ts.isQualifiedName(p)) return false;
	if (
		(ts.isPropertyDeclaration(p) ||
			ts.isPropertySignature(p) ||
			ts.isMethodDeclaration(p) ||
			ts.isMethodSignature(p) ||
			ts.isBindingElement(p) ||
			ts.isVariableDeclaration(p) ||
			ts.isParameter(p) ||
			ts.isFunctionDeclaration(p) ||
			ts.isImportSpecifier(p) ||
			ts.isExportSpecifier(p)) &&
		(p as { name?: ts.Node }).name === node
	)
		return false;
	// types are erased
	for (let at: ts.Node = node; at.parent; at = at.parent)
		if (ts.isTypeNode(at)) return false;
	return true;
}

function walk() {
	const files = new Map<string, ts.SourceFile>();
	const externals = new Map<string, string>();
	const findings: Finding[] = [];
	const queue = ENTRIES.map((e) => join(pkg, 'src', e));

	while (queue.length) {
		const file = queue.pop()!;
		if (files.has(file)) continue;
		const source = ts.createSourceFile(
			file,
			readFileSync(file, 'utf8'),
			ts.ScriptTarget.Latest,
			true
		);
		files.set(file, source);
		const where = (node: ts.Node) => ({
			file: posix(relative(packages, file)),
			line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
		});

		const follow = (node: ts.Node, spec: string) => {
			if (spec.startsWith('.')) return queue.push(resolve_relative(file, spec));
			const workspace = resolve_workspace(spec);
			if (workspace) return queue.push(workspace);
			if (!externals.has(spec)) externals.set(spec, where(node).file);
			const bare = spec.split('/')[0];
			if (
				BANNED.some((r) => r.test(spec)) ||
				builtinModules.includes(bare) ||
				builtinModules.includes(spec)
			)
				findings.push({ ...where(node), what: `imports ${spec}` });
		};

		const visit = (node: ts.Node) => {
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				!type_only(node)
			)
				follow(node, node.moduleSpecifier.text);
			else if (
				ts.isCallExpression(node) &&
				node.expression.kind === ts.SyntaxKind.ImportKeyword
			) {
				const arg = node.arguments[0];
				const spec = ts.isStringLiteralLike(arg)
					? arg.text
					: ts.isIdentifier(arg)
						? constant(source, arg.text)
						: undefined;
				if (spec === undefined)
					findings.push({
						...where(node),
						what: `imports a computed specifier ${arg.getText()}`,
					});
				else follow(node, spec);
			} else if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'require' &&
				!declared(node.expression, 'require')
			)
				findings.push({ ...where(node), what: `calls require` });
			else if (
				ts.isPropertyAccessExpression(node) &&
				ts.isMetaProperty(node.expression) &&
				node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
				META_GLOBALS.has(node.name.text)
			)
				findings.push({
					...where(node),
					what: `reads import.meta.${node.name.text}`,
				});
			else if (
				ts.isIdentifier(node) &&
				NODE_GLOBALS.has(node.text) &&
				reference(node) &&
				!declared(node, node.text) &&
				!guarded(node, node.text)
			)
				findings.push({ ...where(node), what: `reads ${node.text} unguarded` });
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return { files, externals, findings };
}

describe('the compile entry', () => {
	const { files, externals, findings } = walk();

	test('reaches the parser and the renderer', () => {
		const reached = [...files.keys()].map((f) => posix(relative(packages, f)));
		expect(reached).toContain('mdsvex/src/compile.ts');
		expect(reached).toContain('parse/src/main.ts');
		expect(reached).toContain('render/src/sourcemap.ts');
		expect(reached).not.toContain('mdsvex/src/main.ts');
	});

	test('imports nothing from vite or node and reads no node global', () => {
		expect(findings).toEqual([]);
	});

	test('imports only packages known to run in a browser', () => {
		const unknown = [...externals].filter(
			([spec]) => !ALLOWED.some((r) => r.test(spec))
		);
		expect(Object.fromEntries(unknown)).toEqual({});
	});

	test('bundles for a browser with no node built-in', async () => {
		const dist = join(pkg, 'dist');
		if (!existsSync(join(dist, 'compile.js')))
			throw new Error('build mdsvex first, this bundles dist');
		const { build } = await import('vite');
		const builtins: string[] = [];
		await build({
			root: pkg,
			configFile: false,
			logLevel: 'silent',
			plugins: [
				{
					name: 'builtins',
					enforce: 'pre',
					resolveId(id, importer) {
						const bare = id.replace(/^node:/, '').split('/')[0];
						if (id.startsWith('node:') || builtinModules.includes(bare)) {
							builtins.push(
								`${id} from ${importer && relative(pkg, importer)}`
							);
							return { id, external: true };
						}
					},
				},
			],
			build: {
				write: false,
				minify: false,
				lib: {
					entry: {
						compile: join(dist, 'compile.js'),
						math: join(dist, 'math.js'),
						highlight: join(dist, 'highlight.js'),
						host: join(dist, 'host.js'),
					},
					formats: ['es'],
				},
			},
		});
		expect(builtins).toEqual([]);
	}, 30_000);
});
