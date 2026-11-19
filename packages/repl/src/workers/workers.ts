import type { CompileError, CompileResult } from 'svelte/compiler';
import type { File } from '../workspace.svelte';
import type { MarkdownResult } from './mdsvex';
import type { PfmNode } from './pfm_ast';

export interface ExposedCompilerOptions {
	generate: 'client' | 'server';
	dev: boolean;
	fragments: 'html' | 'tree' | undefined;
	async: boolean;
}

export interface CompilerRequest {
	id: number;
	file: File;
	/** every workspace file, templates and config live outside the compiled one */
	files: [string, string][];
	version: string;
	options: ExposedCompilerOptions;
}

export interface Compiled {
	error: (CompileError & { position?: [number, number] }) | null;
	result: CompileResult | null;
	/** the svelte that mdsvex produced, for markdown files */
	markdown: MarkdownResult | null;
	/** the parsed markdown, for markdown files */
	pfm: PfmNode | null;
}

export interface BundleOptions {
	svelte_version: string;
	/** the workspace file the preview mounts */
	entry: string;
	fragments?: 'html' | 'tree';
	async?: boolean;
}

export type BundleMessageData = {
	uid: number;
	type: 'init' | 'bundle' | 'status' | 'error' | 'version';
	message: string;
	svelte_version: string;
	files: File[];
	options: BundleOptions;
};

declare global {
	var svelte: typeof import('svelte/compiler');
}
