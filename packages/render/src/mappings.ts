/**
 * volar-compatible source mapping types.
 *
 * structurally compatible with @volar/source-map Mapping and
 * @volar/language-core CodeInformation, no runtime dependency.
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
					code: string | number | undefined
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

// CodeInformation presets

/** text content: verification, semantic, navigation. */
export const CI_TEXT: CodeInformation = {
	verification: true,
	semantic: true,
	navigation: true,
};

/** code content (code spans, fences): semantic + navigation only. */
export const CI_CODE: CodeInformation = {
	semantic: true,
	navigation: true,
};

/** svelte expressions: full capabilities. */
export const CI_SVELTE: CodeInformation = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: true,
};

/** generated structural elements: structure only. */
export const CI_STRUCTURE: CodeInformation = {
	structure: true,
};

// mapping identity

export type MappingRole = 'node' | 'content' | 'open_syntax' | 'close_syntax';

export interface MappingData extends CodeInformation {
	/** node buffer index: stable, monotonic in document order. */
	nodeIndex: number;
	/** what this mapping represents within the node. */
	role: MappingRole;
}

// one literal per preset rather than spreading a preset: on some node versions
// the spread copy gets its own hidden class per object, a literal keeps one
// shape per preset. keys stay in the order the spread produced.

export function data_text(node_index: number, role: MappingRole): MappingData {
	return {
		verification: true,
		semantic: true,
		navigation: true,
		nodeIndex: node_index,
		role,
	};
}

export function data_code(node_index: number, role: MappingRole): MappingData {
	return { semantic: true, navigation: true, nodeIndex: node_index, role };
}

export function data_svelte(
	node_index: number,
	role: MappingRole
): MappingData {
	return {
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
		format: true,
		nodeIndex: node_index,
		role,
	};
}

export function data_structure(
	node_index: number,
	role: MappingRole
): MappingData {
	return { structure: true, nodeIndex: node_index, role };
}
