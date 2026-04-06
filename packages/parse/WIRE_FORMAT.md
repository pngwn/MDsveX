# PFM Wire Format

The PFM parser emits a stream of **opcodes** that describe a markdown document as it is parsed. This wire format is designed for incremental/streaming rendering — a client can start building UI immediately and update it as more content arrives.

This guide explains how to consume the wire format in any language (Swift, Kotlin, Rust, etc.) to build a document tree and render it.

## Overview

```
Source text -> PFMParser -> WireEmitter -> JSON batches -> Client (tree + renderer)
```

The parser feeds chunks of markdown to a `WireEmitter`, which produces **batches** of opcodes. Each batch is a JSON array of opcode tuples:

```json
[
  ["S", ["root","text","html","heading","mustache","code_fence",...]],
  ["O", 1, 7, 0, 0, 0],
  ["T", 1, "Hello world"],
  ["C", 1]
]
```

In streaming mode, one batch is produced per `feed()` call. The client applies each batch to its document tree, then updates the UI.

## Opcodes

### S — Schema

```
["S", kinds: string[]]
```

Sent once as the first opcode in the first batch. Maps numeric kind codes to human-readable names. Store this array — you'll use it to look up kind names from the numeric codes in `O` opcodes.

```json
[
	"S",
	[
		"root",
		"text",
		"html",
		"heading",
		"mustache",
		"code_fence",
		"line_break",
		"paragraph",
		"code_span",
		"emphasis",
		"strong_emphasis",
		"thematic_break",
		"link",
		"image",
		"block_quote",
		"list",
		"list_item",
		"hard_break",
		"soft_break",
		"strikethrough",
		"superscript",
		"table",
		"table_header",
		"table_row",
		"table_cell"
	]
]
```

### O — Open

```
["O", id: int, kind: int, parent: int, pending: int, extra: int]
```

Creates a new node and appends it to the parent's content.

| Field     | Description                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `id`      | Unique node ID (monotonically increasing).                                                                   |
| `kind`    | Numeric kind code. Look up `schema[kind]` for the name.                                                      |
| `parent`  | ID of the parent node. `-1` for the root node.                                                               |
| `pending` | `1` if speculative (may be revoked), `0` if committed.                                                       |
| `extra`   | Kind-specific value. For headings: the depth (1–6). For code fences: the backtick count. `0` for most kinds. |

### C — Close

```
["C", id: int]
```

Finalizes a node. After close, the node's content will not change. If the node was pending, close implicitly commits it. Use this signal to cache rendered output — closed blocks never need re-rendering.

### T — Text

```
["T", id: int, content: string]
```

Appends text to a node's content. Multiple `T` opcodes for the same node should be concatenated. If the last item in the node's content is already a string, append to it. Otherwise, push a new string entry.

Text is always resolved to strings on the wire — the client never sees byte offsets or needs the source markdown.

### A — Attr

```
["A", id: int, key: string, value: any]
```

Sets an attribute on a node. Common attributes:

| Kind         | Key          | Value      | Description                                                        |
| ------------ | ------------ | ---------- | ------------------------------------------------------------------ |
| `link`       | `href`       | `string`   | Link URL                                                           |
| `link`       | `title`      | `string`   | Link title                                                         |
| `image`      | `src`        | `string`   | Image source URL                                                   |
| `image`      | `title`      | `string`   | Image title                                                        |
| `code_fence` | `info`       | `string`   | Info string (language identifier)                                  |
| `list`       | `ordered`    | `boolean`  | `true` for ordered lists                                           |
| `list`       | `start`      | `number`   | Start number for ordered lists                                     |
| `table`      | `alignments` | `string[]` | Per-column alignment: `"left"`, `"center"`, `"right"`, or `"none"` |

### R — Revoke

```
["R", id: int, delimiter: string]
```

Revokes a speculative (pending) node. This means the parser initially thought it found an inline construct (emphasis, link, etc.) but later determined it was just literal text.

When a node is revoked:

1. Remove the node from its parent's content array.
2. In its place, insert: the `delimiter` string, followed by all of the revoked node's children (re-parented to the grandparent).
3. Merge any adjacent strings in the parent's content.
4. Delete the node from the node map.

