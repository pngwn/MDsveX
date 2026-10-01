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

// a literal per preset rather than a spread, which on some node versions gives
// each copy its own hidden class, keys keep the spread order

function text_data(node_index: number, role: MappingRole): MappingData {
	return {
		verification: true,
		semantic: true,
		navigation: true,
		nodeIndex: node_index,
		role,
	};
}

function code_data(node_index: number, role: MappingRole): MappingData {
	return { semantic: true, navigation: true, nodeIndex: node_index, role };
}

function svelte_data(node_index: number, role: MappingRole): MappingData {
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

function structure_data(node_index: number, role: MappingRole): MappingData {
	return { structure: true, nodeIndex: node_index, role };
}

// exported functions are module cells too, so record_data calls the locals
export const data_text = text_data;
export const data_code = code_data;
export const data_svelte = svelte_data;
export const data_structure = structure_data;

// pending mapping records

// local const enums build to literals while exported consts are module cells
// turbofan reloads on every use, html_cursor and sourcemap restate these values
const enum Preset {
	TEXT = 0,
	CODE = 1,
	SVELTE = 2,
	STRUCTURE = 3,
}

/** data preset, packed into a record code with the role */
export const P_TEXT = Preset.TEXT;
export const P_CODE = Preset.CODE;
export const P_SVELTE = Preset.SVELTE;
export const P_STRUCTURE = Preset.STRUCTURE;

export const R_NODE = 0;
export const R_CONTENT = 1;
export const R_OPEN_SYNTAX = 2;
export const R_CLOSE_SYNTAX = 3;

export function record_code(preset: number, role: number): number {
	return (preset << 2) | role;
}

/**
 * words per record, out index, out chunk count, source offset, source length,
 * node index stored as uint32 and read back signed, and code
 */
export const RECORD_SIZE = 6;

const ROLE_NAMES: MappingRole[] = [
	'node',
	'content',
	'open_syntax',
	'close_syntax',
];

/** built exactly as the presets build it */
export function record_data(code: number, node_index: number): MappingData {
	const role = ROLE_NAMES[code & 3];
	switch (code >> 2) {
		case Preset.TEXT:
			return text_data(node_index, role);
		case Preset.CODE:
			return code_data(node_index, role);
		case Preset.SVELTE:
			return svelte_data(node_index, role);
		default:
			return structure_data(node_index, role);
	}
}

/**
 * a mapping of one record, its arrays and data built on each read from plain
 * fields, so a resolved document keeps one object per piece rather than four
 * arrays and a data object that stay alive until the caller drops the result
 */
export class RecordMapping implements Mapping<MappingData> {
	/**
	 * the source offset, or the arrays of a mapping that is not one plain
	 * piece, held as given (the other offsets are then 0)
	 */
	_source: number | Mapping<MappingData>;
	_generated: number;
	_length: number;
	_generated_length: number;
	/** (node index + 1) * 16 + record code, data preset and role */
	_key: number;

	constructor(
		source: number | Mapping<MappingData>,
		generated: number,
		length: number,
		generated_length: number,
		key: number
	) {
		this._source = source;
		this._generated = generated;
		this._length = length;
		this._generated_length = generated_length;
		this._key = key;
	}

	get sourceOffsets(): number[] {
		const s = this._source;
		return typeof s === 'number' ? [s] : s.sourceOffsets;
	}

	get generatedOffsets(): number[] {
		const s = this._source;
		return typeof s === 'number' ? [this._generated] : s.generatedOffsets;
	}

	get lengths(): number[] {
		const s = this._source;
		return typeof s === 'number' ? [this._length] : s.lengths;
	}

	get generatedLengths(): number[] | undefined {
		const s = this._source;
		if (typeof s !== 'number') return s.generatedLengths;
		const gen_length = this._generated_length;
		return gen_length === this._length ? undefined : [gen_length];
	}

	get data(): MappingData {
		return key_data(this._key);
	}

	/** the plain mapping, keys in the order a plain literal had them */
	toJSON(): Mapping<MappingData> {
		const s = this._source;
		if (typeof s !== 'number') return s;
		const m: Mapping<MappingData> = {
			sourceOffsets: [s],
			generatedOffsets: [this._generated],
			lengths: [this._length],
			data: key_data(this._key),
		};
		if (this._generated_length !== this._length) {
			m.generatedLengths = [this._generated_length];
		}
		return m;
	}
}

/**
 * record_data of a RecordMapping key, its node index is read signed (-1 for
 * none) so the key is a non negative integer, & 15 keeps the low bits of any
 * safe integer
 */
function key_data(key: number): MappingData {
	const code = key & 15;
	return record_data(code, (key - code) / 16 - 1);
}

// new Array(length) far past this gives dictionary elements
const MAPPINGS_PRESIZE_MAX = 1 << 20;

/** one RecordMapping per record of rec[0, n) */
export function record_mappings(
	rec: Uint32Array,
	n: number
): Mapping<MappingData>[] {
	// sized once rather than grown by push, which copies the elements at every
	// growth step, past the cap stores append as push would
	const count = n / RECORD_SIZE;
	const mappings: Mapping<MappingData>[] = new Array(
		count < MAPPINGS_PRESIZE_MAX ? count : MAPPINGS_PRESIZE_MAX
	);
	let i = 0;
	for (let p = 0; p < n; p += RECORD_SIZE) {
		mappings[i++] = new RecordMapping(
			rec[p + 2],
			rec[p],
			rec[p + 3],
			rec[p + 1],
			((rec[p + 4] | 0) + 1) * 16 + rec[p + 5]
		);
	}
	return mappings;
}

// records past this many words are dropped after use rather than kept for
// the next render, so one huge document does not pin its buffer, 4mb still
// keeps the records of a 1mb document
const SINK_KEEP = 1 << 20;
const SINK_INITIAL = RECORD_SIZE * 256;

/**
 * pending mappings as flat records until generated offsets are known, a typed
 * buffer rather than objects since a walk pushes several per node
 * @internal
 */
export class MapSink {
	rec: Uint32Array = new Uint32Array(SINK_INITIAL);
	/** words used, a multiple of RECORD_SIZE */
	n = 0;
	/** false drops syntax records, which a v3 map skips */
	syntax = true;

	grow(): Uint32Array {
		const next = new Uint32Array(this.rec.length * 2);
		next.set(this.rec.subarray(0, this.n));
		this.rec = next;
		return next;
	}

	begin(syntax: boolean): void {
		this.n = 0;
		this.syntax = syntax;
	}

	release(): void {
		this.n = 0;
		if (this.rec.length > SINK_KEEP) this.rec = new Uint32Array(SINK_INITIAL);
	}
}
