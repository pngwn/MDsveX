# Plugin directives: design

Status: phases 0 to 3 are built (2026-10-11): the `plugins` option, bundles, bound handlers and `wrap_from`. §3.1, §3.2, §3.4 and §7 describe what was built. Static directives (§5) and the kit plugins are not started. Two points are implemented as drafted and not yet ruled on, Q1 and Q10 in §9.

Sources:
- The plugin audit (`plugins/PLUGIN_AUDIT.md`): the Presentation concern, and the directive rows in its §4.
- `packages/parse/PLUGINS.md`: the parse-plugin model, which this extends.
- `design/templates-and-components.md` §5: directives as components.
- The motivating case, a `:::steps` container whose headings become numbered steps.

````md
:::steps

## Install dependencies

First, install the required packages:

```bash
npm install layerchart
```

## Configure

Do something else

## Profit!

Start using `::component` and `:::component` syntax in your markdown files!
:::
````

## 0. Where we were

This is the state the design started from. Bundles (§3.1) now let a plugin supply components, bound handlers (§3.2) reach a directive that has a component, and `wrap_from` (§3.3) groups siblings. The last point, that every directive component is live, still holds.

- **Directive components come from modules only.** A name resolves through `export * as directives` modules, which reach `compile()` as `ComponentSource` data (`{ specifier, names }`, `packages/render/src/scope.ts`).
- **A plugin can't supply a component.** Parse plugins are node handlers and nothing else.
- **A directive with a component never reaches a plugin.** `guard_plugins` in `packages/mdsvex/src/compile.ts` wraps every plugin's directive handlers so they only see directives no component takes.
- **A plugin can't group siblings.** The structural methods are `wrap_inner`, `prepend` and `append`. All three add nodes inside a node. None can put a heading and the content after it under a new parent.
- **Handlers are global.** A `heading` handler runs for every heading in the document. A plugin that only cares about headings inside its own directive has to check the parent itself.
- **Every directive component is live.** It is imported, instantiated and hydrated, even when it only produces fixed HTML.

So a plugin can't do what `:::steps` needs: claim the name, provide the component, and reshape the children.

## 1. Principles

1. **Rewrite to directives.** A plugin that reshapes a directive's children produces the tree the author would get by writing each part out as a directive. No new node kinds and no new renderer concepts.
2. **Handlers are bound to the directive.** A directive's handlers are called only for nodes inside that directive. The plugin author never checks where a node is.
3. **The rewrite defines the shape, the component presents it.** The two can be replaced independently.
4. **Structural changes stay streamable.** A new method may open a node early and close it later. It never moves a node that has already gone downstream.
5. **Headings stay headings.** A heading that becomes a step title keeps its slug and its TOC entry, and the source still reads as plain headings on GitHub.
6. **Components are live by default, static by choice.** A directive is a real component unless whoever registered it says its output is fixed.

## 2. The rewrite

The steps plugin turns the example into:

```
directive_container  steps
├─ directive_container  step          ← synthetic, one per heading
│  ├─ directive_label                 ← synthetic, wraps the heading
│  │  └─ heading  "Install dependencies"
│  ├─ paragraph
│  └─ code_fence
├─ directive_container  step
│  ├─ directive_label
│  │  └─ heading  "Configure"
│  └─ paragraph
└─ directive_container  step
   ├─ directive_label
   │  └─ heading  "Profit!"
   └─ paragraph
```

- **Rendering is unchanged.** `steps` renders `Steps.svelte`. Each `step` renders `Step.svelte` and gets `label` and `children` snippets, like any container directive.
- **The long form still works.** An author can write `:::step[Install dependencies]` blocks by hand and get the same tree. The heading form is sugar for it.
- **The same rewrite covers the other structured containers:** tabs, accordions and code groups, where the labels render apart from the panels.

```svelte
<!-- Steps.svelte -->
<script>
  let { children } = $props();
</script>
<ol class="steps">{@render children()}</ol>

<!-- Step.svelte -->
<script>
  let { label, children } = $props();
</script>
<li>
  {@render label()}
  {@render children?.()}
</li>
```

## 3. API

### 3.1 The bundle

A `plugins` option takes bundles, on `mdsvex()` and on `compile()`. `parse_plugins` stays as the low-level option for global handlers alone. The parse package's own `ParseOptions.plugins` already means `ParsePlugin[]`, so the name is Q10.

```js
// @mdsvex/kit/steps
export function steps() {
  return {
    name: 'steps',
    /** the module that exports this plugin's components */
    module: '@mdsvex/kit/steps/directives',
    /** one entry per directive name the plugin owns */
    directives: {
      steps: {
        static: true,
        children: { heading(node, ctx) { /* §4 */ } },
      },
      step: { static: true },
    },
  };
}
```

