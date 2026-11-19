import { decode } from '@jridgewell/sourcemap-codec';
import type { StartOrEnd } from '../types';
import type { SourceMap } from '@rollup/browser';

export default function get_location_from_stack(stack: string, map: SourceMap) {
	if (!stack) return;
	const last = stack.split('\n')[1];
	const match = /<anonymous>:(\d+):(\d+)\)$/.exec(last);

	if (!match) return null;

	const line = +match[1];
	const column = +match[2];

	return trace({ line, column }, map);
}

function trace(loc: Omit<StartOrEnd, 'character'>, map: SourceMap) {
	const mappings = decode(map.mappings);
	const segments = mappings[loc.line - 1];

	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i];
		if (segment[0] === loc.column) {
			const [, sourceIndex, line, column] = segment;
			const source = map.sources[sourceIndex ?? 0].slice(2);

			return { source, line: (line ?? 0) + 1, column };
		}
	}

	return null;
}
