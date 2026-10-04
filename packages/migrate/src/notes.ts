/** what a note is about, manual covers anything that could not be rewritten safely */
export type NoteKind =
	| "select_template"
	| "layout_prop_forwarding"
	| "slot"
	| "legacy_props"
	| "template_key"
	| "highlighter"
	| "highlight_language"
	| "escape_svelte"
	| "manual";

/** something the migration leaves for a person to change */
export interface MigrationNote {
	kind: NoteKind;
	message: string;
	/** 1 based line in the source */
	line: number;
	/** 1 based column */
	column: number;
}

export interface MigrateResult {
	code: string;
	notes: MigrationNote[];
}

/** 1 based line and column of an offset into the source */
export function position_at(
	source: string,
	offset: number,
): { line: number; column: number } {
	let line = 1;
	let line_start = 0;
	let i = source.indexOf("\n");
	while (i !== -1 && i < offset) {
		line++;
		line_start = i + 1;
		i = source.indexOf("\n", i + 1);
	}
	return { line, column: offset - line_start + 1 };
}