```js
mdsvex({ plugins: [steps()] })
```

A directive's entry can hold:

| key | what it is |
|---|---|
| `children` | handlers for the nodes written directly inside the directive, keyed by node type (§3.2) |
| `descendants` | the same, for nodes at any depth inside the directive |
| `parse` | a handler for the directive node itself |
| `static` | render this directive's component at build time (§5). Accepted and ignored for now |

A bundle can also carry `parse`, an ordinary `ParsePlugin` for document-wide handlers, and `components`, a `ComponentSource` of element replacements. `module` is required only when `directives` has an entry.

**Unpacking** (`unpack` in `packages/mdsvex/src/compile.ts`). Bundles never reach the parser as they are. One pass per bundles array turns them into the inputs a compile already had, plus one new one:

| from | becomes | order |
|---|---|---|
| `module` and the keys of `directives` | a directive `ComponentSource` | ahead of the `directives` option, so the option wins a name |
| `components` | an element `ComponentSource` | ahead of the `components` option |
| `parse` | a global parse plugin | ahead of `parse_plugins`, so those run last |
| `directives` itself | a table of bound handlers (`directive_handlers` in the parse package) | in bundle order |

- **Precedence.** Bundle sources sit below the `components` modules, which sit below template directives. A user's own `steps` export replaces the plugin's component. Among bundles a later one wins a name, its handlers along with its component.
- **Nothing is scanned.** The plugin author names the directives, so the names come from the keys.
- **The parse package ignores keys it does not know in an entry,** so `bundle.directives` is passed to it as it is and `static` rides along.
- **Derived arrays are memoized.** The unpacked result is cached by the identity of the bundles array, and each merge with an option's array is kept for the next compile that gives the same array. The directive scope, the guard, the dispatcher's registrations and the session's plugin arena are all keyed by array identity, and all still hit across documents.
- **Bundles with no handler and no `parse` build no dispatcher.** A kit of plain components costs a document nothing at parse time.
- **Validation.** A bundle that is not an object, has no name, has directives without a module, or has a malformed `components` or `parse` throws an error that names it by index and name. A handler keyed by something that is not a node type, or by `text`, throws when the tables are first used.

**In the Vite plugin** (`packages/mdsvex/src/plugin_registry.ts`):

- **Virtual ids.** Documents import a bundle's directives from `mdsvex:plugin/<index>` and its element replacements from `mdsvex:plugin-components/<index>`, never from a path. Each id resolves the bundle's specifier as an import from the Vite root would, in the environment that asks.
- **A module that does not resolve stops the server at start,** with one error naming the specifier and the plugin.
- **The manifest lists them** (`node_modules/.mdsvex/manifest.json`) in an optional `plugins` field: each plugin's name, and its directives and components module with id, absolute file and names. The version stays 1. `directive_plugins` is also true when a bundle's `parse` has a directive handler.
- **Editors.** language-core puts a manifest plugin's modules below the config's own when it builds compile options, so a bundle directive is accepted, resolves to its file and gets arg completions. `mdsvex.config.json`, which the playground reads too, takes `plugins: [{ name, module, directives: [names] }]`, since JSON can't hold handlers. Neither runs the handlers: the editor and the playground see the tree as written, not the rewritten one.

### 3.2 Bound handlers

A `children` handler is called for a node only when that node was written directly inside the directive that registered it.

```ts
children: {
  heading(node: NodeView, ctx: DirectiveContext): (() => void) | void
}

interface DirectiveContext {
  /** the directive this node is inside */
  directive: NodeView;
  /** how many times this handler has already run in this directive, 0 for the first */
  index: number;
  /** an empty object, fresh for each directive in the document */
  state: Record<string, any>;
}
```

At the parse level they are registered apart from plugins, as `directive_handlers` on the parse options or the third argument of `PluginDispatcher`: an array of tables keyed by directive name. A later table replaces an earlier one's entry for a name. Documented for plugin authors in `packages/parse/PLUGINS.md`.

