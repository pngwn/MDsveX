// an atlas output, laid out to read rather than as compiled: each block on a
// line of its own, indented by what it is inside, a script's lines indented
// under it. Illustrative, not faithful, and only ever whitespace: nothing but
// spaces and newlines is added or taken away, so every offset the compile's
// mappings give moves to a known place (`at`), and the wash still lines up.
// A `<pre>` is kept exactly as it is, its whitespace is its content

const UNIT = '  ';

/**
 * elements that stand on their own line, as a formatter would put them, and
 * display math's MathML, so a formula reads as its tree. Math inside a
 * paragraph stays on the paragraph's line: a leaf is never laid out further
 */
const BLOCK = new Set(
	[
		'address article aside blockquote details dialog dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul',
		'math mrow mfrac msup msub msubsup msqrt mroot munder mover munderover mtable mtr mtd mstyle mpadded menclose semantics annotation mi mn mo mtext ms mspace',
	]
		.join(' ')
		.split(' '),
);

/** blocks whose content is a line of text, never laid out further */
const LEAF = new Set('p h1 h2 h3 h4 h5 h6 th td dt summary figcaption'.split(' '));

const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));

/** kept as written, inside and out; a script or style has its lines indented */
const RAW = new Set(['pre', 'script', 'style', 'textarea']);

type Node =
	| { type: 'text'; start: number; end: number }
	| { type: 'comment'; start: number; end: number }
	| { type: 'raw'; name: string; open: [number, number]; body: [number, number]; close: [number, number] }
	| { type: 'element'; name: string; open: [number, number]; close: [number, number] | null; children: Node[] }
	| { type: 'block'; open: [number, number]; branches: { at: [number, number]; children: Node[] }[]; children: Node[]; close: [number, number] | null };

/** the end of a tag or a `{…}` from `from`, past quotes and braces */
function scan(code: string, from: number, end_char: string): number {
	let depth = 0;
	let quote = '';
	for (let i = from; i < code.length; i++) {
		const ch = code[i];
		if (quote) {
			if (ch === quote) quote = '';
		} else if (ch === '"' || ch === "'" || ch === '`') {
			// quotes count in a tag's attributes; in a `{…}` they only matter inside the braces
			if (end_char === '>' || depth > 0) quote = ch;
		} else if (ch === '{') depth++;
		else if (ch === '}') {
			if (end_char === '}' && depth === 1) return i + 1;
			depth--;
		} else if (ch === '>' && end_char === '>' && depth === 0) return i + 1;
	}
	return code.length;
}

function parse(code: string): Node[] {
	const root: Node[] = [];
	// the open elements and blocks, with where their children go
	const stack: { node: Node; children: Node[] }[] = [];
	const into = () => (stack.length ? stack[stack.length - 1].children : root);
	let text_start = -1;
	const flush = (at: number) => {
		if (text_start >= 0 && at > text_start) into().push({ type: 'text', start: text_start, end: at });
		text_start = -1;
	};

	let i = 0;
	while (i < code.length) {
		const ch = code[i];
		const next = code[i + 1] ?? '';
		if (ch === '<' && code.startsWith('<!--', i)) {
			flush(i);
			const end = code.indexOf('-->', i);
			const stop = end < 0 ? code.length : end + 3;
			into().push({ type: 'comment', start: i, end: stop });
			i = stop;
		} else if (ch === '<' && next === '/') {
			flush(i);
			const stop = scan(code, i, '>');
			const name = code.slice(i + 2, stop - 1).trim();
			// close the nearest open element of that name, and any left open inside it
			const k = stack.findLastIndex((s) => s.node.type === 'element' && s.node.name === name);
			if (k >= 0) {
				const node = stack[k].node as Extract<Node, { type: 'element' }>;
				node.close = [i, stop];
				stack.length = k;
			}
			i = stop;
		} else if (ch === '<' && /[A-Za-z]/.test(next)) {
			flush(i);
			const stop = scan(code, i, '>');
			const name = /^<([^\s/>]+)/.exec(code.slice(i, stop))![1];
			if (RAW.has(name)) {
				const close_at = code.indexOf(`</${name}>`, stop);
				const body_end = close_at < 0 ? code.length : close_at;
				const close_end = close_at < 0 ? code.length : close_at + name.length + 3;
				into().push({ type: 'raw', name, open: [i, stop], body: [stop, body_end], close: [body_end, close_end] });
				i = close_end;
				continue;
			}
			const node: Node = { type: 'element', name, open: [i, stop], close: null, children: [] };
			into().push(node);
			if (!code.slice(i, stop).endsWith('/>') && !VOID.has(name)) stack.push({ node, children: node.children });
			i = stop;
		} else if (ch === '{' && (next === '#' || next === ':' || next === '/')) {
			flush(i);
			const stop = scan(code, i, '}');
			const k = stack.findLastIndex((s) => s.node.type === 'block');
			if (next === '#') {
				const node: Node = { type: 'block', open: [i, stop], branches: [], children: [], close: null };
				into().push(node);
				stack.push({ node, children: node.children });
			} else if (k >= 0) {
				const node = stack[k].node as Extract<Node, { type: 'block' }>;
				stack.length = k + 1;
				if (next === ':') {
					const branch = { at: [i, stop] as [number, number], children: [] };
					node.branches.push(branch);
					stack[k].children = branch.children;
				} else {
					node.close = [i, stop];
					stack.length = k;
				}
			}
			i = stop;
		} else {
			if (text_start < 0) text_start = i;
			i++;
		}
	}
	flush(code.length);
	return root;
}