**Example:** The parser sees `_` and opens a pending emphasis node. Later, it determines the `_` is not closed, so it revokes the emphasis. The `_` character becomes literal text in the parent, and any children of the emphasis are moved up.

### X — Clear

```
["X", id: int]
```

Clears all children and text of a node. Remove child subtrees from the node map and empty the content array. Reserved for future use.

## Document Tree

The client builds a tree of nodes. Each node has:

```
Node {
    id:       Int           // unique, from O opcode
    kind:     Int           // numeric, from O opcode
    kindName: String        // schema[kind], e.g. "paragraph"
    extra:    Int           // from O opcode (heading depth, etc.)
    parent:   Node?         // null for root
    content:  [String|Node] // ordered, interleaved text and children
    attrs:    {String: Any} // from A opcodes
    pending:  Bool          // from O opcode, cleared on C
    closed:   Bool          // set on C opcode
}
```

The `content` array preserves document order. A paragraph containing `Hello *world*` would have:

```
Paragraph {
    content: [
        "Hello ",
        StrongEmphasis { content: ["world"] },
    ]
}
```

## Incremental Rendering Strategy

The key insight for streaming renderers:

1. **Block-level stability.** The root node's children are top-level blocks (headings, paragraphs, code fences, etc.). Once a block is closed, it never changes. Your renderer can cache closed blocks and skip re-rendering them.

2. **Only the last block is active.** During streaming, only the last block in the document is typically open and receiving updates. All prior blocks are closed.

3. **Use node IDs as keys.** When rendering a list of blocks, key them by `node.id`. This gives your UI framework (SwiftUI, Jetpack Compose, React, Svelte) stable identity for diffing.

### Rendering flow

```
for each batch from the wire:
    apply batch to document tree

    for each block in root.content:
        skip strings and line_break nodes
        if block is new -> render it
        if block is open (not closed) -> re-render it
        if block is closed -> use cached version
```

## Node Kind Reference

### Block-level nodes

These appear as direct children of root:

| Kind             | Extra          | Attrs              | Content               | Notes                                                  |
| ---------------- | -------------- | ------------------ | --------------------- | ------------------------------------------------------ |
| `heading`        | depth (1–6)    | —                  | inline content        | Render as `<h1>`–`<h6>`                                |
| `paragraph`      | —              | —                  | inline content        |                                                        |
| `code_fence`     | backtick count | `info`: language   | raw text              | Content is raw (no inline parsing)                     |
| `block_quote`    | —              | —                  | block children        | Contains paragraphs, etc.                              |
| `list`           | —              | `ordered`, `start` | list_item children    |                                                        |
| `list_item`      | —              | —                  | block/inline content  |                                                        |
| `thematic_break` | —              | —                  | empty                 | Render as `<hr>`                                       |
| `table`          | —              | `alignments[]`     | header + row children |                                                        |
| `line_break`     | —              | —                  | —                     | Structural separator between blocks; skip in rendering |

### Inline nodes

These appear inside paragraphs, headings, list items, and other inline containers:

| Kind              | Content        | Attrs           | Notes                                               |
| ----------------- | -------------- | --------------- | --------------------------------------------------- |
| `emphasis`        | inline content | —               | `_text_` -> `<em>`                                  |
| `strong_emphasis` | inline content | —               | `*text*` -> `<strong>`                              |
| `strikethrough`   | inline content | —               | `~~text~~` -> `<del>`                               |
| `superscript`     | inline content | —               | `^text^` -> `<sup>`                                 |
| `subscript`       | inline content | —               | `~text~` -> `<sub>`                                 |
| `code_span`       | raw text       | —               | `` `code` `` -> `<code>` (no inline parsing inside) |
| `link`            | inline content | `href`, `title` | `[text](url "title")`                               |
| `image`           | alt text       | `src`, `title`  | `![alt](src "title")` — content is the alt text     |
| `hard_break`      | —              | —               | `\` at end of line -> `<br>`                        |
| `soft_break`      | —              | —               | Line break within a paragraph -> space or `\n`      |

### Table structure

A `table` node contains `table_header` and `table_row` children. Each of those contains `table_cell` children. Alignments are on the table node, indexed by column:

```
Table {
    attrs: { alignments: ["left", "center", "right"] }
    content: [
        TableHeader { content: [Cell, Cell, Cell] }
        TableRow    { content: [Cell, Cell, Cell] }
        TableRow    { content: [Cell, Cell, Cell] }
    ]
}
```

Each `table_cell` contains inline content (text, emphasis, etc.).

## Example: Processing a Batch

Given this markdown streamed in two chunks:

**Chunk 1:** `# Hel`
**Chunk 2:** `lo\n`

