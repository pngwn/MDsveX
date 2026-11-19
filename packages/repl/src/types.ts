import type { OutputChunk, RollupError } from '@rollup/browser';
import type { CompileError } from 'svelte/compiler';
import type { Writable } from 'svelte/store';
import type { Workspace, File } from './workspace.svelte';
import type Bundler from './bundler.svelte';

export type { File };

export interface BundleResult {
	uid: number;
	error: (RollupError & CompileError) | null;
	client: OutputChunk | null;
	server: OutputChunk | null;
	css: string | null;
	imports: string[];
}

export type StartOrEnd = {
	line: number;
	column: number;
	character: number;
};

export type MessageDetails = {
	start: StartOrEnd;
	end: StartOrEnd;
	filename: string;
	message: string;
};

export type Warning = MessageDetails;

/** everything needed to restore a playground, this is what urls encode */
export interface ReplState {
	files: { name: string; contents: string }[];
	/** the file the preview mounts, defaults to the first App file */
	entry?: string;
	/** the file open in the editor */
	selected?: string;
	svelte_version?: string;
}

export type ReplContext = {
	bundler: Bundler | null;
	toggleable: Writable<boolean>;
	workspace: Workspace;
	svelte_version: string;
};