- **No parent checks.** The handler can assume it is inside its own directive. A global `heading` handler would run for every heading in the document; this one runs only inside `:::steps`.
- **"Directly inside" means in the source.** After the first `wrap_from`, later nodes sit inside a `step` wrapper in the tree. They still count as children of `steps`. A heading inside a nested blockquote, or inside another directive, is not a child and is not passed to `children` handlers. The test is the node's source parent, which both builders have at the open, before any redirect.
- **`descendants`** is the opt-in for plugins that want every node of a type at any depth, such as a gallery that collects images. An outer directive's `descendants` handlers still fire inside a nested directive that has a scope of its own.
- **The label of a container is inside it.** Its `directive_label` is a child and what the label holds are descendants.
- **`index`** tells a handler whether this is its first call (`index === 0`), and gives a running number for step numbers or for marking the first tab selected. `children.heading` and `descendants.heading` of one entry count apart.
- **`state`** holds what the handler needs between calls, such as the wrapper it opened last. It replaces closures and `WeakMap`s. All handlers of an entry share it, the directive's own `parse` included.
- **Nesting.** A `:::steps` inside a `:::steps` gets its own scope, with fresh `state` and its own `index`.
- **Order.** For one node the innermost open directive goes first: its `children` handler, then its `descendants` handler, then the `descendants` handlers of each directive further out. Global plugins run after all of them, so a heading-ids plugin still gives a heading inside `:::steps` its id and sees the wrapper the bound handler made. Close callbacks fire in the same order.
- **The directive itself.** `parse(directive, ctx)` runs once for each directive of the name, in any of the three forms, and the function it returns runs when the directive closes, ahead of the other close callbacks of that node. It runs when the name arrives, which is after the node's open, so global `directive_*` open handlers have already run (without a name to read) and `node.parent` is the parent in the tree. A block directive has its args by then (§7.2). An inline directive gets them at its closing bracket, so its `parse` reads them in the close callback.
- **Leaf and inline directives get `parse` only** (Q7). The nodes inside their label are not passed to the `children` or `descendants` handlers of that name. A container around them still sees those nodes as descendants. An inline directive is pending until its bracket closes, and a `children` handler that had run inside one that is then revoked would leave its work behind, so this stays out until there is a use for it.
- **The guard doesn't change.** Global directive handlers still never see a directive that has a component. Bound handlers are how the owning plugin reaches it. A bound `children` or `descendants` handler for a directive kind does see the directives inside its own, whoever owns them, which is what the long form of tabs needs.
- **Overrides.** The handlers run even when the user replaces the component (principle 3). A user who exports their own `step` gets the same `label` and `children`. This is Q1.
- **No `text` handlers.** The wire emitter suppresses text opens and neither builder dispatches for text, so a `text` entry throws at registration. Rewriting text needs its own design.

### 3.3 `wrap_from`

One new structural method on the node view. Built in both builders, documented for plugin authors in `packages/parse/PLUGINS.md`.

```ts
wrap_from(type: string, attrs?: Record<string, any>): WrapperView
// WrapperView is a NodeView with close(): void
```

- **What it does:** inserts a new node as the parent of this node and of every sibling after it, until `close()` is called or the original parent closes.
- **When:** on a node that is the last child of its parent. In an open handler that is the node in hand. A close callback may call it too, and the wrapper then takes the siblings that follow. A node with a later sibling throws.
- **`close()`:** no later sibling joins the wrapper. If its last child is still open, the wrapper closes when that child closes, through a deferred close keyed by that child. So `node.wrap_from(type).close()`, called in the node's open handler, wraps that node alone. A second `close()` does nothing.
- **Available to every plugin.** Sectionize (audit §3.1) is a global plugin that uses the same method, with a stack of open wrappers by heading depth.
- **In a sequential pass** the tree is complete: the wrapper holds that node alone and is closed at once.

**Placement: dispatch under the source parent, then adopt.** Both builders used to apply redirects and push a node before any handler ran. Under that order, the second heading of `:::steps` would already be inside the first step when its handler ran, and the second step would nest in the first. So the order is:

1. A node whose kind has a handler is pushed under its source parent.
2. Its handlers run.
3. The node then moves to wherever a new child of its current tree parent would go. That one rule covers a node the handler left alone, a node it wrapped with `wrap_from`, and a `wrap_inner` on another node.
4. `wrap_from` places its wrapper by the same rule, which is what nests it inside a wrapper that is still open.

Kinds with no handler, and text, still go straight to the redirect target.

**What a handler sees.**

| | at open | at close |
|---|---|---|
| `node.parent` | the source parent, even under an open wrapper | the real tree parent, such as the step wrapper |
| `node.prev` | the open wrapper, not the previous sibling in the source | the previous sibling in the tree |

`node.parent` at open is a behaviour change for every plugin: a child of a `wrap_inner` parent saw the wrapper before. Bound handlers need the source parent for the "directly inside" test. No test in the repository and nothing in the autolink plugin depended on the old value.

An open wrapper has the node in hand after it until that node's handlers return, so an open handler cannot call `wrap_from` on the open wrapper itself. A close callback can.