### Batch 1 (after feed("# Hel"))

```json
[
  ["S", ["root","text","html","heading",...]],
  ["O", 0, 0, -1, 0, 0],
  ["O", 1, 3, 0, 0, 1],
  ["T", 1, "Hel"]
]
```

1. `S` — Store the schema.
2. `O 0` — Create root node (kind=0 -> "root", parent=-1).
3. `O 1` — Create heading node (kind=3 -> "heading", parent=0, extra=1 -> h1).
4. `T 1` — Append "Hel" to node 1's content.

Tree after batch 1:

```
root
  └─ heading(h1) "Hel"     [open]
```

### Batch 2 (after feed("lo\n"))

```json
[
	["T", 1, "lo"],
	["C", 1]
]
```

1. `T 1` — Append "lo" to node 1 -> content is now "Hello".
2. `C 1` — Close node 1. It's finalized.

Tree after batch 2:

```
root
  └─ heading(h1) "Hello"   [closed]
```

The renderer sees the heading is now closed and caches its output.

## Example: Revocation

Given: `_not emphasis`

The parser sees `_` and speculatively opens an emphasis node. When it reaches the end without a closing `_`, it revokes.

```json
[
	["O", 0, 0, -1, 0, 0],
	["O", 1, 7, 0, 0, 0],
	["O", 2, 9, 1, 1, 0],
	["T", 2, "not emphasis"],
	["R", 2, "_"],
	["C", 1]
]
```

After `R 2`:

- Remove emphasis (node 2) from paragraph's content.
- Insert `"_"` + `"not emphasis"` into paragraph's content.
- Merge adjacent strings -> `"_not emphasis"`.

Final tree:

```
root
  └─ paragraph "_not emphasis"
```

## Pseudocode: Swift Client

```swift
class PFMNode {
    let id: Int
    let kind: Int
    var kindName: String
    let extra: Int
    weak var parent: PFMNode?
    var content: [ContentItem] = []  // .text(String) or .node(PFMNode)
    var attrs: [String: Any] = [:]
    var pending: Bool
    var closed: Bool = false
}

class PFMDocument {
    var schema: [String]?
    var root: PFMNode?
    var nodes: [Int: PFMNode] = [:]

    func apply(batch: [[Any]]) {
        for op in batch {
            guard let code = op[0] as? String else { continue }
            switch code {
            case "S":
                schema = op[1] as? [String]

            case "O":
                let id = op[1] as! Int
                let kind = op[2] as! Int
                let parentId = op[3] as! Int
                let pending = (op[4] as! Int) == 1
                let extra = op[5] as! Int
                let node = PFMNode(
                    id: id, kind: kind,
                    kindName: schema?[kind] ?? "\(kind)",
                    extra: extra, pending: pending
                )
                nodes[id] = node
                if parentId == -1 {
                    root = node
                } else if let parent = nodes[parentId] {
                    node.parent = parent
                    parent.content.append(.node(node))
                }

            case "C":
                let id = op[1] as! Int
                nodes[id]?.closed = true
                nodes[id]?.pending = false

            case "T":
                let id = op[1] as! Int
                let text = op[2] as! String
                guard let node = nodes[id] else { break }
                if case .text(let existing) = node.content.last {
                    node.content[node.content.count - 1] = .text(existing + text)
                } else {
                    node.content.append(.text(text))
                }

            case "A":
                let id = op[1] as! Int
                let key = op[2] as! String
                let value = op[3]!
                nodes[id]?.attrs[key] = value

            case "R":
                let id = op[1] as! Int
                let delimiter = op[2] as! String
                guard let node = nodes[id], let parent = node.parent else { break }
                guard let idx = parent.content.firstIndex(where: {
                    if case .node(let n) = $0 { return n.id == id }
                    return false
                }) else { break }

                var replacement: [ContentItem] = []
                if !delimiter.isEmpty { replacement.append(.text(delimiter)) }
                replacement.append(contentsOf: node.content.map {
                    if case .node(let child) = $0 { child.parent = parent }
                    return $0
                })
                parent.content.replaceSubrange(idx...idx, with: replacement)
                mergeAdjacentStrings(&parent.content)
                nodes.removeValue(forKey: id)

            case "X":
                let id = op[1] as! Int
                guard let node = nodes[id] else { break }
                removeSubtree(node)
                node.content.removeAll()

            default: break
            }
        }
    }
}
```

