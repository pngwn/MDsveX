import type { Emitter } from '@mdsvex/parse/opcodes';
import { kind_to_string } from '@mdsvex/parse/utils';
import { SvelteMap } from 'svelte/reactivity';

export type Op =
	| {
			op: 'open';
			id: number;
			kind: number;
			kindName: string;
			start: number;
			parent: number;
			extra: number;
			pending: boolean;
	  }
	| { op: 'close'; id: number; end: number }
	| { op: 'text'; parent: number; start: number; end: number }
	| { op: 'attr'; id: number; key: string; value: any }
	| { op: 'revoke'; id: number }
	| { op: 'commit'; id: number };

export class RecordingEmitter implements Emitter {
	ops: Op[] = [];

	open(
		id: number,
		kind: number,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		this.ops.push({
			op: 'open',
			id,
			kind,
			kindName: kind_to_string(kind),
			start,
			parent,
			extra,
			pending
		});
	}

	close(id: number, end: number): void {
		this.ops.push({ op: 'close', id, end });
	}

	text(parent: number, start: number, end: number): void {
		this.ops.push({ op: 'text', parent, start, end });
	}

	attr(id: number, key: string, value: any): void {
		this.ops.push({ op: 'attr', id, key, value });
	}

	set_value_start(id: number, pos: number): void {
		this.attr(id, 'value_start', pos);
	}

	set_value_end(id: number, pos: number): void {
		this.attr(id, 'value_end', pos);
	}

	cursor(_pos: number): void {}

	revoke(id: number): void {
		this.ops.push({ op: 'revoke', id });
	}

	commit(id: number): void {
		this.ops.push({ op: 'commit', id });
	}

	reset(): void {
		this.ops = [];
	}
}

/** Build a renderable tree from a slice of opcodes */
export interface RenderNode {
	id: number;
	kind: string;
	attrs: Record<string, any>;
	children: RenderNode[];
	text?: string;
	revoked?: boolean;
}

/** Characters that start block-level constructs — if these appear after \n
 *  in an unclosed text node, the trailing line is held back to prevent flashing. */
const BLOCK_START_CHARS = new Set([
	0x2d, // -  list marker / thematic break
	0x2a, // *  list marker / thematic break
	0x2b, // +  list marker
	0x3e, // >  block quote
	0x23, // #  heading
	0x60, // `  code fence
	0x7c, // |  table
	0x5f, // _  thematic break
	0x3c // <  html tag / comment
]);

function looks_like_block_start(tail: string): boolean {
	if (tail.length === 0) return false;
	let i = 0;
	// skip leading spaces
	while (i < tail.length && tail.charCodeAt(i) === 0x20) i++;
	if (i >= tail.length) return false;
	const ch = tail.charCodeAt(i);
	// digits -> potential ordered list marker (1. / 1))
	if (ch >= 0x30 && ch <= 0x39) return true;
	return BLOCK_START_CHARS.has(ch);
}

function extract_text(node: RenderNode, source: string, fed_length: number): void {
	const kind = node.kind;
	if (
		kind === 'text' ||
		kind === 'heading' ||
		kind === 'code_fence' ||
		kind === 'code_span' ||
		kind === 'html_comment'
	) {
		// For code_fence: only render once value_start is known (avoids showing ```info)
		if (kind === 'code_fence' && node.attrs.value_start == null) {
			node.text = '';
			return;
		}
		const vs = node.attrs.value_start ?? node.attrs._open_start;
		// Use value_end if set, otherwise use fed_length as eager boundary
		const ve = node.attrs.value_end ?? node.attrs._end ?? fed_length;
		if (typeof vs === 'number' && typeof ve === 'number' && ve > vs) {
			let text = source.slice(vs, ve);
			const unclosed = node.attrs.value_end == null && node.attrs._end == null;
			if (unclosed) {
				const last_nl = text.lastIndexOf('\n');
				if (last_nl !== -1) {
					const tail = text.slice(last_nl + 1);
					if (
						kind === 'code_fence' ? tail.trimStart().startsWith('`') : looks_like_block_start(tail)
					) {
						text = text.slice(0, last_nl + 1);
					}
				} else if (kind === 'code_fence' && text.trimStart().startsWith('`')) {
					text = '';
				}
			}
			node.text = text;
		} else {
			node.text = '';
		}
	}
}

