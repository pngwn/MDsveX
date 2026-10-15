# Incremental and async work for plugins: design

Status: decided 2026-10-15, being built. Section 11 has the rulings, section 12 the order of the work.

Sources: what the plugin sessions left out (`last_modified` in `@mdsvex/plugin-page-data`, embeds, bibliographies, build-time diagrams), the workaround in `@mdsvex/plugin-toc`, `packages/parse/PLUGINS.md` (streaming against batch, dirty tracking, `ctx.data`), `packages/parse/src/plugin_dispatch.ts`, `CompilerSession` and `Parsed` in `packages/mdsvex/src/compile.ts`, the gap the Vite plugin already waits in for `src=`, and `design/vite-coupling.md`.

## Recommendation

- **Incremental first.** A plugin does its work node by node, in fused handlers, as nodes close. That is the model the parser already has: on the streaming path a close callback fires when the close arrives, and mutations mark nodes dirty so only they are rendered again. A table of contents grows as headings arrive. A bibliography grows as citations arrive.
- **Data is written through calls, not by assignment.** `ctx.data` becomes read-only. A plugin writes with `ctx.set(key, value)` and `ctx.add(key, value)`. Every write belongs to the node whose handler made it. That makes revocation exact (today's undo log only sees a top-level assignment), makes every change an event a streaming view can follow, checks each value for JSON when it is written, and puts list entries in document order whatever order they arrived in.
- **Aggregates are rendered by components that read data.** A `::toc` or a `::bibliography` renders a component that reads `plugin_data`. No plugin rewrites a distant part of the tree at the end. While streaming, the component renders again as entries arrive; in a compile it gets the final data.
- **Async work is attached to a node.** `ctx.defer(node, async () => ...)` from a handler starts the work and lets the parse carry on. Its result may change that node and write data owned by that node. It is held until the node is committed and dropped if the node is revoked. A streaming view shows the node, then patches it when the work lands. `compile_async()` waits for every deferred task before it renders, so the output of a compile is complete.
- **A document hook remains, as the fallback** for work that needs the whole document. It may be async. It runs after the parse and after every deferred task.
- **Loading stays host-neutral.** Plugins load files and urls themselves. They report what they read with `ctx.depend(path)`, and the compile result carries `dependencies` for each host to act on. Nothing here knows about Vite.
- **`compile()` stays synchronous.** A plugin that defers or waits under `compile()` is a typed error that points to `compile_async()`.
- **Heading ids move to the close of the heading** (section 8). A table of contents that grows needs ids as headings arrive, and one implementation must serve streaming and batch alike.

```js
const toc = {
	name: 'toc',
	heading: {
		parse(node, ctx) {
			return () =>
				ctx.add('headings', {
					depth: node.depth,
					id: node.attrs.id,
					text: node.text_content,
				});
		},
	},
};

const citations = {
	name: 'citations',
	directive_inline: {
		parse(node, ctx) {
			if (node.attrs.name !== 'cite') return;
			return () => {
				const key = node.text_content;
				ctx.add('cited', key);
				ctx.defer(node, async () => {
					const path = ctx.frontmatter?.bibliography;
					const bib = await ctx.cached(path, load_bibliography); // shared, section 6
					const entry = bib.get(key);
					if (entry === undefined)
						return ctx.warn('unknown_key', `no entry for ${key}`, node);
					node.attrs.label = entry.short;
					ctx.set(`entry:${key}`, entry);
				});
			};
		},
	},
};
```

## 1. Why incremental first

The first draft of this note put async work in one hook at the end of the document. It was simple, and it gave up the property the parser was built for. A streaming view would show nothing from such a plugin until the stream ended:

- **A table of contents** in a sidebar would stay empty while the document arrived, then appear at once.
- **A bibliography** would wait for the last citation before showing the first entry.
- **An embed** near the top would wait for every other embed and the end of the text.

None of these needs the whole document. A heading's entry is known when the heading closes. A citation's entry is known when the bibliography file has loaded and the citation has closed. An embed's card is known when its own fetch returns. The work is per node, and the aggregate is a view over per-node results. So the primitives are per node too, and the end-of-document hook is kept for what is truly global.

## 2. Writing data

```ts
interface DocumentContext {
	/** this plugin's data as it stands, read-only */
	readonly data: Readonly<Record<string, Json>>;
	/** one value under a key */
	set(key: string, value: Json): void;
	/** one entry of an ordered list under a key */
	add(key: string, value: Json): void;
	// filename, frontmatter, warn, depend, defer, read, resolve
}
```

- **Every write has an owner.** A write from a node handler, a close callback or a deferred task belongs to that node. A write from the sequential pass or the document hook belongs to no node and is never revoked.
- **Revocation removes exactly the owner's writes.** When the parser revokes a node, every `set` and `add` it owned is taken back and the value under each key is what it would have been without them. This replaces the shallow undo log of today, and the caveats that go with it in `PLUGINS.md` go too: an in-place `push` that the log could not see, and a count kept by reassigning that stays wrong when an earlier writer is revoked.
- **`add` keeps entries in document order.** An entry sorts by its owner's position in the source, not by when it was written. A heading that streams in, a citation whose deferred task finishes late, and a batch parse all give the same list. Entries with no owner come after the rest, in the order they were added.
- **`set` resolves conflicts by document order too.** Two owners that set one key leave the value of the later one in the source. One owner that sets a key twice leaves its last value. So the result does not depend on arrival order.
- **Values are checked when written.** A value JSON cannot hold is a typed error raised at the write, with the plugin's name and the owner's position, not at the end of the compile as `PluginDataError` is today. The value is copied and frozen, so a plugin cannot change it afterwards behind the log's back.
- **Reading.** `ctx.data` is the current state of this plugin's data, read-only. Assigning to it throws a `TypeError` that names `ctx.set`. A plugin reads its own data to decide things, for example whether an id has been used.
- **Keys are flat strings.** Structure lives in values. A plugin that wants a map writes keys with a prefix (`entry:smith2020`) or keeps a list. Section 11 asks whether paths are worth having.
- **`ctx.state` is not changed.** It is a directive's private scratch, it holds live objects such as the wrapper a steps handler keeps open, and it is never published. Its shallow undo stays, documented as it is now.

The result of a compile is unchanged in shape: `data` keyed by plugin name, each an object whose `add` keys are arrays in document order and whose `set` keys are values. That is also the `plugin_data` export and what `?data` gives.

## 3. Observing data

The dispatcher emits one event for each change to a plugin's data: a write, or a revocation that took one back.

```ts
type DataChange = { plugin: string; key: string; value: Json | undefined };
dispatcher.on_data((change) => ...);
```

- **A streaming view** follows these events so components that read `plugin_data` render again as it changes. The streaming renderer (`Node.svelte`) needs a reactive `plugin_data` for this; today it has none.
- **A compile** ignores them and reads the final state.
- **The event carries the key's value after the change,** not a diff, so a consumer that missed events only needs the latest one per key.

## 4. Async work on a node

```ts
interface DocumentContext {
	defer(node: NodeView, task: () => Promise<void>): void;
}
```

- **When it starts.** At once. A deferred task started from the close callback of a pending node (an emphasis, a link, a paragraph that may be unwrapped) runs while the parse decides about the node.
- **When it applies.** A task's changes are recorded as it makes them and applied when both the task has settled and its node is committed. If the node is revoked first, the changes are dropped and nothing is reported, errors included.
- **What it may change.** The node and its subtree (attrs, `append`, `prepend`, `wrap_inner`, `remove` on its children), data owned by the node, `ctx.warn`, `ctx.depend`. Not `wrap_from`, not another node. A call outside that set is a `TypeError`. This is what keeps the final tree independent of the order tasks finish in.
- **Sharing work.** Loading a bibliography once for every citation, and for every document, goes through `ctx.cached` (section 6).
- **Streaming.** When a task applies, dirty tracking marks its node and the view patches that node. A placeholder until then is the plugin's choice: render the node as it is, or set an attr its component reads as "loading".
- **A compile.** `compile_async()` waits for every task, applies them in document order, then renders. `compile()` throws `PluginAsyncError` at the first `defer`.
- **Errors.** In a compile, a task that rejects fails it with a typed error that names the plugin and the node's position, the original error as its cause. While streaming, the host decides; the default is a warning and the node left as it was.

## 5. The document hook

```ts
interface ParsePlugin {
	document?(root: NodeView, ctx: DocumentContext): void | Promise<void>;
}
```

- **Runs once,** after the parse, after `heading_ids`, after every sequential pass and after every deferred task. Hooks run in plugin order, each awaited before the next.
- **For work that needs the whole document**: numbering that depends on what comes later, a summary of the whole text, a check across all headings. Its writes belong to no node and are never revoked.
- **On a streaming client** it runs when the host has called `finish()`. A plugin that wants to show something sooner does that part per node and keeps only the final step here.
- **A hook that does not wait** runs under `compile()`. One that returns a promise needs `compile_async()`.

## 6. Loading, resolving and dependencies

Unchanged from the first draft:

- **Plugins load things themselves,** with `node:fs`, `fetch` or anything else. The core does not wrap the file system.
- **`ctx.depend(path)`** names a file the output depends on, from any handler or task. A path that does not exist yet counts too. The compile result carries `dependencies`, absolute paths, each once. The Vite plugin turns them into watching and invalidation (the document and its `?data` module); a script ignores them; another integration hands them to its bundler, as Svelte's `preprocess` does with its own `dependencies`.
- **`ctx.read(path)` and `ctx.resolve(specifier)`** are offered for portability. They use `read` and `resolve` options the host passes (`ctx.read` names the dependency itself). `mdsvex/compile` has no reader of its own, so it stays free of Node; the Vite plugin passes one, and the playground can pass one over its files.

### Shared loads

Many documents often need the same thing: one bibliography file, one endpoint, one index. A plugin can keep it in a variable of its module, and for something that never changes (a table bundled with the plugin) that is the right answer. For anything loaded from outside, the obvious version has two faults:

```js
let file;
async function bibliography(path) {
	if (!file) file = parse_bib(await readFile(path, 'utf8'));
	return file;
}
```

- **It goes stale in a dev server.** When `refs.bib` changes, the host compiles the documents that named it again, because they called `ctx.depend`. But the variable still holds the old file, so they compile again to the same output. The plugin cannot know the file changed: only the host does.
- **It loads twice.** Two documents that compile at once both find `file` empty and both read it. Holding the promise, not the value, fixes that, and is easy to miss.

So mdsvex offers one helper, and does no loading itself:

```ts
interface DocumentContext {
	cached<T>(key: string, load: (key: string) => Promise<T>): Promise<T>;
}
```

- **Shared across documents.** The cache belongs to the plugin (by name) and lives as long as the host's compiler: the Vite plugin's session, or the plugin object a script passes to each `compile_async` call.
- **Holds the promise,** so documents that ask at once share one load. A load that rejects is not kept, so the next document tries again.
- **A key that is a path is a dependency.** `ctx.cached(path, ...)` calls `ctx.depend(path)` for the document that asked, every time, whether the value came from the cache or not.
- **The host drops entries.** A host that watches calls `invalidate(paths)` on the compiler before it compiles the dependent documents again, and every entry keyed by one of those paths is dropped. The Vite plugin does this from the same map it uses for `src=`. A script never calls it, so the cache lasts the run.
- **Other keys** (a url, a query) are never dropped by mdsvex. A plugin that wants them to expire does it itself. Section 11 asks whether a time limit belongs here.

## 7. Where each part runs

| caller            | what happens                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile()`       | As today. Any `defer`, or a document hook that returns a promise, throws `PluginAsyncError`.                                                                                                                                           |
| `compile_async()` | The parse, then every deferred task, then the document hooks, then the render. Exported from `mdsvex/compile`, safe in a browser.                                                                                                      |
| `CompilerSession` | `parse` as today; a new `settle(parsed)` waits for deferred tasks and document hooks and returns a promise only when there was something to wait for; `render` as today. This becomes public, as `design/vite-coupling.md` recommends. |
| the Vite plugin   | A document with nothing to wait for takes the synchronous path it takes today. Otherwise it waits where it already waits for `src=`.                                                                                                   |
| `?data` imports   | The parse and `settle`, no render. `?metadata` is unchanged.                                                                                                                                                                           |
| a streaming view  | Fused handlers as content arrives, data events as they happen, deferred tasks applied as they land, document hooks after `finish()`.                                                                                                   |

## 8. Heading ids at the close of the heading

Ids are made today in a pass after the parse (decision D5 of the implementation plan, chosen because it was the cheapest place and nothing streamed needed ids). A table of contents that grows, and anchors in a streaming view, need an id when the heading closes. The streaming demo works around this with a fused plugin of its own.

- **One implementation.** The id is made in the close callback of the heading by the same code in the batch and the wire builder. A second implementation for streaming would bring back the problem the parser restructure removed.
- **Duplicates still work.** A duplicate gets a suffix from the ids before it, which are known at close.
- **A plugin that changes a heading's text** in its own close callback runs before the id is made only if it comes earlier in the plugin list. Today every plugin sees ids because ids come after the parse. Section 11 asks which order is wanted.
- **Cost.** It runs on every heading of every document with `heading_ids` on. Measure it against the pass it replaces before deciding.

## 9. Left out

- **A setup hook and a live set of documents,** for checks across a whole site. A project-level tool, not a document plugin.
- **Modules served through the bundler.** Vite-only, and the result arrives at render time.
- **Waiting inside a handler.** A fused handler runs while the parser emits; the parser cannot pause and neither can a streaming view. `defer` is how a handler starts async work.

## 10. What changes for existing plugins

- **`@mdsvex/plugin-toc`** becomes a fused plugin that calls `ctx.add('headings', ...)` at each heading's close. Its helper node trick for `::toc` goes; the directive renders a component that reads the data.
- **`@mdsvex/plugin-page-data`** writes with `ctx.set`. Last modified becomes possible with a deferred task on the root or a document hook.
- **`plugins/steps`, `plugins/tabs`** use `ctx.state` only, and are unchanged.
- **`PLUGINS.md`** loses the shallow log section for `ctx.data` and gains sections 2 to 5 of this note.

`next` is a prerelease, so `ctx.data` turning read-only is not a breaking change for released users.

## 11. Decisions for the maintainer

Decided 2026-10-15: the first option of each.

1. **The write calls.** `ctx.set` and `ctx.add`. Or one `ctx.set` with an option for list entries.
2. **Keys.** Flat strings, structure in values. Or paths (`ctx.set(['entries', key], value)`), which need conflict rules for a path and its parent.
3. **`set` conflicts between owners.** The later one in the document wins. Or a conflict is an error.
4. **`ctx.state`.** Leave it as private scratch. Or move it to the same calls, which it cannot fully use since it holds live objects.
5. **Heading ids at close.** Move them, after a measurement. Or keep the pass, and accept that a table of contents grows only after the stream ends.
6. **Plugins and ids.** A plugin that edits heading text runs before the id is made if it is earlier in the list. Or ids are made before any plugin's close callback, from the text as written.
7. **Deferred errors while streaming.** A warning and the node left as it was. Or the host must handle them.
8. **The names** `defer` and `document`. Or `later` and `finish`.
9. **`ctx.read` and `ctx.resolve`.** Offer both, supplied by the host. Or neither.
10. **A time limit.** None, with a dev warning from the Vite plugin after five seconds. Or a hard limit.
11. **Shared loads.** `ctx.cached`, with path keys dropped by the host. Or leave caching to plugins, and document the two faults of a module variable.
12. **Expiry for keys that are not paths.** None. Or a `max_age` option on `ctx.cached` for endpoints.

## 12. Implementation outline

Stacked PRs. None changes output for a document whose plugins neither defer nor have a document hook, except where noted.

1. **Data through calls.** `ctx.set`, `ctx.add`, read-only `ctx.data`, ownership and exact revocation in both builders, JSON checked at write, data events. `plugin-toc` and `plugin-page-data` move to it. Every path of the plugin harness, with revocation cases for both calls.
2. **Deferred tasks.** `ctx.defer` with its commit and revoke rules, `compile_async`, `CompilerSession.settle` made public, the Vite plugin's wait, `?data`.
3. **The document hook, dependencies, `ctx.read`, `ctx.resolve`, `ctx.cached` and `invalidate`.**
4. **Heading ids at close,** measured against the pass it replaces. Changes when an id exists, not what it is.
5. **The streaming renderer:** a reactive `plugin_data`, and patching a node when its deferred task applies. The streaming demo gets a growing table of contents.
6. **Users:** `plugin-toc` incremental, last modified in `plugin-page-data`, and a citations plugin as the proof for deferred tasks.

Checks: `parity.mjs` identical and `quick` level for documents without such plugins, `--suite plugins` for the rest, and the invariance harness with a plugin that defers on generated documents, compared whole, fed and over the wire.
