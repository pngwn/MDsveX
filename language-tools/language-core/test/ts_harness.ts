/** a typescript language service decorated with the pfm and svelte plugins as tsserver is */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { createLanguage, FileMap } from '@volar/language-core';
import type { LanguagePlugin } from '@volar/language-core';
import {
	createProxyLanguageService,
	decorateLanguageServiceHost,
	resolveFileLanguageId,
} from '@volar/typescript';

import {
	create_pfm_language_plugin,
	create_svelte_language_plugin,
} from '../src/index';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface Project {
	root: string;
	/** absolute path of a project file */
	path(file: string): string;
	write(file: string, content: string): void;
	/** the plain text of the quick info at the first offset of needle in file */
	hover(file: string, needle: string, delta?: number): string | undefined;
	/** syntactic and semantic diagnostics of file, with the text they cover */
	diagnostics(file: string): { text: string; message: string; code: number }[];
	/** the program over the generated typescript, as the language server holds it */
	program(): ts.Program;
	dispose(): void;
}

/** files are written under the package, so svelte resolves from its node_modules */
export function project(files: Record<string, string>): Project {
	const root = mkdtempSync(join(HERE, '.tmp-project-'));
	const versions = new Map<string, number>();
	const write = (file: string, content: string) => {
		const at = join(root, file);
		mkdirSync(dirname(at), { recursive: true });
		writeFileSync(at, content);
		versions.set(at, (versions.get(at) ?? 0) + 1);
	};
	for (const [file, content] of Object.entries(files)) write(file, content);

	const plugins: LanguagePlugin<string>[] = [
		create_pfm_language_plugin({ typescript: ts }),
		create_svelte_language_plugin(),
		{ getLanguageId: resolveFileLanguageId },
	];
	const snapshot = (file: string) =>
		fs.existsSync(file)
			? ts.ScriptSnapshot.fromString(readFileSync(file, 'utf8'))
			: undefined;
	const language = createLanguage(
		plugins,
		new FileMap(ts.sys.useCaseSensitiveFileNames),
		(file) => {
			const snap = snapshot(file);
			if (snap) language.scripts.set(file, snap);
			else language.scripts.delete(file);
		}
	);
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		allowJs: true,
		checkJs: false,
		skipLibCheck: true,
		types: [],
		noEmit: true,
		allowImportingTsExtensions: true,
		verbatimModuleSyntax: false,
		// what tsserver sets for extensions a plugin adds
		allowNonTsExtensions: true,
	};
	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => options,
		getScriptFileNames: () =>
			[...versions.keys()].filter((f) => /\.(pfm|svx|ts)$/.test(f)),
		getScriptVersion: (file) => String(versions.get(file) ?? 0),
		getScriptSnapshot: snapshot,
		getCurrentDirectory: () => root,
		getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		realpath: ts.sys.realpath,
		// the decoration resolves plugin extensions and gives their script kind through these
		getScriptKind(file) {
			if (file.endsWith('.ts')) return ts.ScriptKind.TS;
			if (file.endsWith('.js')) return ts.ScriptKind.JS;
			if (file.endsWith('.json')) return ts.ScriptKind.JSON;
			return ts.ScriptKind.Deferred;
		},
		resolveModuleNameLiterals(literals, containing, redirected, options) {
			return literals.map((literal) =>
				ts.resolveModuleName(literal.text, containing, options, ts.sys)
			);
		},
	};
	// volar types against its own typescript version
	decorateLanguageServiceHost(ts as any, language, host as any);
	const { proxy, initialize } = createProxyLanguageService(
		ts.createLanguageService(host) as any
	);
	initialize(language);

	const text = (file: string) => readFileSync(join(root, file), 'utf8');
	return {
		root,
		path: (file) => join(root, file),
		write,
		hover(file, needle, delta = 0) {
			const at = text(file).indexOf(needle);
			if (at < 0) throw new Error(`${needle} is not in ${file}`);
			const info = proxy.getQuickInfoAtPosition(join(root, file), at + delta);
			return info && ts.displayPartsToString(info.displayParts);
		},
		diagnostics(file) {
			const at = join(root, file);
			const source = text(file);
			return [
				...proxy.getSyntacticDiagnostics(at),
				...proxy.getSemanticDiagnostics(at),
			].map((d) => ({
				text: source.slice(d.start!, d.start! + d.length!),
				message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
				code: d.code,
			}));
		},
		program: () => proxy.getProgram()!,
		dispose() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}
