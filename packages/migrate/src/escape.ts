/**
 * Text escaping for PFM output.
 *
 * mdast `text` nodes hold already-unescaped literal text: any markup character
 * present in a text node was *not* treated as syntax by the source parser. When
 * we serialise that text back out we must escape the characters PFM would
 * otherwise re-interpret, so the round-trip preserves the literal meaning.
 *
 * PFM-significant inline characters (see PFM.md):
 *   \  backslash (escape + hard break)
 *   `  code span
 *   _  emphasis            *  strong
 *   ~  subscript / strikethrough
 *   ^  superscript
 *   [  ]  links / references / directives
 *   :  directives (only meaningful in clusters / at block start)
 */

// Characters that always need escaping wherever they appear inline.
const INLINE_SPECIAL = /[\\`_*~^[\]]/g;

/** Escape inline-significant characters in a run of literal text. */
export function escape_inline(value: string): string {
	return value.replace(INLINE_SPECIAL, (ch) => "\\" + ch);
}

/**
 * Escape a character at the *start of a line* that would otherwise be parsed as
 * the opening of a block construct (heading, blockquote, list, fence, table,
 * thematic break, directive).
 */
const LINE_START_BLOCK =
	/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|:::?|\||---|===)/;

export function escape_line_starts(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			const m = LINE_START_BLOCK.exec(line);
			if (!m) return line;
			const indent = m[1];
			const rest = line.slice(indent.length);
			return indent + "\\" + rest;
		})
		.join("\n");
}
