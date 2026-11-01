// what the build gives the page for each construct, compile.server.ts makes it

/** a source range and the output range it became: [start, end, out_start, out_end] */
export type Segment = [number, number, number, number];

export interface Compiled {
	code: string;
	segments: Segment[];
	/** the compile options beyond the atlas's plain ones, said beside the output */
	with: string[];
}

/** the construct's notes as inline markup, compiled by mdsvex */
export interface Notes {
	what: string;
	edges: string[];
	commonmark: string;
}
