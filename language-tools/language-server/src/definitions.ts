import type {
	Location,
	LocationLink,
	Position,
	Range,
} from '@volar/language-server';

function contains(range: Range, at: Position): boolean {
	const after_start =
		at.line > range.start.line ||
		(at.line === range.start.line && at.character >= range.start.character);
	const before_end =
		at.line < range.end.line ||
		(at.line === range.end.line && at.character <= range.end.character);
	return after_start && before_end;
}

/** drops the markdown self definition of a heading when another target exists, so a jump goes straight to its component */
export function without_self<T extends Location | LocationLink>(
	results: T[] | null | undefined,
	uri: string,
	at: Position
): T[] | null | undefined {
	if (!Array.isArray(results) || results.length < 2) return results;
	const others = results.filter((r) => {
		const target = 'targetUri' in r ? r.targetUri : r.uri;
		const range = 'targetUri' in r ? r.targetRange : r.range;
		return target !== uri || !contains(range, at);
	});
	return others.length === 0 ? results : others;
}