## Transport

The wire format is transport-agnostic. Common options:

- **Server-Sent Events (SSE):** Each batch is one `data:` line, JSON-encoded.
- **WebSocket:** Each message is one JSON batch.
- **HTTP streaming:** Newline-delimited JSON (NDJSON), one batch per line.
- **In-process:** Pass the batch array directly (no serialization needed).

For SSE, the client would look like:

```javascript
const source = new EventSource('/api/parse');
const doc = new PFMDocument();

source.onmessage = (event) => {
	const batch = JSON.parse(event.data);
	doc.apply(batch);
	renderer.update(doc);
};
```

## Server-Side: Incremental Parsing API

The parser runs server-side (or in a worker) and produces batches via the `WireEmitter`. There are two modes.

### Batch mode

Parse a complete markdown string in one call:

```javascript
import { PFMParser, WireEmitter } from '@mdsvex/parse';

const emitter = new WireEmitter();
emitter.set_source(source);

const parser = new PFMParser(emitter);
parser.parse(source);

const batch = emitter.flush(); // single batch with all opcodes
// -> send batch to client
```

### Incremental (streaming) mode

Feed chunks as they arrive (e.g., from an LLM stream, file read, or network):

```javascript
import { PFMParser, WireEmitter } from '@mdsvex/parse';

const emitter = new WireEmitter();
const parser = new PFMParser(emitter);
parser.init(); // required before first feed()

let accumulated = '';

function onChunk(chunk) {
	accumulated += chunk;
	emitter.set_source(accumulated); // must be the full source so far
	parser.feed(chunk); // only the new chunk
	const batch = emitter.flush(); // opcodes produced by this chunk
	if (batch.length > 0) {
		send(batch); // send to client
	}
}

function onEnd() {
	emitter.set_source(accumulated);
	parser.finish(); // finalize all open nodes
	const batch = emitter.flush();
	if (batch.length > 0) {
		send(batch);
	}
}
```

### API reference

#### `PFMParser`

| Method                          | Description                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(emitter: Emitter)` | Create a parser with the given opcode emitter.                                                                                                                                         |
| `parse(source)`                 | **Batch mode.** Parse a complete string. Equivalent to `init()` + `feed(source)` + `finish()`.                                                                                         |
| `init()`                        | **Streaming mode.** Initialize the parser. Must be called before the first `feed()`.                                                                                                   |
| `feed(chunk)`                   | Feed a chunk of source text. The parser advances as far as it can, stalling at line boundaries when it needs more input to decide structure (e.g., is this a heading or a paragraph?). |
| `finish()`                      | Signal end-of-input. Finalizes all open nodes, revokes unresolved speculation, and emits closing opcodes. Returns `{ errors }`.                                                        |

#### `WireEmitter`

| Method               | Description                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_source(source)` | Set the **full accumulated source** string. Must be called before each `feed()` and before `finish()`. The emitter uses this to resolve byte offsets to text content. |
| `flush()`            | Return all accumulated opcodes as a batch (array of tuples) and clear the internal buffer. The first flush includes the `S` (schema) opcode.                          |
| `flush_json()`       | Convenience — calls `flush()` and returns `JSON.stringify(result)`.                                                                                                   |
| `reset()`            | Reset all state for reuse with a new parse.                                                                                                                           |

### How stalling works

The parser is a streaming state machine. When fed a chunk, it advances the cursor through confirmed content and **stalls** when it reaches a point where the next chunk might change the interpretation:

- **Line boundaries:** The parser stalls at `\n` when it can't determine if the next line continues the current block or starts a new one. For example, after `# Hello\n`, the parser waits to see if the next line is a paragraph continuation or a new block.

- **Code fences:** Inside a code fence, the parser emits content freely but holds back the last line if it starts with backticks (potential closing fence).