**Redirects.**

- A link is a per-node slot in the dispatcher: a `Uint32Array` indexed by buffer index that holds the open wrapper among a node's children, 0 for none. Lookup follows the slots to the innermost wrapper and reads no array at all while no link is live. A dispatcher holds the array only while it has a link: when its last link goes the array is all zero again and is handed to the next dispatcher that needs one, so a dispatcher made for one document allocates none.
- `wrap_inner`, `wrap_from` and `close()` reach the dispatcher directly and change the links at once. Collecting the wraps and linking them after the handlers could not order a `wrap_inner` and a `wrap_from` made in one handler.
- `close()` removes the link to its wrapper and the links inside that wrapper. A link above it stays.
- When a parent closes or is revoked, the whole chain below it is removed and its `wrap_from` wrappers are closed, because a wrapper never receives a parser close.
- The links drive the batch builder's fast path. Only a node with a link sends its children elsewhere, so the dispatcher keeps a floor, an index above every link, and `open_wants` holds per kind the lowest parent whose new child needs no lookup: the floor, or an index no node reaches for a kind a handler takes. The builder compares the parent of each open with it. The floor only rises while a link exists and goes back to 0 with the last one, when `open_wants` is the registration's mask again and `quiet()` is true. Closes get the same treatment through `plain_from()`: a link, a scope and an undo log each sit on one node, and a node past all of them closes without the dispatcher. Links change in `dispatch_open`, `dispatch_close` and `dispatch_revoke`, and the batch builder rereads both after each.

**The synthetic flag.** Every node a structural method makes has bit 1 of its `pending` word set (bit 0 is "pending"). No field was added to the node layout. `NodeBuffer.synthetic_at()` and `Cursor.synthetic` read it.

- **The renderer** tests the flag where it used to guess "the author typed this" from `end`: attribute escaping, the source passthrough of a self-closing element, and which elements a component may replace. A self-closing element made by a plugin used to be sliced from the source. An element the author typed is now read as typed while it is still open.
- **Block repair** (`handle_repair`) chooses block or inline repair from the kind of the nearest ancestor the parser made. A pending root-level `<div>` inside a root-level wrapper is repaired as a paragraph, as it is without the plugin. The same holds under a `wrap_inner` wrapper of a blockquote, where an unclosed `<div>` used to become bare text.

**Wrapper spans.** A `wrap_from` wrapper starts where the node it wrapped starts, and `close()` sets `end = start`.

- The block caches keep a top-level block only once it has an end, so a closed root-level wrapper is cached.
- An error on a synthetic directive reports the position of the node it wrapped. Other synthetic nodes still have `start = 0` and no end.

**Directive args.** When a structural method makes a directive, or a plugin sets `attrs.args` on one, every value must be a string. Anything else throws a `TypeError` at the write. `args: null` is accepted.

**Undo.** Both are logged against the node whose handler ran and unwound on its revoke: an undone `wrap_from` removes the wrapper and returns what it held to its parent, an undone `close()` reopens the wrapper and pulls every later sibling back into it.

- **Not from the handler of a pending node.** `wrap_from` and `close()` throw there in this version.
- **The undo is still reachable.** The parser revokes a few nodes it opened as committed: a table cell that is a merge marker, a code span that never closes, frontmatter with no closing fence. A handler for one of those may call both, and the tests cover the table cell and code span cases on all six paths.
- **Plugin variables are not rolled back.** After such a revoke a plugin can hold a wrapper that was removed. `close()` on it does nothing. Logged `ctx.state` (§7.3) is what fixes this for bound handlers.
- **Where a global plugin keeps its open wrapper.** On `ctx`, which is new for each document. A closure outlives the document under a reused `CompilerSession`, and the wrapper view in it is then stale and throws. The timing script for this change hit exactly that.

**Tests.** `packages/parse/test/wrap_from.spec.ts` runs every case down six paths (batch and wire, whole and fed in chunks of 7 and 1) and expects one tree, sound child lists and a dispatcher with nothing left over. A random-document test also checks that removing the plugin-made nodes gives the tree the parser builds with no plugin. `packages/render/test/wrap_from.spec.ts` checks the cached render against a fresh one after every chunk.

**Cost.** With no link live, dispatch does what it did plus one count check. While a wrapper is open, every open, close and text goes through the dispatcher with one array read per link. For `:::steps` that lasts until the container closes. For a root-level sectionize it is the whole document.

It doesn't remove nodes and doesn't reparent across unrelated parts of the tree, so the constraints in `PLUGINS.md` still hold.

### 3.4 Dispatch

