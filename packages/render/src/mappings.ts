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

// pending mapping records

/** preset of a record's data, packed into its code with the role. */
export const P_TEXT = 0;
export const P_CODE = 1;
export const P_SVELTE = 2;
export const P_STRUCTURE = 3;

export const R_NODE = 0;
export const R_CONTENT = 1;
export const R_OPEN_SYNTAX = 2;
export const R_CLOSE_SYNTAX = 3;

/** a record's code, the data preset and the role in one word. */
export function record_code(preset: number, role: number): number {
	return (preset << 2) | role;
}

/**
 * record layout: out index, out chunk count, source offset, source length,
 * node index (as uint32, so -1 reads back through | 0) and code.
 */
export const RECORD_SIZE = 6;

const ROLE_NAMES: MappingRole[] = [
	'node',
	'content',
	'open_syntax',
	'close_syntax',
];

/** the data object a record stands for, built exactly as the presets build it. */
export function record_data(code: number, node_index: number): MappingData {
	const role = ROLE_NAMES[code & 3];
	switch (code >> 2) {
		case P_TEXT:
			return data_text(node_index, role);
		case P_CODE:
			return data_code(node_index, role);
		case P_SVELTE:
			return data_svelte(node_index, role);
		default:
			return data_structure(node_index, role);
	}
}

// records past this many words are dropped after use rather than kept for
// the next render, so one huge document does not pin its buffer
const SINK_KEEP = 1 << 18;
const SINK_INITIAL = RECORD_SIZE * 256;

/**
 * pending mappings as flat numeric records in render order, resolved once the
 * generated offsets are known. a renderer walk pushes several per node, so a
 * typed buffer replaces an object and a data object per mapping.
 */
export class MapSink {
	rec: Uint32Array = new Uint32Array(SINK_INITIAL);
	/** words used, a multiple of RECORD_SIZE. */
	n = 0;
	/**
	 * false drops open_syntax and close_syntax records. a v3 map skips them,
	 * so its renders never write them.
	 */
	syntax = true;

	/** double the buffer, keeping the used words. */
	grow(): Uint32Array {
		const next = new Uint32Array(this.rec.length * 2);
		next.set(this.rec.subarray(0, this.n));
		this.rec = next;
		return next;
	}

	/** empty the sink for a render that keeps or drops syntax records. */
	begin(syntax: boolean): void {
		this.n = 0;
		this.syntax = syntax;
	}

	/** let go of a buffer that one large render grew. */
	release(): void {
		this.n = 0;
		if (this.rec.length > SINK_KEEP) this.rec = new Uint32Array(SINK_INITIAL);
	}
}
