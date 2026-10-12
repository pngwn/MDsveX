# Text rewriting for parse plugins: design

Status: built, 2026-10-13, on `next`. `packages/parse/PLUGINS.md` has the reference, this note has the reasons.

Sources: the plugin audit (`plugins/PLUGIN_AUDIT.md`: emoji at rank 11, references and linkify at 25, typography at 36), investigation I9 of the implementation plan, `packages/parse/src/plugin_dispatch.ts`, both tree builders, `fold_children` and `escape_text_at` in `packages/render/src/html_cursor.ts`.

## Recommendation

- **A `text` function on a sequential plugin, called once for each run of text.** A run is the text of neighbouring text nodes joined. It is not a node, because the two builders do not agree on where one text node ends (section 1).
- **One method, `run.replace(start, end, type, attrs_or_text)`.** It puts a node in place of a range of the run. With `'text'` that is "replace the text". With any other type it is "split the text into nodes". It takes the same arguments after the range as `append` does, and returns the same view.
- **It runs in the sequential pass, when the tree is complete.** Nothing is pending there and nothing is revoked afterwards, so a text rewrite has no undo. A `text` handler on a fused plugin is a `TypeError` when the plugin is registered.
- **The text around a replacement stays the author's.** It keeps its source range, so it is escaped, curled by smart punctuation and mapped as it was. Only the replaced range becomes a plugin node.
- **Code, math, urls, attributes, expressions and raw text never reach a text handler,** because none of them is a text node. Four more things are held back unless the handler asks (section 3), escaped characters among them.
- **No parser change and no renderer change.** One addition to the wire format: a flag on `T` for text that starts at an escaped character (section 5).

```js
const emoji = {
  name: 'emoji',
  sequential: true,
  text(run) {
    for (const match of run.text.matchAll(/:([a-z0-9_+-]+):/g)) {
      const to = table[match[1]];
      if (to === undefined) continue;
      const start = match.index;
      run.replace(start, start + match[0].length, 'text', to);
    }
  },
};

// the same call splits the text
run.replace(start, end, 'link', { href }).append('text', '@ada');
```

## 1. When a text handler runs

**A text node is not a unit a plugin can use.** The batch builder gets a text node for every stretch the parser read without stopping, and the parser stops at each character it has to look at: a colon, an underscore, a star, a bracket, an escape. So `10:30:00` is three text nodes, a bare url with an underscore in it is two, and `a :tada: b` is `a ` and `:tada: b`. The wire builder joins every `T` it is sent for a parent into one node. A revoke adds more: the delimiter the parser gave up on becomes a text node beside the text it held, and the two builders split that differently too (the plugin test harness joins text before it compares two trees for this reason). A handler called per node would match `:tada:` on one builder and miss it on the other.

**So the unit is the run:** the text nodes that sit next to each other under one parent, joined. A line end is a node, so a run never crosses a line. The run is the same string on every path, whole or fed, batch or wire.

**The run is whole once nothing can change the nodes around it.** Three things change them after the text arrived:

- an emphasis, a link or an inline directive that never closes is revoked, and its text moves up into the paragraph, next to the text that was already there
- the paragraphs of a tight list are revoked when the list closes
- an element with no close tag is revoked at the end of the document

The first of these happens after the paragraph closed: the parser closes the delimiter where its block ends and revokes it once it is back at block level. So "the close of the parent" is not the point. The sequential pass is: the tree is complete, nothing is pending, and no revoke follows.

**While a document streams, text shows as written.** The rewrite lands when the stream ends and the consumer runs the sequential pass, as it does for anchors, the table of contents and external links today. In a compile, which is what `mdsvex` does, there is no difference to see.

**A fused text handler is possible and not built.** A run is final once its parent closed for good and nothing above it is pending, and text that a revoke moves into a parent that already closed would be handled at the revoke. That needs every close to go through the dispatcher while a text plugin is registered, a hook at commit and one after each repair, and a mark for each text node that was handled. Its result would have to equal the sequential pass on every document, which is the test it would need. The handler signature would not change, so it can be added later without breaking a plugin. What it buys is rewrites that land block by block in a stream.

## 2. The API

```ts
interface TextRun {
  readonly text: string;      // the run as written, references not decoded
  readonly parent: NodeView;  // the node that holds it
  replace(start: number, end: number, type: 'text', text: string): NodeView;
  replace(start: number, end: number, type: string, attrs?: object): NodeView;
}
```