Built in `packages/parse/src/plugin_dispatch.ts`.

- **A scope stack.** Both builders call `dispatch_name` when a `name` attr arrives, which only a directive gets. For a container whose name has `children` or `descendants` handlers the dispatcher pushes a scope: the directive's index, its handler tables, and a `state` and counts made on first use. It then runs the name's own `parse`, for any form of directive.
- **One check per node.** While a scope is open, a node is a child of the innermost scope when its source parent is that scope's directive. A new node always opens inside the innermost open container, so no outer scope is checked for `children`. `descendants` walks the stack, which is as deep as the directives nest.
- **No cost elsewhere.** With no scope open, `dispatch_open` does what it did plus one null check, and `attr` in the batch builder does one more compare when it has a dispatcher.
- **The fast path knows.** `open_wants` is the registration's mask with no scope, and with one it is a per-dispatcher mask of the global kinds, the innermost scope's `children` kinds and every open scope's `descendants` kinds, rewritten in place when a scope opens or ends. A redirect link raises the other kinds to its floor, see Redirects. The builders reread it after `attr`, `close` and `revoke`.
- **The stack keeps the dispatcher awake.** `quiet()` is false while a scope is open, and the batch builder sends the close of its directive to the dispatcher, which is where the scope ends. The nodes inside it opened after the directive and close without it. `reset()` clears the stack.
- **Tables are built once per array of tables,** cached by its identity. Per directive the dispatcher allocates the scope, and the `state` proxy and a counts array when a handler first runs. A bound handler call allocates its context.
- **Bound handlers run in the fused pass only.** A sequential plugin sees the tree they left.

## 4. Examples

### Steps

```js
export function steps() {
  return {
    name: 'steps',
    module: '@mdsvex/kit/steps/directives',
    directives: {
      steps: {
        static: true,
        children: {
          heading(node, ctx) {
            ctx.state.step?.close();
            ctx.state.step = node.wrap_from('directive_container', { name: 'step' });
            node.wrap_from('directive_label').close();
          },
        },
      },
      step: { static: true },
    },
  };
}
```

- **Content before the first heading** stays a direct child of `steps`, and a heading inside a nested blockquote does not start a step. Both are tested, on all six harness paths in `packages/parse/test/bound_handlers.spec.ts` and end to end in `packages/mdsvex/test/plugins.spec.ts`.
- **The last step closes** when `steps` closes.
- **Which headings split** is Q2. With `ctx.state`, the first heading's depth can set the level for the rest.

### Tabs

The same shape with different names. `index` marks the first tab, and the directive's own `parse` passes the count on:

```js
tabs: {
  parse(tabs, ctx) {
    return () => {
      tabs.attrs.args = { ...tabs.attrs.args, count: String(ctx.state.count ?? 0) };
    };
  },
  children: {
    heading(node, ctx) {
      ctx.state.tab?.close();
      ctx.state.tab = node.wrap_from('directive_container', {
        name: 'tab',
        args: ctx.index === 0 ? { selected: 'true' } : null,
      });
      node.wrap_from('directive_label').close();
      ctx.state.count = ctx.index + 1;
    },
  },
},
```

A directive's args are its `args` attr, an object of strings, which is how the parser sets them (`start_block_directive` in `packages/parse/src/main.ts`). A plugin sets the same attr, and the values reach the component as string props. Every value must be a string: the renderer calls `indexOf` on each one and throws on anything else, so the node view checks args when they are set (§3.3). `args: null` is harmless. `Tabs.svelte` renders every `label` in a tab list and every `children` in a panel, which is why it needs the parts separated. Tabs is live, not static.

## 5. Static directives

Many directive components exist only because a component is a nicer way to write HTML: a callout, a badge, a step. They have no state and no handlers, but each instance is still imported, instantiated and hydrated.

### 5.1 The mode

- **Live** (default): what happens today. The directive compiles to a component instance.
- **Static** (opt-in): the component is rendered once at build time, and its HTML is written straight into the document's markup. No component code ships for it, and it adds no hydration work.

### 5.2 A shell with holes

A directive's children are markdown, which can hold live content: `{expr}`, other components, live directives. So a static directive can't be rendered to finished HTML as a whole. It is rendered as a **shell**:

1. The Vite plugin renders the component on the server with its string args as props. For `label` and `children` it passes placeholder snippets that each emit a marker element.
2. The result is the component's HTML with markers where the snippets were rendered.
3. `compile()` writes that HTML into the document and replaces each marker with the document's own markup for that snippet.