export function build_render_tree(ops: Op[], source: string, fed_length: number): RenderNode {
	const nodes = new Map<number, RenderNode>();
	const revoked = new Set<number>();
	const parent_map = new Map<number, number>(); // child id -> parent id
	let synthetic_id = -1;
	for (const op of ops) {
		switch (op.op) {
			case 'open': {
				const node: RenderNode = {
					id: op.id,
					kind: op.kindName,
					attrs: op.extra ? { extra: op.extra, _open_start: op.start } : { _open_start: op.start },
					children: []
				};
				if (op.pending) node.attrs._pending = true;
				nodes.set(op.id, node);
				parent_map.set(op.id, op.parent);
				// Add to parent's children (skip root which has parent=-1)
				if (op.parent !== -1) {
					const parent = nodes.get(op.parent);
					if (parent && !revoked.has(op.id)) {
						parent.children.push(node);
					}
				}
				break;
			}
			case 'close': {
				const node = nodes.get(op.id);
				if (node) {
					node.attrs._closed = true;
					node.attrs._end = op.end;
					// Try to extract text content (may not have value_end yet)
					extract_text(node, source, fed_length);
				}
				break;
			}
			case 'text': {
				// text opcode creates a child text node under the parent
				const parent = nodes.get(op.parent);
				if (parent) {
					const text_content = source.slice(op.start, Math.min(op.end, fed_length));
					const text_node: RenderNode = {
						id: synthetic_id--,
						kind: 'text',
						attrs: { value_start: op.start, value_end: op.end, _closed: true },
						children: [],
						text: text_content
					};
					parent.children.push(text_node);
				}
				break;
			}
			case 'attr': {
				const node = nodes.get(op.id);
				if (node) {
					node.attrs[op.key] = op.value;
					// Re-extract text whenever value attrs change
					extract_text(node, source, fed_length);
				}
				break;
			}
			case 'commit': {
				const node = nodes.get(op.id);
				if (node) delete node.attrs._pending;
				break;
			}
			case 'revoke': {
				revoked.add(op.id);
				const node = nodes.get(op.id);
				if (node) {
					node.revoked = true;
					// Remove from parent's children
					for (const [, n] of nodes) {
						const idx = n.children.indexOf(node);
						if (idx !== -1) {
							const replacement: RenderNode[] = [];

							// Restore the delimiter character(s) as a text node.
							// Only for nodes with children (emphasis, strong, etc.)
							// — code spans emit their own replacement text from the parser.
							if (node.children.length > 0) {
								const os = node.attrs._open_start;
								if (typeof os === 'number') {
									// Determine delimiter end: value_start if set,
									// otherwise infer from kind ([ for link, ![ for image)
									let delim_end = node.attrs.value_start;
									if (typeof delim_end !== 'number') {
										if (node.kind === 'image') delim_end = os + 2;
										else if (node.kind === 'link') delim_end = os + 1;
									}
									if (typeof delim_end === 'number' && delim_end > os) {
										replacement.push({
											id: synthetic_id--,
											kind: 'text',
											attrs: { value_start: os, value_end: delim_end, _closed: true },
											children: [],
											text: source.slice(os, delim_end)
										});
									}
								}
							}

							// Reparent children to grandparent
							replacement.push(...node.children);
							n.children.splice(idx, 1, ...replacement);
							break;
						}
					}
				}
				break;
			}
		}
	}

	// Final eager pass: extract text for any node that hasn't been closed yet
	for (const [id, node] of nodes) {
		if (!node.attrs._closed) {
			// Find the nearest closed ancestor to cap the eager boundary.
			// This prevents text inside a closed table_cell from leaking
			// into subsequent cells/rows.
			let boundary = fed_length;
			let pid = parent_map.get(id);
			while (pid !== undefined && pid !== -1) {
				const p = nodes.get(pid);
				if (p && p.attrs._closed && typeof p.attrs._end === 'number') {
					boundary = Math.min(boundary, p.attrs._end);
					break;
				}
				pid = parent_map.get(pid);
			}
			extract_text(node, source, boundary);
		}
	}

	return nodes.get(0) ?? { id: 0, kind: 'root', attrs: {}, children: [] };
}

