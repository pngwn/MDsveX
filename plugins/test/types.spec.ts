import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, test } from 'vitest';

const plugins = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = readdirSync(plugins).filter((name) =>
	existsSync(join(plugins, name, 'package.json'))
);

// sits in a plugin directory so `mdsvex/compile` resolves as a consumer would
const fixture = join(plugins, names[0], 'types_fixture.ts');
const source = [
	...names.map(
		(name, i) => `import * as p${i} from '../${name}/dist/index.js';`
	),
	`import type { PluginData } from 'mdsvex/compile';`,
	`export const all = [${names.map((_, i) => `p${i}`).join(', ')}];`,
	`declare const data: PluginData;`,
	`export const page: number | undefined = data.page?.minutes;`,
	`export const toc: number | undefined = data.toc?.headings.length;`,
].join('\n');

test('plugin types check with vite not installed', () => {
	for (const name of names)
		if (!existsSync(join(plugins, name, 'dist', 'index.d.ts')))
			throw new Error(`build ${name} before its types are checked`);

	const options: ts.CompilerOptions = {
		strict: true,
		noEmit: true,
		skipLibCheck: false,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const read = host.readFile.bind(host);
	host.readFile = (file) => (file === fixture ? source : read(file));
	const exists = host.fileExists.bind(host);
	host.fileExists = (file) => file === fixture || exists(file);
	const get = host.getSourceFile.bind(host);
	host.getSourceFile = (file, ...rest) =>
		file === fixture
			? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true)
			: get(file, ...rest);
	host.resolveModuleNameLiterals = (literals, containing, _, opts) =>
		literals.map(({ text }) =>
			/^vite(\/|$)/.test(text)
				? { resolvedModule: undefined }
				: ts.resolveModuleName(text, containing, opts, host)
		);

	const program = ts.createProgram([fixture], options, host);
	const errors = ts.getPreEmitDiagnostics(program).map((d) => {
		const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
		if (!d.file) return text;
		const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
		return `${d.file.fileName.slice(resolve(plugins, '..').length + 1)}:${line + 1} ${text}`;
	});
	expect(errors).toEqual([]);
	const reached = program.getSourceFiles().map((f) => f.fileName);
	expect(reached.some((f) => f.endsWith('mdsvex/dist/compile.d.ts'))).toBe(
		true
	);
});