```
Callout.svelte + (kind=warn)            the document
────────────────────────────            ────────────
<aside class="callout warn">            <aside class="callout warn">
  <strong>‹label›</strong>         →      <strong>Heads up</strong>
  ‹children›                              <p>Mind the {gap}.</p>
</aside>                                </aside>
```

The children stay ordinary document markup, so `{gap}` is still live. Static directives nest: a static `steps` shell holds static `step` shells in its `children` hole.

### 5.3 Pipeline

`compile()` stays synchronous and pure. Like `src=` in `design/code-modules.md`, the async part happens first:

```
plugin transform (async)                               compile() (sync)
────────────────────────                               ────────────────
scan the document for static directives ─┐
load each component through Vite's SSR   ├──► shells: Map<key, html with markers>
render one shell per (component, args,   ┘       → write shell, fill markers
  which snippets are passed)                     → escape braces, strip hydration comments
track the component file for HMR
```

- **Key:** the component's resolved id, the args, and which of `label` and `children` are present. Most pages reuse a few shells many times.
- **Outside Vite:** the browser `compile()` and the REPL get no shells, and every directive compiles live. Static is an optimisation, never a change in meaning.
- **A failed render is a compile error** that names the directive and its position.

### 5.4 What a static component can't do

A static directive's component:

- **Has no runtime.** No state, effects, event handlers or transitions. They would run at build time and then be gone.
- **Can't read context.** It is rendered alone, outside the page, so `getContext` finds nothing. That rules out a parent and child that coordinate through context, like tabs.
- **Must render each snippet exactly once and unconditionally.** A marker that never appears drops the content, and one that appears twice duplicates it. Both are compile errors.
- **Gets string props only.** Directive args are already strings and never expressions, so this is no new limit.

Tabs stays live. Callouts, steps, badges, kbd and figure can be static.

**What the renderer and plugin need first** (from reading them):

- **A document whose only directives are static must still route through the directive code.** The render walks reach it only when some component replacement is in use, so today such a document would throw a `DirectiveError`.
- **The scan has to parse with the document's parse plugins,** because a plugin's rewrite creates directives that aren't in the source. That is the two-phase compile `design/code-modules.md` also needs.
- **The plugin has no server-rendering runner today.** It has no `configureServer`, and it uses `this.environment` only in `hotUpdate`. The tests show the dev pattern: `createServerModuleRunner(server.environments.ssr)`, with `svelte/server` imported through the same runner.
- **The shell key is shared.** The plugin's scan and the renderer have to agree on (component id, args, which snippets are present), so one exported function builds it.

### 5.5 Styles

The shell's HTML carries the component's scoped class names, but the component's JavaScript, which normally pulls in its CSS, is no longer imported. The document has to get the component's styles another way.

Importing vite-plugin-svelte's style module alone (`Component.svelte?svelte&type=style&lang.css`) is fragile. Its loader reads the compiled CSS from the component's module info, and only warns "failed to load virtual css module" when the component's code wasn't compiled in that module graph. A static directive is exactly that case. See Q4.

### 5.6 Who opts in

Only the component's author knows whether it is self-contained, so the choice sits where the component is registered:

- **A plugin's directive:** `static: true` on its entry (§3.1).
- **A site's own directive:** `mdsvex({ static_directives: ['Callout', 'badge'] })`.

A site can also turn a plugin's static directive back to live, which it needs when it overrides the component with one that has state. See Q5.

## 6. Interactions

- **Navigation.** The step titles are still `heading` nodes, so heading ids, anchors and the TOC work without changes.
- **Revocation and streaming.** See §7.
- **Sequential plugins.** A sequential pass sees the rewritten tree. Bound handlers only run in the fused pass.
- **Code modules.** A `run` block inside a step is unaffected: its module import lives in the document.
- **Static and rewrites are independent.** The rewrite decides the tree. Live or static decides how each directive in that tree renders.

## 7. Incremental parse and render

### 7.1 How it works today

- **Parse.** `feed(chunk)` continues from where it stalled and emits opcodes as lines complete. Nothing is re-parsed. Some nodes open as pending and can be revoked later.
- **Plugin mutations** go into an undo log keyed by the node whose handler ran. A revoke unwinds them. A commit discards the log.
- **Render.** Both renderers cache by top-level block: `CursorHTMLRenderer.update_blocks` in `packages/render/src/html_cursor.ts`, and `ComponentRenderer` in `packages/render/src/component.ts`. An open block is rendered again in full on every update. A closed block is cached and never rendered again.
- **Dirty tracking,** which `PLUGINS.md` describes, isn't implemented in `parse` or `render`.

### 7.2 Why bound handlers fit