export const SNIPPETS: { name: string; markdown: string }[] = [
	{
		name: 'Simple paragraph',
		markdown: 'Hello, world!\n'
	},
	{
		name: 'Heading + paragraph',
		markdown: '# Welcome\n\nThis is a paragraph with *strong* and _emphasis_.\n'
	},
	{
		name: 'Emphasis nesting',
		markdown: 'Hello *_world_* and ~~deleted~~\n'
	},
	{
		name: 'Superscript',
		markdown: 'E = mc^2^ and x^10^\n'
	},
	{
		name: 'Code fence',
		markdown: '```javascript\nconst x = 42;\nconsole.log(x);\n```\n'
	},
	{
		name: 'Block quote',
		markdown: '> To be or not to be,\\\n> that is the question.\n'
	},
	{
		name: 'List',
		markdown: '- First item\n- Second item\n- Third item\n'
	},
	{
		name: 'Nested list',
		markdown: '- Parent\n  - Child\n    - Grandchild\n- Sibling\n'
	},
	{
		name: 'Links and images',
		markdown: 'Visit [example](https://example.com) or see ![alt](/puppy.jpg)\n'
	},
	{
		name: 'Mixed document',
		markdown: `# Document Title

A paragraph with *strong emphasis* and _regular emphasis_.

Also ~~strikethrough~~ and ^superscript^ work.

## Second heading

### Third heading

\`\`\`python
def hello():
    print("world")
\`\`\`

> A block quote with *formatting*.

- Item one
- Item two
  - Nested item

---

Final paragraph with a [link](/url).
`
	},
	{
		name: 'Speculative emphasis',
		markdown: 'hello *friends\n\nThis *works* fine\n'
	},
	{
		name: 'Speculative emphasis 2',
		markdown: 'hello *friends'
	},
	{
		name: 'Hard line break',
		markdown: 'first line\\\nsecond line\n'
	},
	{
		name: 'Large documents',
		markdown:
			"# How to Make Cheese\n\nCheese-making is an ancient process that transforms milk into a preserved, flavourful food. Here's a general overview:\n\n## Basic Ingredients\n\n- *Milk* (cow, goat, sheep, etc.)\n- *Starter culture* (bacteria that acidify the milk)\n- *Rennet* (an enzyme that causes coagulation)\n- *Salt*\n\n---\n\n## The Basic Steps\n\n1. *Heat the milk* to a specific temperature depending on the cheese type (e.g. ~30–32°C for many soft cheeses).\n\n2. *Add starter culture* — beneficial bacteria convert lactose into lactic acid, lowering the pH and beginning to sour the milk.\n\n3. *Add rennet* — this causes the milk proteins (casein) to clump together, forming a semi-solid _curd_ and separating from the liquid _whey_.\n\n4. *Cut the curd* — the size of the cut affects the final texture. Smaller cuts = harder cheese; larger cuts = softer cheese.\n\n5. *Cook and stir* — heating the curds further firms them up and expels more whey.\n\n6. *Drain the whey* — curds are separated from the liquid whey, often using cheesecloth.\n\n7. *Press the curds* — applying pressure removes more moisture and shapes the cheese.\n\n8. *Salt the cheese* — either by rubbing, brining, or mixing salt in directly. This adds flavour and acts as a preservative.\n\n9. *Age (ripen) the cheese* — from days (fresh cheeses like ricotta) to years (aged cheddars, parmesan). During this time, enzymes and bacteria develop complex flavours.\n\n---\n\n## Simple Beginner Cheese: Paneer or Ricotta\n\nIf you want to start simple, *acid-set cheeses* like ricotta require no rennet or cultures — just milk, heat, and an acid like lemon juice or vinegar. Great for first-timers!\n\n---\n\n## Key Variables That Affect the Result\n\n- Type of milk and its fat content\n- Temperature at each stage\n- Type of bacteria/culture used\n- How long and how it's aged\n- Humidity and environment during ageing\n\nCheese-making can go from a simple 30-minute kitchen project to a months-long craft — it's a wonderfully deep rabbit hole!"
	},
	{
		name: 'Table',
		markdown: `| Feature | Status | Priority | Owner | Notes |
|:---|:---:|---:|:---|:---|
| Auth flow      |   ✅   |        1 | Pete           | Finished the *OAuth handshake* and *token refresh* logic last week; _needs a review pass_ before merging. |
| Search index   |   🚧   |        2 | Aisha          | *FTS5*  |
| Dark mode      |   ❌   |        3 | Unassigned     | *Blocked* on the design system tokens — once those land the CSS swap should be straightforward.       |
| Export to PDF   |   🚧   |        4 | Pete           | [Basic generation works](www.google.com)  |
| Onboarding tour |   ❌   |        5 | Aisha          | ![img](puppy.jpg) |`
	},
	{
		name: 'Table (inline)',
		markdown: `| one | two |
|:---|:---:|
| *Auth flow*     |   ✅   |
| Search index   |   🚧   |`
	},
	{
		name: 'Table (no body)',
		markdown: `| col A | col B |
| --- | --- |
`
	}
];