- **Inline content:** Emphasis markers (`_`, `*`), code spans (`` ` ``), links (`[`), etc. are emitted speculatively (pending=1) and later committed or revoked.

The `WireEmitter` uses the parser's cursor position (reported via `cursor()`) to eagerly emit text content up to the confirmed boundary. This means the client sees content as soon as the parser has confirmed it, not just when nodes are closed.

### Eager text emission

The `WireEmitter.flush()` method does more than just return buffered opcodes — it also eagerly emits text for nodes that are still being streamed:

- **For most nodes:** Text is emitted up to the parser cursor position. This is the boundary of confirmed content.
- **For code fences:** Text is emitted up to the end of the fed source, except the last line is held back if it starts with backticks (potential closing fence).

This means the client sees progressive text content even before nodes are closed:

```
feed("# Hel")  -> batch: [O(heading), T(heading, "Hel")]
feed("lo\n")   -> batch: [T(heading, "lo"), C(heading)]
```

Without eager emission, the client would see nothing until the heading is closed.

### Example: streaming from an LLM

```javascript
import { PFMParser, WireEmitter } from '@mdsvex/parse';

const emitter = new WireEmitter();
const parser = new PFMParser(emitter);
parser.init();

let accumulated = '';

const response = await fetch('/api/chat', { method: 'POST', body: prompt });
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
	const { done, value } = await reader.read();
	if (done) break;

	const chunk = decoder.decode(value, { stream: true });
	accumulated += chunk;
	emitter.set_source(accumulated);
	parser.feed(chunk);

	const batch = emitter.flush();
	if (batch.length > 0) {
		// Send to client via SSE, WebSocket, etc.
		res.write(`data: ${JSON.stringify(batch)}\n\n`);
	}
}

// Finalize
emitter.set_source(accumulated);
parser.finish();
const finalBatch = emitter.flush();
if (finalBatch.length > 0) {
	res.write(`data: ${JSON.stringify(finalBatch)}\n\n`);
}
```

### Example: complete SSE server (Node.js)

```javascript
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import http from 'node:http';

http
	.createServer((req, res) => {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});

		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();
		let accumulated = '';

		// Simulate streaming input (replace with real source)
		const source = '# Hello\n\nThis is *streaming* markdown.\n';
		const chunkSize = 5;

		for (let i = 0; i < source.length; i += chunkSize) {
			const chunk = source.slice(i, i + chunkSize);
			accumulated += chunk;
			emitter.set_source(accumulated);
			parser.feed(chunk);
			const batch = emitter.flush();
			if (batch.length > 0) {
				res.write(`data: ${JSON.stringify(batch)}\n\n`);
			}
		}

		emitter.set_source(accumulated);
		parser.finish();
		const batch = emitter.flush();
		if (batch.length > 0) {
			res.write(`data: ${JSON.stringify(batch)}\n\n`);
		}

		res.end();
	})
	.listen(3000);
```

### Example: complete SSE client

```javascript
import { PFMDocument } from '@mdsvex/parse';

const doc = new PFMDocument();

// Optional: surgical event hooks for fine-grained UI updates
doc.onopen = (node) => {
	/* create UI element */
};
doc.onclose = (node) => {
	/* cache/finalize UI element */
};
doc.ontext = (node, contentIndex, appended) => {
	/* append text to UI */
};
doc.onattr = (node, key, value) => {
	/* update attribute */
};
doc.onrevoke = (parent, revokedNode, delimiter) => {
	/* restructure UI */
};
doc.onclear = (node) => {
	/* clear UI element */
};

const source = new EventSource('/api/parse');
source.onmessage = (event) => {
	const batch = JSON.parse(event.data);
	doc.apply(batch);
	// doc.root is the live tree — render it
	updateUI(doc);
};
```

## Design Principles

1. **Optimistic rendering.** Speculative nodes (pending=1) are sent immediately so the client can render them. Revocation is the rare path — most pending nodes get committed via close.

2. **Text nodes are invisible.** The parser uses internal text nodes (kind=1, "text"), but these are suppressed on the wire. Their content is flattened into `T` opcodes on the parent. The client never sees text nodes.

3. **No source access needed.** All byte offsets are resolved to strings by the emitter. The client works purely with text content and structural opcodes.

4. **Batch-per-chunk.** Each `feed()` call produces exactly one batch. The transport layer decides how to frame batches. The client applies them in order.