function is_component(name: string) {
	return /^[A-Z]/.test(name) || name.includes(':') || name.includes('.');
}

/** takes a line of its own where it stands among blocks */
function blocky(node: Node): boolean {
	if (node.type === 'comment' || node.type === 'raw' || node.type === 'block') return true;
	if (node.type === 'element') return BLOCK.has(node.name) || is_component(node.name);
	return false;
}

/** its children are laid out a line each, rather than kept on its line */
function container(node: Extract<Node, { type: 'element' }>) {
	return !LEAF.has(node.name) && node.children.some(blocky);
}

export interface Indented {
	code: string;
	/** where an offset of the compiled code is in the indented code */
	at: (offset: number) => number;
}

export function indent(code: string): Indented {
	const tree = parse(code);
	let out = '';
	// for each offset of the compiled code, its offset in `out`
	const map = new Int32Array(code.length + 1);
	let read = 0;

	/** copy the compiled code up to `to`, as it is */
	const copy = (to: number) => {
		for (; read < to; read++) {
			map[read] = out.length;
			out += code[read];
		}
	};
	/** pass over the compiled code up to `to`, writing none of it: only ever whitespace */
	const skip = (to: number) => {
		for (; read < to; read++) map[read] = out.length;
	};
	/** a new line at a depth, unless the output is still empty */
	const line = (depth: number) => {
		if (out.length) out += '\n' + UNIT.repeat(depth);
	};
	/** copy inline content, its own line breaks indented to the depth */
	const inline = (to: number, depth: number) => {
		while (read < to) {
			if (code[read] === '\n') {
				map[read] = out.length;
				read++;
				const from = read;
				while (read < to && (code[read] === ' ' || code[read] === '\t')) read++;
				for (let j = from; j < read; j++) map[j] = out.length + 1;
				out += '\n' + UNIT.repeat(depth);
			} else copy(read + 1);
		}
	};

	function nodes(list: Node[], depth: number) {
		let k = 0;
		while (k < list.length) {
			const node = list[k];
			if (!blocky(node)) {
				// a run of text and inline elements is one line, trimmed
				let j = k;
				while (j < list.length && !blocky(list[j])) j++;
				const start = start_of(list[k]);
				const end = end_of(list[j - 1]);
				let a = start;
				let b = end;
				while (a < b && /\s/.test(code[a])) a++;
				while (b > a && /\s/.test(code[b - 1])) b--;
				skip(a);
				if (a < b) {
					line(depth);
					inline(b, depth);
				}
				skip(end);
				k = j;
				continue;
			}
			skip(start_of(node));
			line(depth);
			one(node, depth);
			k++;
		}
	}

	function one(node: Node, depth: number) {
		switch (node.type) {
			case 'comment':
				inline(node.end, depth);
				return;
			case 'raw': {
				copy(node.open[1]);
				if (node.name === 'pre') {
					pre(node, depth);
					return;
				}
				if (node.name === 'textarea') {
					copy(node.close[1]);
					return;
				}
				// a script's lines, each indented one under it
				const [a, b] = node.body;
				let at = a;
				while (at < b) {
					let end = code.indexOf('\n', at);
					if (end < 0 || end > b) end = b;
					let first = at;
					while (first < end && (code[first] === ' ' || code[first] === '\t')) first++;
					skip(first);
					if (first < end) {
						line(depth + 1);
						copy(end);
					}
					skip(Math.min(end + 1, b));
					at = end + 1;
				}
				skip(b);
				line(depth);
				copy(node.close[1]);
				return;
			}
			case 'element': {
				copy(node.open[1]);
				if (container(node)) {
					nodes(node.children, depth + 1);
					if (node.close) {
						skip(node.close[0]);
						line(depth);
					}
				} else if (node.children.length) {
					inline(end_of(node.children[node.children.length - 1]), depth);
				}
				if (node.close) copy(node.close[1]);
				return;
			}
			case 'block': {
				copy(node.open[1]);
				nodes(node.children, depth + 1);
				for (const branch of node.branches) {
					skip(branch.at[0]);
					line(depth);
					copy(branch.at[1]);
					nodes(branch.children, depth + 1);
				}
				if (node.close) {
					skip(node.close[0]);
					line(depth);
					copy(node.close[1]);
				}
				return;
			}
		}
	}

	/**
	 * a highlighted block is a `<code>` of one `<span class="l">` per source
	 * line, so each line can stand on a line of its own, indented, without
	 * guessing where the code's own lines are. Anything else in a `<pre>` is
	 * kept exactly, its whitespace is its content
	 */
	function pre(node: Extract<Node, { type: 'raw' }>, depth: number) {
		const [a, b] = node.body;
		const inner = parse(code.slice(a, b)).filter((n) => !(n.type === 'text' && !code.slice(a + n.start, a + n.end).trim()));
		const el = inner[0];
		const lines =
			inner.length === 1 && el.type === 'element' && el.name === 'code' && el.close
				? el.children.filter((n) => !(n.type === 'text' && !code.slice(a + n.start, a + n.end).trim()))
				: [];
		const highlighted = lines.length > 0 && lines.every((n) => n.type === 'element' && n.name === 'span' && n.close);
		if (!highlighted || el.type !== 'element') {
			copy(node.close[1]);
			return;
		}
		skip(a + el.open[0]);
		line(depth + 1);
		copy(a + el.open[1]);
		for (const n of lines) {
			skip(a + start_of(n));
			line(depth + 2);
			copy(a + end_of(n));
		}
		skip(a + el.close![0]);
		line(depth + 1);
		copy(a + el.close![1]);
		skip(node.close[0]);
		line(depth);
		copy(node.close[1]);
	}

	nodes(tree, 0);
	skip(code.length);
	map[code.length] = out.length;
	return { code: out, at: (offset) => map[Math.max(0, Math.min(code.length, offset))] };
}

function start_of(node: Node): number {
	return node.type === 'text' || node.type === 'comment' ? node.start : node.open[0];
}

function end_of(node: Node): number {
	switch (node.type) {
		case 'text':
		case 'comment':
			return node.end;
		case 'raw':
			return node.close[1];
		case 'element': {
			if (node.close) return node.close[1];
			const last = node.children[node.children.length - 1];
			return last ? Math.max(node.open[1], end_of(last)) : node.open[1];
		}
		case 'block': {
			if (node.close) return node.close[1];
			const kids = node.branches.length ? node.branches[node.branches.length - 1].children : node.children;
			const last = kids[kids.length - 1];
			return last ? end_of(last) : node.open[1];
		}
	}
}