- **A container directive is one top-level block,** or sits inside one, and that block stays open until the directive closes. Every wrapper, attr and state change a bound handler makes is inside a block that is rendered again anyway.
- **The directive's close handler runs before the block is cached.** It fires on the close opcode, in the same `feed`, before the renderer's update.
- **The name is known before any child.** `start_block_directive` emits the open, then `args`, then `name`, then the label, before any body child, all in one call, so they are in one batch over the wire too.
- **`args` now arrives before `name`.** The parser used to emit the name first. A scope started on `name` reads the args. To keep one key order for every directive's metadata, `make_meta` gives the object made for `args` a `name` slot first.
- **An inline directive gets its `args` only at its closing bracket,** after its name. Its `parse` runs at the name and reads the args in its close callback.
- **Both builders call the dispatcher from `attr`** for a `name`, when the dispatcher has bound handlers.
- **`wrap_from` is a pointer change the renderer never sees half-done.** A handler runs straight after its node is pushed, when the node has no children. Rendering happens after the whole `feed`. The render tests check the cached render against a fresh one after every chunk (§3.3).

### 7.3 What has to be reversible

A node can be revoked after its handler ran. Everything that handler did has to unwind, logged against that node as today:

| what the handler did | on revoke |
|---|---|
| `wrap_from` | the wrapper is removed, and any siblings already inside return to the original parent |
| `wrapper.close()` | the wrapper reopens and takes back every sibling that arrived after it closed |
| wrote `ctx.state` | the previous value comes back |
| consumed an `index` | the count goes back by one |

- **`state` is a logged proxy,** like `attrs`. It is shallow: replace a value to change it, and don't mutate an object held in it.
- **Revokes do not come in reverse order.** A tight list revokes its paragraphs first to last. Putting each write's prior value back in that order would resurrect a value a revoked node wrote. So the writes of one key form a chain: undoing the last one restores what it replaced, and undoing an earlier one hands what it replaced to the write after it. Each key ends with what its last surviving write put there. A write made while nothing records (a close callback of a committed node) joins the chain too and is never undone.
- **`index` belongs to the dispatcher,** which counts runs per handler and scope and gives one back on a revoke. Handlers that ran since keep the index they were given.
- **When the rollback helps.** A link with no destination, a delimiter cut off by a table cell, a code span that never closes, an unclosed inline directive and the paragraphs of a tight list are revoked while their container is open, and later handlers and the directive's close callback see the corrected state. So is an emphasis delimiter that never closes, the parser revokes it when its paragraph ends, as it does at the root. An html tag that never closes is not: inside a container directive the parser revokes it only after the outermost container has closed. The state is rolled back then, but the directive's close callback has already read it, so a count it wrote to an arg can include that node. Fixing this needs the parser to revoke the tag at the paragraph too.
- **Which nodes can be revoked.** Tight-list paragraphs, paragraphs opened at a tag, HTML nodes and speculative inline constructs open as pending. Headings and block directives are emitted committed. Three kinds open committed and can still be revoked: a table cell that is a merge marker, a code span that never closes, and frontmatter with no closing fence.
- **Undoing `close()` moves nodes.** Reopening alone is not enough: later children would land ahead of the revoked node's remains. So undo pulls every later sibling back into the wrapper.
- **First version: no `wrap_from` and no `close()` from the handler of a pending node.** Both throw. This does not remove the two rows that move nodes, because of the three committed kinds above, so both undos are built and tested. For pending nodes it is caution, not a known failure: the prototype's undo held for a pending `<div>`, a tight-list paragraph and a revoked link.
- **State and `descendants`.** Restoring `state` from a snapshot isn't safe when `descendants` handlers interleave their writes under a long-lived pending HTML block. Log each write.
- **The buffer moves nodes without telling the dispatcher.** `handle_repair`, `unwrap_node` and tight-list unwrap reparent nodes while redirects stay keyed by the old parent. A revoke drops the chain below the revoked node first, so wrappers opened inside a pending `<div>` are closed and then move to the root with its other children. That case is tested. A container directive inside a pending root `<div>` can't occur today, because the parser reads no block directive there.
- **Gaps the prototype found, fixed in #936:** a `wrap_inner` made in a close callback registered no redirect, and `dispatch_revoke` recursed into children that block repair keeps in the tree.

### 7.4 Scope lifetime

- **Pushed** when the `name` attr of a container arrives, if its entry has `children` or `descendants` handlers.
- **Popped** when the directive closes, after its close callbacks, including at the end of input, where the parser closes what is still open.
- **Popped on revoke,** wherever the scope sits in the stack. Block directives aren't pending today, so this isn't expected, but the stack must not be left holding a dead scope.
- **Open wrappers close with the directive.** A wrapper that is still open when its directive closes is closed then.

