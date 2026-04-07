/**
 * volar-compatible source mapping types.
 *
 * structurally compatible with @volar/source-map Mapping and
 * @volar/language-core CodeInformation — no runtime dependency.
 */

export interface Mapping<Data = unknown> {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths?: number[];
	data: Data;
}

export interface CodeInformation {
	verification?:
		| boolean
		| {
				shouldReport?(
					source: string | undefined,
					code: string | number | undefined,
				): boolean;
			};
	completion?: boolean | { isAdditional?: boolean; onlyImport?: boolean };
	semantic?: boolean | { shouldHighlight?(): boolean };
	navigation?:
		| boolean
		| {
				shouldRename?(): boolean;
				resolveRenameNewName?(newName: string): string;
				resolveRenameEditText?(newText: string): string;
			};
	structure?: boolean;
	format?: boolean;
}

/** text content — verification, semantic, navigation. */
export const TEXT: CodeInformation = {
	verification: true,
	semantic: true,
	navigation: true,
};

/** code content (code spans, fences) — semantic + navigation only. */
export const CODE: CodeInformation = {
	semantic: true,
	navigation: true,
};

/** generated html tags — structure only (anchor for sourcemap remapping). */
export const TAG: CodeInformation = {
	structure: true,
};

/** svelte expressions — full capabilities. */
export const SVELTE: CodeInformation = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: true,
};