- **Why one method.** A separate `set_text` would store a string on the text node. The renderer then has to treat the whole node as one kind of text: either the author's, where `&amp;` is a reference and `{x}` is an expression, or a plugin's, where both are characters. A node that is half each cannot be escaped right. `replace` never mixes them: the range becomes a plugin node, and what is left of the run stays author text with its source range. Replacing text and splitting it are then the same operation with a different node type.
- **Why ranges and not a list of matches.** `replace` takes what `append` takes after the range and returns a view, so a link gets its label with `.append('text', label)` and an element its attributes the way every other plugin node does. A list of matches would need a second way to describe a node with children.
- **Ranges index `run.text` as the handler got it,** however many replacements were made, in any order. A range that overlaps an earlier one is a `RangeError`, as is one outside the run. An empty range puts the node in at that point.
- **`run.parent` is a `NodeView`,** so "is this inside a link" is a walk up `parent`.
- **The handler is a function, not a `{ parse }` entry.** An entry for a node type is an object so that it can hold more than its `parse` later. A second object shape under the same index signature takes the types of `node` and `ctx` away from every `heading: { parse(node) {} }` a plugin author writes, since TypeScript can no longer tell which of the two `parse` signatures a literal means. A function has no `parse`, so the node entries keep their types, and it is the shape bound handlers already have.

## 3. What a text handler is kept from

Never a text node, so never in a run, whatever the handler asks: code spans, fences, math, comments, frontmatter, `{expressions}` and Svelte tags, attribute values, link and image urls and titles, and the content of `script`, `style`, `pre` and `textarea`. A plugin that wants code takes a `code_span` or `code_fence` handler, as it always could. This work adds no setter for their text: no plugin in the audit needs one, and a fence has a highlighter between its text and the page.

Held back by default, and given to a plugin that sets `all_text: true`:

- **A character the author escaped.** It is in no run: `\:tada:` gives the run `tada:`, so nothing can match across it or replace it.
- **The text of a link that is its url,** which is what an autolink `<https://a.b>` is, and what a linkify plugin makes.
- **The alt text of an image,** which is written into an attribute.
- **Text inside an element that holds code:** `code`, `kbd`, `samp`, `var`, `tt`.

## 4. Undo

None, by the rule in section 1. The undo log records nothing in a sequential pass and has nothing to replay. The fact that a close callback also fires for a node that is revoked afterwards does not matter here: no text handler runs from a close.

## 5. The wire

- **A wire client runs the same pass on its own tree** and gets the same tree as the batch builder. The run is the same string, and `replace` cuts a wire text node by cutting its string where the batch builder cuts a source range.
- **Nothing new is sent for rewritten text,** because the rewrite happens on the client.
- **One flag is new.** The batch builder knows an escaped character from the source. A wire client has no source, and its joined text for `a \:b` is `a :b`. So `T` gets an optional fourth field, `["T", id, ":b", 1]`, when its text starts at an escaped character. An older client reads three fields and sees no change. A builder without plugins does not record it.

## 6. The renderer

- **Not changed.** A replacement that is text is the plugin text node `append('text', ...)` already makes: a stored string, every character escaped. What is left of the run is text nodes with source ranges, rendered as before.
- **`fold_children` joins text nodes only when the buffer holds no stored string.** A document where a text plugin replaced something has one, so every text node in it is rendered on its own. A document where the plugin matched nothing has none and renders exactly as it did.
- **Smart punctuation runs later, in the renderer,** on the author's text only. It asks the tree for the character next to a quote, so a quote beside a replacement still curls. Text a plugin wrote is not curled.

## 7. Source maps and positions

- **Text around a replacement maps as it did,** character for character.
- **A replacement spans the source it replaced.** In a mapped render a link made from `#12` maps to those three characters. Replacement text has no content record of its own, the record of the block covers it.
- **`position` is `undefined` for a replacement,** as for every node a plugin made.

## 8. Order

- **Sequential plugins run in the order they are listed,** one pass each. A text handler sees the tree the plugins before it left: their text is part of its runs, and the label of a link they made is a run of its own.
- **Linkify before emoji.** A link whose text is its url is held back (section 3), so `https://x.io/:tada:/` survives when the linkify plugin comes first. The other way round the emoji is replaced before the url is seen.
- **Fused handlers read the text as written,** always. They ran during the parse.
- **Heading ids are made before the pass,** from the source, so `# Done :tada:` gets the id `done-tada`.

## 9. Left open

- `TextRun` is not a named export of `@mdsvex/parse`, because its entry point is `main.ts`, which this work did not touch. `mdsvex` exports the type. One line in the export list of `main.ts` would name it there too.
- A run has no `position`, and `ctx.warn` takes a node. A text plugin that warns points at `run.parent`.
- The fused handler of section 1.