### 7.5 The inside-only rule

A bound handler may change only nodes inside its own directive.

- **Why:** a closed top-level block is never rendered again, and there is no dirty tracking. A handler that reaches out through `node.parent` and changes an earlier block leaves stale output.
- **Global plugins have this hazard today.** Bound handlers avoid it by construction unless they reach out on purpose.
- **Enforcement** is Q9.

### 7.6 Costs

- **An open container is rendered again on every update,** including its children that finished long ago. This is true today of any open blockquote or list, and is fine for now. Caching the finished children of an open container would fix it, but it would also need the inside-only rule to cover finished siblings, or real dirty tracking.
- **A plugin no longer turns off compiler reuse.** `CompilerSession` keeps a plugin arena (#936), keyed by the identity of the global plugins array, the bound handler tables and the reserved-directive scope. All three are stable across documents with bundles (§3.1). A document that uses no bundle directive pays for the dispatcher being there: the builder's slower `leaf` and `close` paths, as with any parse plugin.
- **Static directives don't interact with any of this.** Shells are a Vite-plugin step, and a streaming preview compiles every directive live.

## 8. Phasing

| phase | work | depends on |
|---|---|---|
| 0 | done: plugin test harness (batch and wire parity, the missing revoke tests), compiler reuse with plugins | — |
| 1 | done: `plugins` option, bundle shape, plugin component sources, precedence, manifest entries | 0 |
| 2 | done: bound handlers: `args` before `name` in the parser, the scope stack and its lifetime, the per-directive fast-path mask, `children`, `descendants`, `parse`, `DirectiveContext`, logged `state` | 1 |
| 3 | done: `wrap_from` in both builders, the placement rule, a per-node redirect slot, a synthetic flag on nodes, the pending-node refusal, string-only args, revocation tests (§3.3) | 0 |
| 4 | kit plugins on 2 and 3: steps, tabs, accordion, code group; sectionize as a global plugin | 2, 3 |
| 5 | static directives: scan, SSR shells, marker fill, styles, HMR tracking, `static` on entries and `static_directives` | 1, two-phase compile, Q4 and Q6 answered |

## 9. Open questions

- **Q1. Overrides.** Do a plugin's handlers still run when the user replaces its component? Built as yes (§3.2), not ruled on. The alternative is that an override takes the directive over completely.
- **Q2. Which headings split.** The shallowest heading level among the direct children, the level of the first heading, a fixed level, or an arg such as `:::steps(level=3)`?
- **Q4. Styles for static directives.** Importing vite-plugin-svelte's style module alone is fragile (§5.5). Compile the component in the plugin to get its CSS, ask upstream for a sanctioned way to import a component's CSS alone, or require static components to use global styles?
- **Q5. Where static is declared.** On the registration (§5.6), by a marker the component exports from `<script module>`, or both?
- **Q6. Loading components at build time.** The dev server can load a module through its SSR environment. A production build has no dev server. What loads and renders the component there?
- **Q7. Leaf and inline directives.** Their bracket text is parsed into a label. Should `children` handlers also run for the nodes inside a label? Built as no: they get the directive's own `parse` and nothing for the label (§3.2). Adding it later breaks nothing.
- **Q9. Enforcing the inside-only rule.** Document it only, or check in development that a bound handler's writes land inside its directive?
- **Q10. The bundle option's name.** `plugins` at the mdsvex level, although the parse package's `ParseOptions.plugins` means something else, or another name? Built as `plugins`, not ruled on. The parse-level option for bound handlers is `directive_handlers`.
- **Q11. Late revokes inside a container.** An unclosed emphasis or html tag inside a container directive is revoked after the container closed, so a directive's close callback can count a node that then goes (§7.3). Move the revoke to the paragraph end in the parser?

Answered by reading the code and by the prototype (2026-10-10):

- **When the name is set.** Straight after the open and before any child, label included (§7.2).
- **Args on synthetic directives.** They are the `args` attr, an object of strings (§4, Tabs).
- **Blocks inside a label.** A `heading` inside a `directive_label` renders inside the label snippet. Checked by the prototype on the uncached render with a directive scope.
- **Is `wrap_from` feasible?** Yes, with the placement rule in §3.3.
- **Q3, the `node.parent` change.** Accepted for every plugin: `node.parent` in an open handler is the source parent (§3.3).
- **Q8, compiler reuse.** `CompilerSession` resets a dispatcher between documents (#936), and bundles keep its keys stable (§7.6).
