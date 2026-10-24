# PFM Plugin System: Parse Phase

## Overview

Parse plugins hook into tree construction as it happens. They run inside the `TreeBuilder` (batch mode) or `WireTreeBuilder` (streaming mode) and can inspect nodes, mutate their properties, and inject synthetic nodes into the tree. The same plugin code runs in both modes — the builder handles timing differences internally.

Parse plugins never walk the tree themselves. They declare handlers per node type, and the builder invokes them as nodes are encountered. This keeps parse plugins fused into the single pass the builder is already making, with no additional tree traversal cost per plugin.

## Plugin Shape

A parse plugin is an object with node-type-keyed entries. Each entry has a `parse` function that fires when the node opens:

```js
const plugin = {
  heading: {
    parse(node, ctx) {
      // fires on node open
      return () => {
        // optional: fires on node close
      };
    }
  },
  link: {
    parse(node, ctx) {
      // ...
    }
  }
};
```

Only the node types you care about need entries. A plugin that only handles headings has exactly one key. The builder looks up handlers by node type and only invokes them when matching nodes open.

## The Node View

The `node` argument passed to parse handlers is a view over the backing store, not a standalone object. Reads are getters that look up the current state of the node in the SoA. Writes are setters that update the backing store and mark the node dirty.

The view exposes:

**Readable properties**
- `type` — the node type (`'heading'`, `'paragraph'`, etc.)
- `text_content` — flattened text of all descendants (populated as children arrive). It is the text a reader sees: a line end inside a paragraph is a space, and a comment inside the node adds nothing. A comment node still gives its own text
- `parent`, `first_child`, `last_child`, `next`, `prev` — lazy traversal, each returns a view for the corresponding node or `null`
- `position` — where the node is in the source, see [Positions](#positions)
- `pending` — `true` while the parser may still revoke the node, see [Pending nodes](#pending-nodes)
- Type-specific properties surfaced directly (`depth` for headings, `info` for code fences, etc.)
- `info` — the info string of a code fence, its language and everything after it, see [The info string of a fence](#the-info-string-of-a-fence). `lang` is the same string under its older name.
- `math` — `true` for a `code_span` written as inline math (`` $`x`$ ``), whose text is the LaTeX, `false` for any other code span and `undefined` for any other node. A `code_span` handler sees both.
- A `definition` is a link reference definition, `[label]: href "title"`. It carries `label`, `href` and `title` (only when not empty) in `node.attrs`, has no children and renders nothing. The links that use it already carry its `href` and `title`.
- A `footnote_reference` and a `footnote_definition` carry their label as `node.attrs.label`. The text of a reference is empty, and the text of a definition is that of its blocks. `footnote_index(buf)` from `@mdsvex/parse/buf-utils` numbers the footnotes of a finished tree as the compile does.

**Writable properties**
- `attrs` — a key-value bag for arbitrary attributes. Proxied so setter calls flow through to the SoA and trigger dirty marking.
- `type` — yes, writable. Changing the type rewrites the type slot in the SoA. The renderer will read the new type when rendering. No validation — if you set heading `type` to `paragraph`, `depth` becomes meaningless but the system doesn't care.

**Structural methods**
- `wrap_inner(type, attrs?)` — inserts a new node between this node and its current children, returns the new node's view
- `prepend(type, attrs?)` — inserts a new node as the first child, returns the new node's view
- `append(type, attrs?)` — inserts a new node as the last child, returns the new node's view
- `prepend('text', text)` and `append('text', text)` — the same for a text node, which takes its text in place of attrs (see [Adding text](#adding-text))
- `wrap_from(type, attrs?)` — inserts a new node as the parent of this node and of every sibling after it, returns a view of the new node with a `close()` method (see [Grouping siblings](#grouping-siblings-wrap_from))
- `remove()` — takes this node and everything in it out of the tree (see [Removing a node](#removing-a-node))

### Positions

`node.position` is `{ start, end }`, each a point `{ offset, line, column }`:

```js
heading: {
  parse(node, ctx) {
    return () => {
      const { start, end } = node.position;
      // start: { offset: 12, line: 4, column: 0 }
    };
  }
}
```

- **`offset`** indexes the source the parser read, in which every newline is a `\n`. A document written with `\r\n` has other offsets on disk.
- **`line`** counts from 1 and **`column`** from 0. Both hold in the document as it was written, `\r\n` or not.
- **`end` is `undefined` while the node is open**, which is the case in its own open handler. The close callback has it.
- **`position` is `undefined` for a node a plugin made**, which has no source, **and over the wire**. The wire format carries text and no offsets, so a tree built by `WireTreeBuilder` cannot say where a node was.

The line table is built from the source the first time a position is read, so a plugin that reads none pays nothing.

### Pending nodes

The parser opens some nodes on a guess: an emphasis before it has seen the closer, a link before its destination, an inline directive before its closing bracket, an element before its close tag, the paragraph of a list item while the list can still be tight. `node.pending` is `true` for such a node until the parser settles it.

```js
link: {
  parse(node) {
    node.pending; // true, the destination may never come
    return () => {
      // false, this link closed, so it can be wrapped
      if (!node.pending) node.wrap_from('html', { tag: 'span' }).close();
    };
  }
}
```

- **`wrap_from` and `close()` throw exactly when the node whose handler or close callback is running is pending.** Read `node.pending` there to know. Every other method works on a pending node, and is undone if it is revoked.
- **In a close callback it is `false` for a node that closed for good**, which is every close but two: a delimiter with no closer, which the parser closes where its block ends and then revokes, and a pending paragraph, which a commit or a revoke settles later. Those two still read `true`.
- **It is the node you ask about.** `node.parent.pending` in the handler of an emphasis inside a tight list item is the paragraph's.
- **Not pending is not never revoked.** The parser also revokes a few nodes it opened as certain: a table cell that turns out to be a merge marker, a code span that never closes, frontmatter with no closing fence.
- **In a sequential pass nothing is pending**, and neither is a node a plugin made.

### Mutation Semantics

Property mutations are **local to the node being mutated**. Setting `node.attrs.id = 'foo'` writes to that one node's slot and does nothing else. It cannot cause side effects elsewhere in the tree.

Traversal is cheap and safe. You can reach any node from any other node via `parent`/`first_child`/etc., and mutate its properties:

```js
parse(node, ctx) {
  if (node.parent?.type === 'heading') {
    node.parent.attrs.class = 'has-link';
  }
}
```

The parent is a view over the same backing store. Writing `attrs.class` on it updates the heading's attrs slot directly. The dirty marking machinery handles re-rendering automatically.

Structural mutations (`wrap_inner`, `prepend`, `append`, `wrap_from`) can also be called on any node reached via traversal, not just the handler's own node. The builder handles the consequences — updating SoA pointers, emitting synthetic opcodes where appropriate, marking the affected subtree dirty.

A node made by a structural method is flagged as synthetic in the buffer (`NodeBuffer.synthetic_at(index)`, `Cursor.synthetic`). The renderer reads the flag to tell an element a plugin made from one the author typed, and a revoke repair reads it to find the parent the parser made.

When the new node is a directive, its `args` must be an object of strings, which is how the parser sets them and how they reach a component as props. A value of any other type throws a `TypeError` where it is set, in the `attrs` passed to a structural method or in a later `node.attrs.args = ...`.

### Adding text

A text node takes its text as the second argument of `prepend` or `append`:

```js
link: {
  parse(node) {
    return () => {
      // read out after the link text, and shown to nobody
      const label = node.append('html', { tag: 'span', attributes: { class: 'visually-hidden' } });
      label.append('text', ' (opens in a new tab)');
    };
  }
}
```

- **The text is text, not markup.** A renderer escapes it like any other, so `<`, `&` and a `{` come out as characters.
- **It needs the text.** `append('text')` throws a `TypeError`, and so does a string given to a node of any other type, whose second argument is its attrs.
- **It keeps to itself.** Text the parser sends for the same parent afterwards is a node of its own on both builders, so `prepend('text', 'Step 1: ')` in a heading's open handler leaves two text nodes, the plugin's and the heading's.
- **`text_content` reads it**, on the node and on everything that holds it.
- **It is revoked like any node a handler made.** When the node whose handler added it is revoked, the text goes.

No node handler runs for a text node, the parser's or a plugin's. Text has a handler of its own shape, see [Text Handlers](#text-handlers).

### Removing a node

`node.remove()` takes a node out of the tree with everything it holds:

```js
// comments do not reach the page
html_comment: {
  parse(node) {
    return () => node.remove();
  }
}
```

Nothing undoes a removal, so it is only allowed where no revoke can ask for the node back. Anywhere else it throws.

- **From a close callback, once the node it runs for closed for good.** That is every close callback where `node.pending` is `false`. In the callback of a delimiter the parser gave up on, or of a pending paragraph, `remove()` throws, since a revoke may follow. Guard with `if (!node.pending)` where the node can be either.
- **Or from a sequential pass,** in a handler or a close callback. The tree is complete there.
- **Never from an open handler of the fused pass.** The parser has more to send for the node.
- **The node itself, or a node inside it.** A handler removes the node it runs for or one of its descendants: a container its label, a list one of its items. A node outside it, such as an earlier sibling, may already be rendered, and removing it throws. The root is never removed.
- **A node that is already out stays out.** A second `remove()` does nothing.

What follows from it:

- **The view still reads.** Its `parent`, `next` and `prev` are `null`, and its own content is as it was.
- **A removed wrapper takes no more children.** The later children of its parent go to the parent.
- **Its handlers have run.** A removal in a close callback comes after every handler inside the node. In a sequential pass, a node removed in its own handler is not walked: no handler runs for what it held, and the close callback it returned does not run.
- **The parser can still revoke it.** A delimiter that never closes is revoked after its paragraph closed, by which time the paragraph's callback may have removed it. Such a revoke undoes what the node's handlers did and repairs nothing, and the node stays out.
- **A heading removed in its own close callback gets no id,** see [Heading ids](#heading-ids). One removed later has already taken its id.

### Grouping siblings: `wrap_from`

`wrap_inner`, `prepend` and `append` add nodes inside a node. `wrap_from` groups a node with the siblings that follow it:

```js
const wrapper = node.wrap_from('html', { tag: 'section' });
// ...
wrapper.close();
```

- **What it does.** The wrapper takes the node's place under its parent and the node becomes its first child. Every later child of that parent goes into the wrapper, until `close()` is called or the parent closes.
- **`close()`.** No later sibling joins the wrapper. A child that is still open keeps the wrapper open until that child closes, so `node.wrap_from(type).close()` in the node's open handler wraps that node alone. Closing a closed wrapper does nothing. `close()` removes only this wrapper's hold on later siblings: a wrapper around it, or a `wrap_inner` wrapper of the parent, keeps taking them.
- **The node must be the last child of its parent.** A later sibling may already have been rendered, and nothing moves a node that has gone downstream, so `wrap_from` throws for a node that has one. In an open handler the node in hand always qualifies. An earlier sibling does not, and neither does an open wrapper: the node in hand sits after it until its handlers return.
- **Nesting.** A wrapper opened while another is open goes inside it. Closing the outer one closes the inner ones. To get siblings, close the open wrapper first.
- **With `wrap_inner`.** A `wrap_inner` wrapper of the parent holds the `wrap_from` wrappers like any other child, whichever came first.
- **Not from the handler of a pending node.** `wrap_from` and `close()` throw when the node whose handler or close callback is running is pending (an emphasis before its closer, a tight list paragraph, an unclosed html element). Undoing them moves nodes, and pending nodes are revoked often. Headings and block directives are never pending. `node.pending` says which it is, see [Pending nodes](#pending-nodes).
- **In a sequential pass** the tree is complete, so the wrapper holds that node alone and is closed at once.
- **Spans.** The wrapper starts where the node it wrapped starts. It has no source of its own, so it ends there too once it is closed. The renderers cache a top level block once it has an end, so a closed wrapper at the root is not rendered again.

The steps shape, each heading directly inside `:::steps` starting a `step` with the heading as its label:

```js
const steps = {
  heading: {
    parse(node, ctx) {
      const parent = node.parent;
      if (parent?.type !== 'directive_container' || parent.attrs.name !== 'steps') return;
      // one open step per steps directive, by its buffer index
      const open = (ctx.steps ??= new Map());
      open.get(parent._index)?.close();
      open.set(parent._index, node.wrap_from('directive_container', { name: 'step' }));
      node.wrap_from('directive_label').close();
    }
  }
};
```

Content before the first heading stays a direct child of `steps`, the last step closes with it, and a heading inside a nested blockquote is left alone because its parent is the blockquote.

The same plugin is shorter as a handler bound to the directive, see [Handlers Bound to a Directive](#handlers-bound-to-a-directive).

**Keep the open wrapper on `ctx`.** A plugin object serves every document a compiler session parses, and a view only lives for the document it was made in. A wrapper kept in a closure is still there when the next document starts, and calling `close()` on it throws like any stale view. `ctx` is a new object for each document, so what is kept there starts empty. See [The Context](#the-context).

### Node View Identity

Views are cached by node ID within a single dispatch. If two handlers both read `node.parent`, they get the same view object. This matters because the attrs proxy needs stable identity for dirty tracking to work correctly.

The cache is short-lived — it exists for the duration of plugin dispatch on a single node and is discarded afterward. Views are cheap to create, so this isn't an optimization concern, it's a correctness requirement.

A view belongs to the document it was made for. A close callback can hold the views its open handler made, as the examples below do. Once the builder is reset for another document (`TreeBuilder.reset()`, `WireTreeBuilder.reset()`, or the next compile of a `CompilerSession`) every earlier view throws on use, because the buffer it points into now holds other nodes. Copy what you need out of a view (`text_content`, attrs) rather than keeping the view. The `ctx` object is new for each document too.

## The Context

The second argument of every handler is its context. Each plugin gets its own for each document. What a plugin keeps between its handlers goes in [`ctx.scratch`](#ctxscratch).

```js
const toc = {
  name: 'toc',
  // the tree is complete in a sequential pass, see below
  sequential: true,
  heading: {
    parse(node, ctx) {
      const headings = ctx.data.headings ?? [];
      const last = headings[headings.length - 1];
      if (last && node.depth > last.depth + 1) {
        ctx.warn('skipped_level', `h${node.depth} follows h${last.depth}`, node);
      }
      ctx.add('headings', { depth: node.depth, text: node.text_content, id: node.attrs.id });
    }
  }
};
```

| member | what it is |
|---|---|
| `ctx.filename` | the path of the document, `undefined` when whoever runs the parse gave none |
| `ctx.frontmatter` | the parsed frontmatter, `undefined` for a document without any |
| `ctx.warn(code, message, node?)` | reports a problem, at the node when one is given |
| `ctx.set(key, value)` | one value under a key of what the plugin hands back from the parse |
| `ctx.add(key, value)` | one entry of a list under a key, in document order |
| `ctx.data` | what the plugin has written so far, read-only |
| `ctx.scratch` | what the plugin keeps for itself through the document, never published |
| `ctx.defer(node, task)` | async work for the node, see [Deferred tasks](#deferred-tasks) |
| `ctx.depend(path)` | names a file the output depends on, see [Loading](#loading-and-dependencies) |
| `ctx.read(path)`, `ctx.resolve(specifier)` | read and resolve with what the host passes |
| `ctx.cached(key, load)` | a load shared by the documents of a compiler |
| `ctx.id(base)` | an id no element of the document has, see [Ids](#ids) |

A handler bound to a directive gets the same members beside `directive`, `index` and `state`.

### `ctx.filename` and `ctx.frontmatter`

The parser knows neither. Whoever runs the parse tells the dispatcher, see [For whoever runs the parse](#for-whoever-runs-the-parse). `mdsvex` passes its `filename` option, which in the Vite plugin is the id of the document without its query, and parses the frontmatter with its `frontmatter.parse` option. `parse_markdown_svelte` takes them as its `filename` and `frontmatter` options, and gives `undefined` for one it was not given.

- **The frontmatter is read when a handler first asks.** A plugin that never reads it costs a document nothing, and the parser of the `frontmatter.parse` option still runs once for a document however many handlers read it.
- **It is available to every handler but one.** Frontmatter is only ever the first node of a document, and the parser closes it before it opens anything else, however the source is fed. The one handler that runs earlier is the open handler of the `frontmatter` node itself, which gets `undefined`. Its close callback has it.
- **Do not write to it.** In `mdsvex` it is the object the compile returns and exports as `metadata`.
- **Frontmatter that does not parse throws** from the handler that reads it, with the error the compile would have thrown after the parse.

### `ctx.warn`

`ctx.warn(code, message, node?)` records a warning with the name of the plugin. `code` is a short stable string that a caller can filter on, and both it and `message` must be strings.

- **With a node, the warning carries its offsets** (`start` and `end`), on a tree built from the source. Over the wire, and for a node a plugin made, it has none. See [Positions](#positions).
- **A warning belongs to the node whose handler reported it,** whichever node it points at. If that node is revoked the warning is dropped, like the attrs the handler wrote. A link with no destination, an emphasis that never closes and the paragraphs of a tight list all go this way, so a handler can warn as soon as it sees a problem.
- **A warning from a sequential pass, or from the close callback of a node that is final, stays.**

In `mdsvex` these join the `warnings` of the compile, with `plugin` set to the name of the plugin and `start` as a line and a column. The Vite plugin reports them like any other warning.

### `ctx.set`, `ctx.add` and `ctx.data`

A plugin hands something back from a parse by writing it: a table of contents, a reading time, an excerpt.

```js
heading: {
  parse(node, ctx) {
    return () => {
      ctx.add('headings', { depth: node.depth, text: node.text_content });
      ctx.set('last', node.text_content);
    };
  }
}
```

- **`ctx.set(key, value)`** keeps one value under a key. **`ctx.add(key, value)`** adds one entry to a list under a key. A key holds one or the other: a `set` to a key that holds a list throws a `TypeError`, and so does an `add` to one that holds a value.
- **One store per plugin name, per document.** Two plugins cannot overwrite each other. Plugins that share a name share it, which is how the `parse` plugin and the bound handlers of one `mdsvex` plugin write to the same place. A plugin needs a `name` to write or read, without one these throw.
- **Keys are flat strings.** Structure lives in values. A plugin that wants a map writes keys with a prefix (`entry:smith2020`) or keeps a list.

#### Every write has an owner

A write belongs to the node whose handler or close callback made it, whichever node it is about. A write from a sequential pass belongs to no node.

- **A revoke takes back exactly the owner's writes.** When the parser revokes a node, every `set` and `add` it owned goes and each key holds what it would have held without them. A link with no destination, an emphasis that never closes and the paragraphs of a tight list all go this way, so a handler can write as soon as it knows something.
- **`add` keeps entries in document order.** An entry sorts by its owner's place in the source, not by when it was written. The close callback of a heading runs after those of the links inside it and still comes first, and a batch parse, a parse fed in pieces and a tree built over the wire give the same list. One owner's entries keep the order it added them. Entries with no owner come after the rest, in the order they were added.
- **`set` resolves conflicts by document order too.** Of two owners that set one key, the value of the later one in the source stays. One owner that sets a key twice leaves its last value. A `set` with no owner comes after every owner, and of two such the last one stays. So the result does not depend on the order handlers ran in.
- **Nothing else is undone.** What a plugin keeps in [`ctx.scratch`](#ctxscratch), or in a variable, is not owned and a revoke leaves it as it was.

#### Values are json

- **A value is checked when it is written.** A value JSON cannot hold throws a `PluginDataError` from the write: a function, `undefined` (in an array or as the value), a `NaN` or an infinity, a bigint, a symbol, an object with a prototype such as a `Date` or a `Map`, a symbol key, or an object that holds itself. The error carries `plugin`, `key`, `path` (where the value is under the key, `headings[2].id`) and `position`, where the owner is in the source, `undefined` over the wire and for a write with no owner. Keep to plain objects, arrays, strings, finite numbers, booleans and `null`. A key of an object that holds `undefined` is left out, as JSON does.
- **It is copied and frozen.** A change to the object after the write changes nothing, and the copy cannot be changed.

#### Reading

`ctx.data` is the plugin's data as it stands, read-only. A plugin reads it to decide things, whether an id has been used, say, or what the last heading was.

- **Assigning to it throws** a `TypeError` that names `ctx.set`, and so do deleting a key and assigning `ctx.data` itself. What it holds is frozen.
- **A list reads in document order,** with the entries that are live now. An entry of a pending node is there until the node is revoked.
- **It spreads and stringifies** as a plain object.

#### What a parse gives back

`dispatcher.data()` gives an object per plugin name, its `add` keys arrays in document order and its `set` keys their values. A plugin that left nothing has no key, and a parse where no plugin left anything gives `undefined`.

In `mdsvex` the objects come back as `data` on the result of a compile, keyed by plugin name: `compile(source, { plugins: [toc()] }).data.toc.headings`. The compiled document exports the same object as `plugin_data`, its template takes it as a prop of that name, and a `?data` import gives it without a render.

#### Following changes

The dispatcher calls a listener for each change to the data of any plugin: a write, or a revoke that took one back.

```js
const stop = dispatcher.on_data(({ plugin, key, value }) => {
  // value is what the key holds after the change, undefined once it holds nothing
});
```

- **The event carries the value after the change,** not a diff. A list event carries the whole list, frozen and in document order. So a consumer that missed events only needs the latest one per key.
- **A streaming view** follows these so a component that reads the data renders again as it changes. A compile ignores them and reads `data()` at the end.
- **A listener stays from one document to the next.** The function `on_data` returns stops it.

### Ids

A plugin that gives a node an id asks for one, so it never takes an id a heading, a footnote or another plugin has:

```js
link: {
  parse(node, ctx) {
    return () => {
      node.attrs.id = ctx.id(node.text_content); // 'install', then 'install-1'
    };
  }
}
```

- **A free id from the base.** The base itself, or the next repeat of it that is free, `-1`, `-2`, as heading ids are numbered. Ids are given in the order handlers ask, which is document order for the fused pass, and the sequential passes and document hooks come after it.
- **One set of ids for the document.** With a `HeadingIds` on the builder, `heading_ids` in `mdsvex`, the headings, the element headings with an id, the footnotes and every plugin share it, see [Heading ids](#heading-ids). Without one, a dispatcher keeps a set of its own for the ids plugins ask for.
- **Owned like a write.** The id belongs to the node whose handler asked, and a revoke of that node frees it.
- **`ctx.id(id, { fixed: true })`** is for an id the author wrote, such as `{#install}` in a heading a plugin reads. It is kept as it is, and one a node before it was given is a `HeadingIdError`. An id set straight on a heading with `node.attrs.id` counts as fixed too.
- **Only in a handler,** a close callback, a sequential pass or a document hook. A deferred task has none, ask in the handler that defers.

### `ctx.scratch`

What a plugin keeps for itself through one document: the lists it has seen, a counter, the node it will fill in at the end. Nothing in it is published.

```js
const plugin = {
  name: 'refs',
  parse: {
    document(root, ctx) {
      // no walk to find the lists, the handler kept them
      for (const list of ctx.scratch.lists ?? []) list.attrs.count = String(ctx.data.cited?.length ?? 0);
    },
  },
  directives: {
    references: {
      parse(node, ctx) {
        const lists = (ctx.scratch.lists ??= []);
        if (lists.length > 0) ctx.warn('more_than_one', 'one list is enough', node);
        lists.push(node);
      },
    },
  },
};
```

- **One object per plugin name, per document.** Every handler, close callback, sequential pass, handler bound to a directive, deferred task and document hook of the plugin gets the same one. Plugins that share a name share it, so the `parse` plugin and the `directives` of one `mdsvex` plugin meet there. Reading it throws for a plugin with no `name`.
- **Anything goes in it,** nodes, maps, functions. It is never checked as JSON, never part of `data()`, the compile result or a data event.
- **It is made empty for each document** and dropped when the dispatcher takes the next one. A node kept in it stays a valid view until then, so the document hook can read the nodes the handlers kept.
- **A revoke does not touch it.** What a handler of a revoked node put there stays. So keep there only what a revoke cannot make wrong: facts about, and nodes of, the kinds the parser never revokes (a block directive, a heading at its close), and anything from a sequential pass or the hook. A node that may be revoked does not belong there: once revoked it is out of the tree, and its view does not say so the same way for every construct. A value that must follow revocation goes through `ctx.set` and `ctx.add`.
- **A deferred task writes to it at once,** not with the task's other changes, and the write stays if its node is revoked and those changes are dropped.
- **It is not `ctx.state`.** The state of a [bound handler](#the-context-1) is one object per directive in the document and its writes are undone with their node. The scratch is one per plugin for the whole document and is never undone.

A key put on `ctx` itself is not part of the context: TypeScript rejects one, and a bound handler's context is new for each call, so what it was given is gone after the call.

### Deferred tasks

A handler cannot wait: the parser does not pause for it, and neither does a stream. `ctx.defer(node, task)` starts async work for a node and lets the parse carry on:

```js
directive_inline: {
  parse(node, ctx) {
    if (node.attrs.name !== 'cite') return;
    return () =>
      ctx.defer(node, async (node, ctx) => {
        const entry = await lookup(node.text_content);
        node.attrs.label = entry.short;
        ctx.set(`entry:${entry.key}`, entry);
      });
  }
}
```

- **The node is the one whose handler or close callback runs.** Any other node is a `TypeError`, and so is a task that is not a function.
- **It starts at once,** in the handler, and the parse goes on while it runs.
- **The task gets a node and a context of its own** and changes the document through them. They read as the handler's do. The handler's `node` and `ctx` belong to the handler: a write through them once the handler returned is a `TypeError` that says so. Naming the parameters `node` and `ctx`, as above, shadows the handler's.
- **Its changes are kept and applied later,** once the task has settled and its node is committed. A read inside the task sees the tree as it is with the task's own attrs on top. `ctx.data` reads the data as it stands, without what the task wrote.
- **A revoked node takes its tasks with it.** What they did is dropped and nothing is reported, errors included. A task on a node that is never pending, or one deferred from a close callback of a node that closed for good or from a sequential pass, is committed at once.
- **What a task may change:** its node and what is inside it (attrs, `type`, `append`, `prepend`, `wrap_inner`, and `remove` of what is inside), data owned by its node through `ctx.set` and `ctx.add`, and `ctx.warn` about its node or a node reached from it. A node it adds can take attrs and nodes of its own. Anything else throws a `TypeError` in the task: another node, `wrap_from`, removing its own node, or `ctx.defer` again. That is what keeps the final tree independent of the order tasks finish in.
- **Applied in document order.** A host applies tasks sorted by where their nodes are in the source, and tasks of one node in the order they started. Data is owned by the node, so it sorts as any write does.
- **A value JSON cannot hold** throws a `PluginDataError` in the task, at the write.
- **Sharing work** between tasks and documents, such as loading a bibliography once, goes through [`ctx.cached`](#shared-loads).
- **What it adds is the host's to see.** A host that looks through the tree for what a document needs looks again once the tasks applied. In `mdsvex`, `CompilerSession.settle` makes `Parsed.needs` again, so an image whose `src` a task set is imported and a fence it adds with `src=` shows its file, in `compile_async` and the Vite plugin alike. The same holds for an async document hook.
- **The task's context** has `filename`, `frontmatter`, `data`, `scratch`, `set`, `add`, `warn`, `depend`, `read`, `resolve` and `cached`.

A parse that cannot wait for async work throws a `PluginAsyncError` at the first `ctx.defer`. In `mdsvex` that is `compile()`, which points to `compile_async()`.

### The document hook

Work that needs the whole document, a check across every heading or numbering that depends on what comes later, goes in a `document` hook:

```js
const outline = {
  name: 'outline',
  document(root, ctx) {
    for (let child = root.first_child; child !== null; child = child.next) {
      if (child.type === 'heading') ctx.add('depths', child.depth);
    }
  }
};
```

- **It runs once,** after the parse, after the sequential passes and after every deferred task has applied. Hooks run in plugin order, each awaited before the next.
- **It gets the root** and walks the tree itself. It may change any node, as a sequential pass may, and nothing in the tree is pending.
- **Its writes belong to no node** and are never revoked. While a hook that returned a promise waits, its writes are still its own.
- **It may be async.** One that returns a promise needs a host that waits, `compile_async()` in `mdsvex`. Under a parse that cannot wait it throws a `PluginAsyncError`. One that returns nothing runs under `compile()` too.
- **It defers nothing.** `ctx.defer` in a hook throws a `TypeError`, every task has run by then.
- **On a streaming client** it runs when the host finishes the document, after the stream ended. A plugin that wants to show something sooner does that part per node.

### Loading and dependencies

Plugins load what they need themselves, with `fetch`, `node:fs` or anything else. The core does not wrap the file system. What it does is keep track:

- **`ctx.depend(path)`** names a file the output depends on, from any handler, task or hook. A path that does not exist yet counts too. It takes an absolute path and throws a `TypeError` for any other. `dispatcher.dependencies()` gives them, each once, `undefined` for none, and in `mdsvex` a compile result has them as `dependencies`. A host that watches files compiles the document again when one changes.
- **`ctx.read(path)`** reads a file with the `read` the host passed in the document (`set_document({ read })`, the `read` option of `mdsvex`) and makes the path a dependency. It returns a promise, so it is for a task or a hook. Without a reader it throws a `TypeError`. `mdsvex/compile` has no reader of its own, which keeps it free of Node, the Vite plugin passes one.
- **`ctx.resolve(specifier)`** resolves a specifier from the document with the `resolve` the host passed, `null` when nothing matches.

#### Shared loads

Many documents often need the same thing: one bibliography, one endpoint. A variable in the plugin's module goes stale in a dev server, since only the host knows the file changed, and two documents that compile at once both load it. `ctx.cached` does neither:

```js
const bib = await ctx.cached(path, (path) => ctx.read(path).then(parse_bib));
```

- **Shared across documents.** The cache is the host's (`set_document({ cache })` with a `PluginCache`), by plugin name, and lives as long as the host keeps it: in `mdsvex` a `CompilerSession`, for the Vite plugin the dev server, for `compile_async` the plugins array passed to it.
- **It holds the promise,** so documents that ask at once share one load. A load that rejects is not kept and the next document tries again.
- **A key that is an absolute path is a dependency** of each document that asks, whether the value came from the cache or not.
- **The host drops path keys.** `PluginCache.invalidate(paths)`, `CompilerSession.invalidate(paths)` in `mdsvex`, drops every entry keyed by one of them, before the documents that depend on them compile again. Other keys, a url say, are never dropped. A plugin that wants them to expire does that itself.
- **It needs a plugin name.** Without a cache from the host each dispatcher keeps one of its own.

### For whoever runs the parse

`mdsvex` does this for its own compiles. A caller with a builder of its own talks to the dispatcher:

```js
const dispatcher = new PluginDispatcher(plugins, text_source, directive_handlers);
dispatcher.set_document({
  filename: '/docs/intro.svx',
  // called when a handler reads ctx.frontmatter, so cache what is costly
  frontmatter: () => metadata,
});
// ... parse, then run_sequential ...
dispatcher.warnings; // [{ plugin, code, message, start, end }] or undefined
dispatcher.data();   // { [plugin name]: object } or undefined
```

- **`set_document` is forgotten at a reset.** Call it for each document, after `TreeBuilder.reset()` or `WireTreeBuilder.reset()`.
- **`warnings` and `data()` are for the document just parsed** and start empty at the next reset. Read them after `run_sequential`. `data()` makes a new object for each plugin name at each call, and the values in it are frozen.
- **`on_data(listener)`** follows each change to the data while the document is parsed, see [Following changes](#following-changes).

What plugins defer is the host's to wait for:

```js
dispatcher.allow_async = true; // false makes ctx.defer throw a PluginAsyncError
// ... parse, then run_sequential ...
const finished = dispatcher.finish(nodes); // undefined when everything ran at once
if (finished) await finished;
dispatcher.data(); // what the tasks and hooks wrote is in here now
```

- **`finish(nodes)`** settles the deferred tasks, then runs the document hooks in plugin order. It returns `undefined` when nothing had to wait, so a document without async work stays synchronous. Call it once, after `run_sequential`.

- **`settle()`** is the first half of `finish`. It waits for every task of the document, then applies those whose node is committed, in document order. A task that rejected rejects it with a `PluginTaskError` that names the plugin and the position of the node, with the task's error as `cause`, and then nothing applies. Call it after the parse and the sequential passes. `deferred` is `true` while a task has not applied.
- **`apply_ready()`** is for a host that streams. It applies each task that has settled and whose node is committed, in document order, and returns the nodes whose tasks applied, `null` for none. A task that rejected becomes a `task_failed` warning and leaves its node as it was. `on_settled(listener)` calls the listener each time a task settles, so the host knows when to call it.
- **A reset drops the tasks of the document.** They run on and nothing they do is applied.
- **A wire consumer has no frontmatter in its tree.** The wire sends a frontmatter node with no text, so `frontmatter` is whatever the consumer was sent beside the stream.
- **A plugin's name** is its `name` key. A table of bound handlers gets one as `{ name, directives }` in place of the bare table.

`parse_markdown_svelte` does the same for a parse in one call:

```js
const { nodes, warnings, data } = parse_markdown_svelte(source, {
  plugins,
  filename: '/docs/intro.svx',
  // called once with the text between the fences, when a handler first reads ctx.frontmatter
  frontmatter: (text) => yaml.parse(text),
});
```

- **`frontmatter` is the parser of the frontmatter,** not its value. The parser does not read YAML, so without the option `ctx.frontmatter` is `undefined`.
- **`warnings` and `data` are `undefined`** when no handler left any, and always without plugins.

## Handler Lifecycle

### Open-Time Execution

The `parse` function fires when the builder encounters a node's open opcode. At this point:

- The node's type and initial attrs are known
- Its parent is known
- Its children have not yet arrived
- `text_content` is empty (or partial, if content is streaming in)

This is the window for structural mutations. `wrap_inner` works because the children haven't been emitted downstream yet — the builder can inject the synthetic node's open opcode immediately, and subsequent children stream through it naturally.

**A directive has its name by then.** The parser sends the name of a directive straight after its open, ahead of its label and its content, so the open handlers of a `directive_container`, `directive_leaf` or `directive_inline` node wait for it:

```js
directive_container: {
  parse(node) {
    if (node.attrs.name === 'note') node.wrap_inner('html', { tag: 'aside' });
  }
}
```

- **A block directive has its `args` too**, as the parser sends them ahead of the name. The `(key=val)` list of an inline directive follows its closing bracket, so its open handlers see no args and its close callback sees them.
- **Nothing else changes for the node.** It has no children yet, and it is placed [as any handled node is](#where-a-node-is-placed), after its handlers ran.
- **With an emitter of your own**, a directive that is sent no name runs its open handlers without one, before the next node opens or anything closes.

### The info string of a fence

The open handlers of a `code_fence` wait as well, for its info string, which the parser sends before any of its code. So `node.info` is whole in the open handler, and that is the place to read it:

```js
code_fence: {
  parse(node) {
    node.info; // 'ts [app.ts] {1,3}', '' for a fence with none
    // nothing of the code has arrived, node.text_content is ''
  }
}
```

- **It is the whole line after the fence**, the language and what follows it. The parser does not split it. In `mdsvex`, `fence_meta(node.info)` from `mdsvex/compile` reads it the way a compile does: the language, a `[name]` or `title="..."`, a caption, `src=`, and the `key=value` pairs and flags.
- **While the document streams**, the handlers run once the line of the opening fence is complete. Over the wire a fence with an empty info string is sent none, and its handlers run when its first text or its close arrives.
- **Any other node has no `info`**, it reads `undefined`.

### The code of a fence a plugin makes

A fence keeps its code on itself, not in a text child. A fence a plugin makes has none, so the text of the nodes put in it is its code, in order, a break in them a line end:

```js
const fence = node.append('code_fence', { info: 'ts' });
fence.append('text', 'let a = 1;\n');
fence.append('text', 'let b = 2;');
// renders as the fence typed with those two lines, fence.text_content is the code
```

- **Any way the fence was made**, `append`, `prepend` or `wrap_inner`, from a handler, a task or a document hook. A fence that `wrap_inner` puts around a paragraph has the paragraph's text as its code.
- **Text put in a typed fence follows its code.**
- **Everywhere the code is read**: the html, a highlighter, the `code` prop of a `pre` replacement, a block that runs. A fence with `src=` has no code of its own, so text in it is an error, as code typed in it is.
- **A code span and a comment are the same.** They keep their text on themselves too, so the text a plugin puts in one is its code or its text, after any it was typed with: `node.append('code_span', { info: 'ts' }).append('text', 'let a')` renders as `` `#!ts let a` `` does.
- `buf_code(buf, index, source)` from `@mdsvex/parse/buf-utils` reads it from a buffer.

### Where a Node Is Placed

A parent can have an open wrapper that takes its later children, from `wrap_inner` or `wrap_from`. A node whose type has a handler is placed in three steps:

1. It is added under its **source parent**, the node it was written inside.
2. Its handlers run.
3. It moves to wherever a new child of its current parent goes: into the innermost open wrapper, or nowhere if a handler wrapped it.

A node whose type has no handler, and text, goes straight to the innermost open wrapper.

An open wrapper costs the rest of the document very little. The batch builder only looks up the direct children of the node that has the wrapper, so that they land inside it. A node deeper down, such as the inline content of a paragraph in a section, or anything inside a list in a step, is built as it is in a document without plugins.

So what a handler sees depends on when it looks:

| | in the open handler | in the close callback |
|---|---|---|
| `node.parent` | the source parent, whatever wrappers it has | the parent in the tree, such as the wrapper |
| `node.prev` | the last child of the source parent, which is the open wrapper if there is one | the previous sibling in the tree |

A handler that asks "is this heading directly inside `:::steps`" reads `node.parent` at open and gets the same answer for the first heading and the fifth.

This changed with `wrap_from`. Before, a child of a parent that had a `wrap_inner` wrapper saw that wrapper as `node.parent` in its open handler. It now sees the parent, and the wrapper in its close callback.

### Close-Time Execution

Returning a function from the parse handler registers it as a close callback. It fires when the node's close opcode is processed, after all children have been added to the tree.

At close time:

- All children are present in the SoA
- `text_content` is fully populated
- Traversal of descendants is meaningful

This is the window for data-dependent work. Slug generation, content analysis, anything that needs to see the finished node.

The closure captures whatever state the open handler set up:

```js
heading: {
  parse(node, ctx) {
    const link = node.wrap_inner('link');

    return () => {
      const slug = slugify(node.text_content);
      node.attrs.id = slug;
      link.attrs.href = `#${slug}`;
    };
  }
}
```

`link` is captured by closure. On close, the callback uses it directly — no lookup, no re-traversal.

**A heading is settled when it closes.** Its line has ended, so anything in it that never closed, an element such as `<head>`, an emphasis with no closer or a link with no destination, is already text when its close callbacks run.

### Heading ids

A builder given a `HeadingIds` with `set_headings` makes the id of each heading at its close, as the `heading_ids` option of `mdsvex` does, the same on the batch builder, fed or whole, and on the wire builder:

```js
import { HeadingIds, heading_slug } from '@mdsvex/parse';

const ids = new HeadingIds(heading_slug, is_entity_name);
ids.start(source); // the source the value ranges index, none over the wire
tree.set_headings(ids);
// ... parse ...
ids.finish(tree.get_buffer()); // WireTreeBuilder.end() does this
```

- **When.** After the close callbacks of the heading, or earlier: the first close callback that reads `node.attrs` gets the id made then. So a plugin that changes the text of a heading in its close callback, by removing a child say, changes the id only if it comes before the first plugin that reads it. An open handler never sees an id.
- **From the ids before it.** `HeadingIds` is the one place a document's ids are given out, in document order. A made id is never one given before, a repeat gets `-1`, `-2`. An id the document fixes, set on a heading by a plugin or typed on an element heading, is kept, and one that a node before it was given is a `HeadingIdError` (code `id_taken`) naming both. `finish` gives the footnotes their ids last, and one a heading was given moves to the next free one, which `moved` lists for the renderer.
- **An id a callback sets** after reading the made one takes its place, and the made one is free again.
- **What is not the author's** is left out: text a plugin added, and what Svelte renders.
- **A heading a plugin made something else,** or removed in its own close callback, gets none.

### Streaming vs Batch

In `WireTreeBuilder` (streaming), the gap between open and close can be arbitrarily long. Content arrives in opcode batches, the builder processes each batch, and the close callback fires whenever the close opcode arrives.

In `TreeBuilder` (batch), the gap is effectively zero. Open and close fire back-to-back as the builder walks through a pre-parsed opcode sequence.

Plugin code is identical in both modes. The handler doesn't know which builder it's running in. The only observable difference is that `text_content` is only guaranteed complete in the close callback — during the open handler, it reflects whatever has arrived so far (which is nothing in batch mode, and a partial state in streaming mode).

## Composition

Multiple plugins can register handlers for the same node type. They fire in registration order, all on the same node view:

```js
const plugins = [
  { heading: { parse(node) { node.attrs.id = 'a'; } } },
  { heading: { parse(node) { node.attrs.class = 'b'; } } }
];
// both run when a heading opens, in order
```

The second plugin sees the mutations made by the first, because they're writing to the same backing store. This is how most composition works — plugins read the current state, add their contribution.

### Close Callbacks Compose Too

If multiple plugins return close callbacks for the same node, they all fire on close, in registration order. Same model as the open handlers.

### Structural Mutations Compose via Nesting

If two plugins both call `wrap_inner` on the same node, the wrappers nest, with the later plugin's wrapper on the outside:

```js
// Plugin A: wrap_inner('link')
// Plugin B: wrap_inner('span')

// Result in SoA:
// heading → span → link → [original children]
```

Each `wrap_inner` is its own structural operation on the current state of the tree. The second one wraps whatever the first one produced.

`wrap_from` composes the same way. Two plugins that both call `node.wrap_from` in a heading handler nest their wrappers around the heading, the later plugin's inside. A plugin that wraps the heading's content with `wrap_inner` and one that groups the heading with `wrap_from` do not interfere, in either order.

## Execution Model

By default, all parse handlers are **fused** into the single pass the builder is already making. When a node opens, the builder looks up all registered handlers for that node type and calls them in order. No separate tree walks, no per-plugin traversals.

### Sequential Plugins

Some plugins need to see the fully-settled output of earlier plugins across the whole document, not just on the current node. For these, the plugin opts into sequential execution:

```js
const plugin = {
  sequential: true,
  heading: {
    parse(node, ctx) {
      // runs in a separate pass after all fused plugins
    }
  }
};
```

Sequential plugins run their own pass after the main fused pass completes. In streaming mode, this means the pass happens when the stream closes and the tree is fully built. In batch mode, it happens immediately after the main pass.

Fused is the fast path. Sequential is the escape hatch for plugins that genuinely need it — ToC generators, cross-reference resolvers, things that depend on having seen the whole document.

## Text Handlers

A sequential plugin can take the text of the document, to replace part of it or to put nodes in its place:

```js
const emoji = {
  name: 'emoji',
  sequential: true,
  text(run, ctx) {
    for (const match of run.text.matchAll(/:([a-z0-9_+-]+):/g)) {
      const to = table[match[1]];
      if (to === undefined) continue;
      run.replace(match.index, match.index + match[0].length, 'text', to);
    }
  }
};
```

The handler is a function on the plugin, not a `{ parse }` entry. It gets a run, not a node view, and returns nothing.

### Runs

A run is the text of the text nodes that sit next to each other under one parent, joined into one string.

- **It is the same on every path.** The batch builder holds `10:30:00` as three text nodes, since the parser starts a new one at each character it stops to look at, and the wire builder holds one. Both give the handler `10:30:00`. Text a revoke left behind is part of the run it landed in: `*a :tada:` is one run that starts with the star.
- **It stays on its line.** A line end is a node, so the two lines of a paragraph are two runs.
- **It is as written.** `run.text` holds `&amp;` for a reference, as `text_content` does.
- **`run.parent`** is the view of the node that holds the run. Walk up from it to ask where the text is.
- **A run belongs to its document,** like a view. Used after it, it throws.

### `run.replace`

```js
run.replace(start, end, 'text', 'some text');
run.replace(start, end, type, attrs);
```

It puts a new node in place of `run.text.slice(start, end)` and returns its view. After the range it takes what `append` takes: the text of a text node, the attrs of any other.

```js
// #12 becomes a link
const link = run.replace(start, end, 'link', { href: '/issues/12' });
link.append('text', '#12');
```

- **`start` and `end` index `run.text` as the handler got it,** after any number of replacements and in any order. So the offsets of a `matchAll` can be used as they come.
- **An empty range puts the node in at that point** and replaces nothing. A second node at the same point goes after the first.
- **Ranges do not overlap.** A range that takes part of one already replaced, or that holds a node put in at a point, throws a `RangeError`. So does a range outside the run. A `start` or `end` that is not a whole number throws a `TypeError`.
- **Replacement text is a plugin's text,** as with [`append('text', ...)`](#adding-text): a renderer escapes every character of it, so `{` and `&amp;` come out as typed.
- **The text around it stays the author's.** It is still read from the source, so a reference in it is a reference, smart punctuation applies to it, and it maps as it did.
- **The new node spans the source it replaced.** Its `position` is `undefined`, as for any node a plugin made, but a mapped render maps it to that range.

### What a text handler is not given

Most of what must not be rewritten is not text in the tree: code spans, fences, math, comments, expressions, the value of an attribute, the url and title of a link or an image, and the content of `script`, `style`, `pre` and `textarea`. A handler for `code_span` or `code_fence` sees code, a text handler never does.

Four more things are held back from a text handler unless its plugin sets `all_text: true`:

```js
const plugin = { sequential: true, all_text: true, text(run) {} };
```

- **A character the author escaped.** It is left out of every run, so `\:tada:` gives the run `tada:`. Nothing matches across it and nothing replaces it. Over the wire the client is told which characters these are, see `T` in `WIRE_FORMAT.md`.
- **The text of a link that is its url,** as an autolink `<https://a.b>` is.
- **The alt text of an image.**
- **Text inside an element that holds code:** `code`, `kbd`, `samp`, `var` and `tt`.

### When it runs

In the sequential pass of its plugin, when the tree is complete. Text is whole only then: an emphasis that never closes is revoked after its paragraph closed, and its text joins the text of the paragraph.

- **Only a sequential plugin has a text handler.** A `text` function on any other plugin throws a `TypeError` when the plugin is registered, and so does a `text` that is not a function, or a `text` key in a table of bound handlers.
- **Nothing is undone.** No revoke follows the pass.
- **While a document streams, text is as written.** The handler runs when the stream ends.
- **The other handlers of the plugin run in the same pass.** They are not called for a node its text handler made. A plugin later in the list sees those nodes.
- **Each plugin sees the text the ones before it left.** Text an earlier plugin wrote is part of a later one's runs, and the label of a link it made is a run of its own. A plugin that makes links from urls goes ahead of one that rewrites text, so the url is held back from the second.
- **A fused handler reads the text as written,** since it ran during the parse.

## Handlers Bound to a Directive

A plugin above is global: its `heading` handler runs for every heading in the document, and one that only cares about headings inside `:::steps` has to check the parent itself. A handler can be bound to a directive name instead. It is then called only for nodes inside a directive of that name.

Bound handlers are registered apart from plugins, in tables keyed by directive name:

```js
const bound = {
  steps: {
    children: {
      heading(node, ctx) {
        ctx.state.step?.close();
        ctx.state.step = node.wrap_from('directive_container', { name: 'step' });
        node.wrap_from('directive_label').close();
      }
    }
  }
};

parse_markdown_svelte(source, { directive_handlers: [bound] });
// or new PluginDispatcher(plugins, text_source, [bound]) for a builder of your own
```

This is the steps plugin from [Grouping siblings](#grouping-siblings-wrap_from) with no parent check and no map of open wrappers.

An entry can hold three keys. Any other key is ignored, so a layer above can keep its own settings beside them.

| key | what it is |
|---|---|
| `children` | handlers by node type, for nodes written directly inside a container directive of this name, and `'*'` for a child of any type |
| `descendants` | the same, for nodes at any depth inside it |
| `parse` | a handler for the directive itself |

A handler is a function, not a `{ parse }` object. Like a plugin handler it may return a function, which runs when the node closes. A key that is not a node type throws when the tables are first used, and so does `text`: text goes to the [text handler](#text-handlers) of a sequential plugin. The one key of `children` that is no node type is `'*'`, see [A child of any type](#a-child-of-any-type).

`directive_handlers` is an array of tables. A table's entry owns its name, with or without handlers, and a name has one owner: two tables with an entry for the same name throw a `DirectiveOwnerError` when the tables are first used, with `directive` and the two plugin names as `plugins`. Another plugin that wants to see the directive [observes it](#observing-a-directive). The tables are read once per array, so pass the same array for every document and build a new one to change a handler.

A table can come with the name of the plugin it belongs to, as `{ name: 'steps', directives: bound }`. The name keys what its handlers write with `ctx.set` and `ctx.add` and is the `plugin` of their warnings. `mdsvex` passes each plugin's `directives` this way.

### The context

A bound handler gets its own context in place of the plugin `ctx`, new for each call. It has `filename`, `frontmatter`, `warn`, `set`, `add`, `data` and `scratch` as [the plugin context](#the-context) does, and three members of its own:

- **`ctx.directive`** is the view of the directive the handler is bound to.
- **`ctx.index`** is how many times this handler has already run in this directive, 0 for the first call. `children.heading` and `descendants.heading` of one entry count apart.
- **`ctx.state`** is an empty object, new for each directive in the document. Every handler of the entry sees the same one, so the heading handler above keeps its open step there and the directive's own `parse` can read what the others left.

A nested directive of the same name is a new scope with a new `state` and its own counts.

### Which nodes

- **`children` means written directly inside, in the source.** After the first `wrap_from` the later nodes sit inside a `step` wrapper in the tree, and they are still children of `steps`. A heading inside a nested block quote, a list or another directive is not, and is not passed to `children` handlers.
- **`descendants` handlers fire at any depth**, including inside a nested directive that has a scope of its own.
- **The label of a container is inside it.** Its `directive_label` node is a child, and what the label holds are descendants.
- **Only container directives have children.** The label of a leaf directive (`::name[label]`) or an inline one (`:name[text]`) is not passed to the `children` or `descendants` handlers of that name. Handlers of a container around them still see those nodes as descendants.

### A child of any type

`children['*']` runs for every node written directly inside the directive, whatever its type, as it opens:

```js
tabs: {
  children: {
    heading(node, ctx) {
      ctx.state.tab?.close();
      ctx.state.tab = node.wrap_from('directive_container', { name: 'tab' });
    },
    '*'(node, ctx) {
      if (ctx.state.tab === undefined && node.type !== 'directive_label') {
        ctx.warn('before_first_tab', 'content before the first tab is in no tab', node);
      }
    }
  }
}
```

- **It runs after the handler for the type of the child**, so here a heading has opened its tab by the time `'*'` sees it. The `descendants` handlers follow.
- **`ctx.index` counts its own runs**, apart from every other handler. `ctx.index === 0` is the first child, which is the `directive_label` when the container was written with one.
- **It is not called for a `line_break`**, the blank between two children, nor for text, which is never written directly inside a container.
- **It has to be asked about every node.** While its directive is the innermost one open, every node that opens inside goes through the dispatcher, where one that is no child and has no handler of its own is let through at once. A handler keyed by type costs nothing for the other types, so use `'*'` when the type is not known ahead.
- **Only `children` has it.** `descendants: { '*': ... }` throws.

A child reaches its container through a repair in one case: an element alone on its line is opened in a paragraph when the document is fed in pieces, and the paragraph is revoked when it closes. `'*'` and a `children.paragraph` handler then ran for the paragraph, which was pending, and gave their index back. The `children` handlers run for the element when the paragraph goes, so by then the element may have closed already, and a callback they return then fires at once. A handler that must not act on a paragraph that may go checks `node.pending`.

### Order

For one node, the innermost open directive goes first: its `children` handler when the node is a child, then its `'*'` handler, then its `descendants` handler, then the `descendants` handlers of each directive further out. Global plugins run after all of them, so a global `heading` handler sees the wrapper a bound handler made. Close callbacks fire in the same order.

A handler for a directive kind reads the name of the directive it is given, so one container can tell its child directives apart:

```js
tabs: {
  children: {
    directive_container(node, ctx) {
      // a written out :::tab ends the tab a heading opened
      if (node.attrs.name === 'tab') ctx.state.tab?.close();
    }
  }
}
```

### The directive's own `parse`

`parse(directive, ctx)` runs once for each directive of the name, of any of the three forms, and the function it returns runs when the directive closes. `ctx.index` is 0 and `ctx.directive` is the node itself.

```js
tabs: {
  parse(tabs, ctx) {
    const sync = tabs.attrs.args?.sync;
    return () => {
      tabs.attrs.args = { ...tabs.attrs.args, count: String(ctx.state.count ?? 0) };
    };
  },
  children: {
    heading(node, ctx) {
      ctx.state.count = ctx.index + 1;
    }
  }
}
```

- **It runs when the name is known**, straight after the open handlers of the directive, which [wait for the name](#open-time-execution) as well. So the handlers of the directives around it and the global ones go first, and `parse` sees what they did. Its close callback runs ahead of the callbacks they left.
- **A block directive has its args by then.** The parser emits `args` and then `name`, and the scope starts at the name.
- **An inline directive does not.** Its `(key=val)` list follows the closing bracket, so `parse` sees no args and its close callback sees them.
- **`node.parent` is the parent in the tree**, such as an open wrapper, since the node was placed before its name arrived.
- **An inline directive is pending** until its bracket closes. If it never does, what `parse` wrote is undone and its close callback never runs.

### Revocation

What a bound handler does is logged against the node it ran for, like any plugin mutation, its warnings and its writes with `ctx.set` and `ctx.add` included, and two more things are undone when that node is revoked:

- **A write to `ctx.state`** is taken back. The log is shallow, as it is for `attrs`: assign a new value to change one, and don't mutate an object held in the state. Revokes do not arrive in the reverse order of the writes (a tight list revokes its paragraphs first to last), so each key keeps what its last surviving write put there.
- **The `index` it used** is given back, so the count goes down by one. The handlers that ran since keep the index they were given.

This helps while the directive is still open. A link with no destination, a delimiter cut off by a table cell, a code span that never closes and the paragraphs of a tight list are all revoked before their container closes, and so is an emphasis delimiter that never closes, when its paragraph ends. An html tag that never closes is different: inside a container directive the parser revokes it only after the outermost container around it has closed. The state is still rolled back, but the directive's close callback has already read it, so a count kept in the state can include such a node.

### Scopes and cost

A container with `children` or `descendants` handlers opens a scope when its name arrives and ends it when the container closes, at the end of input if it was never closed, or on a revoke.

- With no scope open, dispatch costs what it does without bound handlers.
- While a scope is open, the builders send the dispatcher the kinds the open scopes have handlers for, on top of the kinds global plugins handle. Other kinds keep the builder's fast path, except for the direct children of a node with an open wrapper.
- While the innermost scope has a `'*'` handler, every kind but `text` and `line_break` is sent, and the dispatcher lets a node that is not its child through at once.
- A scope ends when its directive closes, so that close goes through the dispatcher. The closes of the nodes inside it do not, unless a handler left something on them. The wire builder asks the dispatcher at every close, which is a few compares for a node no handler touched.

Bound handlers run in the fused pass only. A sequential plugin sees the tree they left.

### Observing a directive

A directive has one owner, the table that binds its name. Another plugin reads it by observing it: numbering a figure, collecting the tabs of a page, checking an arg.

```js
const numbering = {
  name: 'numbering',
  observe: {
    figure: {
      parse(figure, ctx) {
        // a block directive is never revoked, so a count in the scratch stays right
        const number = (ctx.scratch.figures = (ctx.scratch.figures ?? 0) + 1);
        const id = figure.attrs.args?.id;
        if (id === undefined) return;
        return () => {
          const label = figure.first_child;
          ctx.set('target:' + id, {
            number,
            caption: label?.type === 'directive_label' ? label.text_content : null,
          });
        };
      },
    },
  },
};
```

`observe` is a key of a parse plugin, a table keyed by directive name with the entries a table of bound handlers has: `parse`, `children` (`'*'` too) and `descendants`. Handlers get the same context as the owner's, with a `state`, an `index` and counts of their own.

- **It runs whoever owns the name.** With an owner, with only a component of the host for it, or with neither. Which plugins are installed changes nothing for an observer.
- **It changes no node.** Not the directive, not what is inside it, not anything else: a write to `attrs` or `type`, a structural method and `remove` throw a `TypeError` that names the observer, the directive and its owner. A deferred task an observer starts is held to the same. The owner decides what the directive is and how it renders, so what an observer finds goes into its plugin data, which a component reads through Svelte context.
- **What it may do:** `ctx.set` and `ctx.add`, owned by the node whose handler runs and revoked with it, `ctx.warn`, `ctx.id`, `ctx.scratch`, `ctx.defer`, and the close callbacks it returns.
- **After the owner.** At the open the global open handlers of the directive run first, then the owner's `parse`, then the observers in plugin order. At the close the observers' callbacks run last, after the owner's and the global ones. For a child the owner's `children` and `descendants` handlers run first, then the observers', and their close callbacks in the same order. An observer can change nothing the owner would see, so the only thing the order decides is what the observer sees, and this way it is the directive as the owner left it: the args it set at the open, the wrappers it made, the args it wrote at the close.
- **As the directive streams.** `children` and `descendants` handlers of an observer run as each node opens, as the owner's do, so an observer sees the label of a container when it arrives and need not wait for the close.
- **In the fused pass,** as bound handlers run, also for a plugin that is `sequential`.
- **A plugin does not observe its own directive.** A plugin whose name owns a table entry for the name and observes it too throws a `TypeError`, its own handlers already see the directive.
- **Revocation** is as for the owner: an inline directive whose bracket never closes takes what its observers wrote with it, and a directive inside a construct that goes, an emphasis that never closes or a link with no destination, stays with what they wrote.

`mdsvex` reads `observe` from a parse plugin of `parse_plugins` and from the `parse` of a plugin bundle, which carries the bundle's name. The global directive handlers of either still never see a directive a component takes.

## Dirty Tracking

Every mutation through the node view marks the affected node dirty. This is how the system knows what to re-render after parse plugins have run.

Two levels of dirty state:

- **attrs dirty** — the node's own output needs re-rendering, children are fine
- **children dirty** — the node's subtree structure has changed, full subtree needs re-rendering

Attribute setters flip the first bit. Structural methods (`wrap_inner`, `prepend`, `append`, `wrap_from`) and type changes flip the second.

In streaming mode, dirty marking drives incremental re-rendering — only the changed subtrees get re-rendered and patched into the output. In batch mode, dirty marking is moot because rendering happens once after parse completes, so the dirty state just gets consumed by the initial render.

## Dispatch Implementation

The builder dispatches to handlers via a codegen'd switch on node type, with destructured local bindings for each composed handler function. This keeps every call site monomorphic — the JIT can inline-cache each arm independently, and the composed handlers are stable references captured at registration time.

The dispatch structure is generated at PFM build time based on the known node type set. Plugin registration builds a stable handlers object keyed by node type; the dispatch function destructures it once per invocation and calls into specific locals in the switch arms. No property lookups in the hot path, no polymorphic call sites, no runtime code generation.

Multiple plugins on the same node type are composed into a single function at registration time. For small numbers of plugins (up to a codegen'd arity limit), the composition is unrolled with captured closure bindings — each call site stays monomorphic. Beyond the limit, a loop fallback accepts the deopt for the rare pathological case.

## Constraints and Guarantees

**What parse plugins can do:**
- Read any property on any node reachable via traversal
- Write attrs, type, and type-specific properties on any reachable node
- Inject synthetic children via `wrap_inner`/`prepend`/`append` on any reachable node, text nodes with their text included
- Group a node and the siblings after it under a synthetic parent via `wrap_from`
- Remove a node that closed for good, from its close callback or a sequential pass, via `remove`
- Replace a range of text with text or with a node, from the text handler of a sequential plugin, via `run.replace`
- Register close callbacks via return value
- Capture state in closures between open and close

**What parse plugins cannot do:**
- Walk the tree during their own handler (no `walk`, `querySelectorAll`, etc.) — they react to what the builder sends them
- Reparent existing nodes across unrelated parts of the tree (`wrap_from` puts later siblings under the wrapper as they arrive and never moves one that came before)
- Remove a node that may still be revoked, or one outside the node whose handler is running (see [Removing a node](#removing-a-node))
- Modify the parser itself or affect how tokens become nodes
- Rewrite text from a fused handler, or rewrite code, an attribute value or raw text from a text handler (see [Text Handlers](#text-handlers))
- Do work outside their registered node types — if a plugin only has a `heading` entry, it never sees other node types. The one handler for any type is `children['*']` of a directive, for the nodes written directly inside it

**Guarantees:**
- Property mutations never have non-local effects beyond dirty marking
- Synthetic nodes behave identically to parser-produced nodes (traversal, rendering, revocation)
- Revocation of a node removes the synthetic nodes its handlers made
- Plugin code is mode-agnostic — same code works in streaming and batch
- Fused plugins add zero additional tree walks
- Close callbacks fire exactly once per node, in registration order

# Revocation and Node Identity

PFM's streaming model includes a revocation mechanism: when the parser speculatively opens a node and later determines it was wrong, it emits a revoke opcode to undo that node and everything beneath it. Parse plugins interact with this mechanism in ways that need to be handled explicitly, because plugin mutations are part of what needs to be undone.

## Identity is Stable Across Type Changes

A node's identity in the SoA is its ID, not its type. When a plugin changes a node's type — for example, turning a `heading` into a `paragraph` — the node keeps its ID. All the opcodes that reference that ID continue to work correctly without any special handling.

The close opcode that the parser would have emitted to close the original `heading` now closes the `paragraph`, because both are the same node from the builder's perspective. It's just a close-by-ID operation, and the ID hasn't changed. Same for revoke: a revoke opcode targeting that ID revokes whatever the node currently is, regardless of what type it started as.

This falls out of the design for free. The builder doesn't need to track type history or do any lookup-by-original-type. Opcodes reference IDs, IDs are stable, and the current state of the node is whatever the SoA says it is at the moment the opcode is processed.

## Plugin Mutations Must Be Reversible

When a parse handler runs on node open, it may mutate the node — set attrs, change type, wrap children, inject synthetic descendants. If the parser later revokes that node, all of those mutations need to be unwound as part of the revocation. Otherwise the SoA ends up in an inconsistent state, with orphaned synthetic nodes and dangling attr changes that reference a node that no longer exists.

The node view is the enforcement point. Because all plugin mutations flow through view setters and structural methods, the builder can capture the pre-mutation state at the moment of change and store it in an undo log scoped to the node being mutated.

### What Gets Captured

For each mutation, the builder records enough information to reverse it:

**Attribute writes.** When a plugin sets `node.attrs.id = 'foo'`, the setter captures the previous value (or the fact that the key didn't exist) before writing the new value. Revocation restores the prior state.

**Type changes.** When a plugin sets `node.type = 'paragraph'`, the setter captures the original type. Revocation restores it. Type-specific properties that became meaningful or meaningless as a result of the change are handled the same way — whatever the plugin touched, the builder has a record of the prior state.

**Structural mutations.** `wrap_inner`, `prepend`, and `append` each create synthetic nodes. The builder records the IDs of the created nodes and the SoA pointer state before the mutation. Revocation deletes the synthetic nodes and restores the original parent-child relationships.

**`wrap_from` and `close()`.** Revoking a node whose handler called `wrap_from` removes the wrapper, and the node and any siblings that joined it return to the wrapper's parent in its place. Revoking a node whose handler called `close()` reopens the wrapper: it takes back every sibling that arrived while it was closed and keeps taking later ones. Pending nodes cannot call either (see above), but the parser also revokes a few nodes it opened as committed: a table cell that turns out to be a merge marker, a code span that never closes, frontmatter with no closing fence.

Only the tree is restored. What a plugin keeps in its own variables is not, so a plugin that remembers "the wrapper I opened last" from a `table_cell` or `code_span` handler may hold a wrapper that no longer exists. Calling `close()` on it does nothing.

**`remove`.** A removal is not captured, because it is only allowed where it cannot need undoing, see [Removing a node](#removing-a-node).

**`run.replace`.** Not captured either. A text handler only runs in a sequential pass, see [Text Handlers](#when-it-runs).

**Deferred tasks.** A revoke drops the tasks of the node, see [Deferred tasks](#deferred-tasks).

**Bound handler state.** A write to `ctx.state` and the `index` a bound handler used are logged the same way, see [Handlers Bound to a Directive](#revocation).

**Warnings and data.** A warning from `ctx.warn` and a write with `ctx.set` or `ctx.add` are logged against the node whose handler made them, see [The Context](#the-context). A revoke takes back every write its node owned, see [Every write has an owner](#every-write-has-an-owner). What a plugin keeps on its own keys of `ctx` is not.

**Cross-node mutations.** When a plugin reaches through traversal to modify a different node (say, setting an attr on `node.parent`), that mutation is captured in the undo log of the node whose handler is running, not the node that was modified. This is because the revocation boundary is the handler's node — if the parser revokes the parent later, that's a separate revocation event with its own undo log.

### Scoping the Undo Log

The undo log is keyed by node ID. Each node has an associated log of mutations made during its lifetime. When a revoke opcode arrives for a node, the builder:

1. Walks the undo log for that node in reverse order
2. Applies each undo entry (restoring prior attr values, deleting synthetic children, reverting type changes)
3. Discards the node's close callbacks if they have not fired
4. Repairs the node: it becomes literal text (or a paragraph of it, for a block) and its children move up to its parent

An html element with no close tag that sits under the root, a block quote or a list item is the block case. Its open tag becomes text in the paragraph of its line, and children on later lines that had lost their paragraph get a new one (`WIRE_FORMAT.md` has the steps under `R`). No handler runs for a paragraph the repair makes, and a paragraph that takes the tag text has already run its handlers without it.

A revoke covers one node. The repair keeps the node's children in the tree, and the parser sends a separate revoke for each descendant it also gives up on. A child that stays keeps what its handlers did: in `_a *b* c` the unclosed `_` is revoked, the `*b*` inside it is not, and a plugin's changes to that strong node survive.

The repaired node keeps none of its attributes. The text or paragraph left in its place is not the tag, link or directive the parser first took it for, so the `tag`, `name` or `href` the parser gave it goes, and so does anything a plugin wrote on it, whichever handler wrote it. The undo log has already taken back what the node's own handlers wrote. An attribute another node's handler put there (a paragraph marking each of its children, say) cannot be told from the parser's, because a plugin may write `title` or `href` as well, so the repair drops the lot. Undoing that other handler later leaves the repaired node as it is.

Because plugin mutations on traversal-reached nodes are logged against the handler's node, revoking node A automatically unwinds any mutations A's handlers made to unrelated nodes. This prevents the scenario where revoking a link leaves behind an attr change the link's handler made on its parent heading.

### Close Callback Captures Are Not Special

The close callback runs later, potentially well after the open handler. Its mutations are captured the same way — through the view setters, into the same undo log for the node being mutated. Revocation between open and close is handled by the builder discarding the close callback entirely (it's held in a per-node registration) and running the undo log.

If revocation happens after close has fired, the close callback's mutations are already in the undo log alongside the open handler's mutations, and they get unwound together in reverse order. This is the usual order for an inline delimiter that never closes and for the paragraphs of a tight list: the parser closes the node where its block ends and revokes it afterwards. A paragraph that starts with a tag or an image and holds nothing else is revoked right after its close as well. Any other pending node that has closed is final. Only writes through the node view, warnings, writes with `ctx.set` and `ctx.add` and writes to a key of `ctx.state` are unwound, so a callback that also writes somewhere else (a list it collects into, say) should not assume its node is final.

## Implementation Notes

The undo log is the main new piece of state the builder needs to maintain. It's per-node, short-lived (discarded when the node is committed or revoked), and proportional in size to how much plugin activity happened on that node.

For nodes with no plugin activity, the undo log is never allocated. This is the common case, and the builder can skip the bookkeeping entirely when no handlers have registered against the node's type.

For nodes with handlers, the log accumulates as the handler runs. The setters on the node view check whether a log exists for the current node and append to it. Structural methods write their own entries. The log is a simple array of records, each describing one mutation and how to reverse it.

Commit is the inverse of revoke: when a node is committed, the undo log is simply discarded. The mutations become permanent, and the memory is freed. A node is committed when it closes, with two exceptions the parser settles afterwards:

- **A delimiter with no closer.** The parser closes it where its block ends and revokes it once it is back at block level. It marks that close (`close_pending` on an emitter, a flag on the wire's `C`), and the log is kept for the revoke.
- **A pending paragraph**, in a list item or one that starts with a tag or an image. The parser sends a commit or a revoke for it by id.

The batch builder only calls the dispatcher for a close that can have something waiting. A log, an open wrapper and a scope each belong to one node, and a node that opened after all of those closes without the dispatcher. So a section that stays open to the end of the document, or a scope around a long container, does not slow down the closes inside it. Two things send every close through the dispatcher for as long as they last: a close callback that has not run yet, and a `wrap_from` wrapper that was closed while its last child was still open.

### Node ids and plugin nodes

The parser numbers its nodes densely and the batch builder stores each one in the slot of its id, which is what keeps it from needing an id table. A node a plugin adds takes the next slot. The builder then tells the parser to skip that id (`skip_ids`), so the next parser node still lands on its own slot and a plugin that adds nodes does not slow down the nodes after them. A builder gets its parser from `new PFMParser(builder)` or `parser.bind(builder)`. With an emitter of your own in between the builder has no parser to tell, and it falls back to an id table from the first added node on, which builds the same tree more slowly.

## Guarantees

**Type changes preserve identity.** Changing a node's type doesn't affect opcode routing. Close and revoke opcodes continue to target the correct node by ID.

**Mutations are fully reversible.** Any property or structural change made by a plugin can be undone if the node is later revoked. The undo log captures prior state at mutation time, not revocation time, so there's no race between plugin execution and revocation arriving.

**Revocation is per node.** Revoking a node undoes everything its own handlers did, including the synthetic nodes they made and changes they made to other nodes. Descendants the parser keeps are left as they are; descendants it gives up on get their own revoke.

**Close callbacks are cancelable.** If revocation happens between open and close, the registered close callback is discarded and never runs. If it happens after the close, the callback has run and its mutations are undone with the rest.

**Zero cost for unhandled nodes.** Nodes of types with no registered plugins pay nothing for the undo machinery. The log is only allocated when a handler actually mutates the node.
