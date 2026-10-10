# Plugin directives: design

Status: draft, 2026-10-10. Targets `next`. Nothing here is decided yet; the open questions are in §9.

Sources:
- The plugin audit (`plugins/PLUGIN_AUDIT.md`): the Presentation concern, and the directive rows in its §4.
- `packages/parse/PLUGINS.md`: the parse-plugin model, which this extends.
- `design/templates-and-components.md` §5: directives as components.
- The motivating case, a `:::steps` container whose headings become numbered steps:

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

## 0. Where we are

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

A new `plugins` option takes bundles. `parse_plugins` stays as the low-level option for global handlers alone.

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
| `parse` | a handler for the directive node itself, with the usual open and close shape |
| `static` | render this directive's component at build time (§5) |

- **Components.** `module` and the keys of `directives` make a `ComponentSource`. The plugin author knows the names, so nothing is scanned. It reaches `compile()` with the other directive sources.
- **Precedence.** Plugin sources sit below the `components` modules, which sit below template directives. A user's own `steps` export replaces the plugin's component.
- **Global work.** A bundle can also carry `parse`, an ordinary `ParsePlugin` for document-wide handlers, and `components`, a `ComponentSource` of element replacements.
- **The manifest lists them** (`node_modules/.mdsvex/manifest.json`), so language-tools knows `:::steps` is valid.

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

- **No parent checks.** The handler can assume it is inside its own directive. A global `heading` handler would run for every heading in the document; this one runs only inside `:::steps`.
- **"Directly inside" means in the source.** After the first `wrap_from`, later nodes sit inside a `step` wrapper in the tree. They still count as children of `steps`. A heading inside a nested blockquote, or inside another directive, is not a child and is not passed to `children` handlers.
- **`descendants`** is the opt-in for plugins that want every node of a type at any depth, such as a gallery that collects images.
- **`index`** tells a handler whether this is its first call (`index === 0`), and gives a running number for step numbers or for marking the first tab selected.
- **`state`** holds what the handler needs between calls, such as the wrapper it opened last. It replaces closures and `WeakMap`s, and the handler table is built once at registration.
- **Nesting.** A `:::steps` inside a `:::steps` gets its own scope, with fresh `state` and its own `index`.
- **The directive itself.** `parse(directive, ctx)` runs when the directive opens, and the function it returns runs when it closes. Tabs would count its panels there.
- **Global plugins still see these nodes.** A heading inside `:::steps` still gets its id from a heading-ids plugin. Bound handlers run first, so global plugins see the node in its final place.
- **The guard doesn't change.** Global directive handlers still never see a directive that has a component. Bound handlers are how the owning plugin reaches it, and no other plugin can.
- **Overrides.** The handlers run even when the user replaces the component (principle 3). A user who exports their own `step` gets the same `label` and `children`.

### 3.3 `wrap_from`

One new structural method on the node view:

```ts
wrap_from(type: string, attrs?: Record<string, any>): WrapperView
// WrapperView is a NodeView with close(): void
```

- **What it does:** inserts a new node as the parent of this node and of every sibling after it, until `close()` is called or the original parent closes.
- **When:** in the open handler only, before the node's subtree has gone downstream. This matches `wrap_inner`. In the first version it refuses a pending node (§7.3).
- **Streaming:** the builder emits a synthetic open before the node, and a synthetic close at `close()` or at the parent's close. Nothing is moved after the fact. `wrap_inner` already redirects later children into a wrapper (`plugin_dispatch.ts`, the redirect map), and this is the same idea one level up. It hasn't been prototyped.
- **Nesting:** a wrapper is the current parent of the nodes inside it. Calling `wrap_from` on a node inside an open wrapper nests the new wrapper in the old one.
- **`close()`:** no later sibling joins the wrapper. If a child is still open, the wrapper closes when that child closes. So `node.wrap_from(type).close()`, called in the node's open handler, wraps that node alone.
- **Undo and dirty tracking:** recorded in the undo log like `wrap_inner`, and it marks the original parent's children dirty.
- **Available to every plugin.** Sectionize (audit §3.1) is a global plugin that uses the same method, with a stack of open wrappers by heading depth.

It doesn't remove nodes and doesn't reparent across unrelated parts of the tree, so the constraints in `PLUGINS.md` still hold.

### 3.4 Dispatch

- **A scope stack.** When the `name` attr of a directive with bound handlers arrives, straight after its open, the builder pushes the handler table and a new `state`. When the directive closes, the builder pops (§7.4).
- **One check per node.** While the stack is not empty, a node is a child of the top scope when its source depth is the directive's depth plus one. `descendants` handlers skip the check.
- **No cost elsewhere.** With an empty stack, dispatch is what it is today.
- **Tables are built at registration,** one per directive entry, so call sites stay monomorphic. Nothing is allocated per directive except `state`.

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

- **Content before the first heading** stays a direct child of `steps`.
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

A directive's args are its `args` attr, an object of strings, which is how the parser sets them (`start_block_directive` in `packages/parse/src/main.ts`). A plugin sets the same attr, and the values reach the component as string props. `Tabs.svelte` renders every `label` in a tab list and every `children` in a panel, which is why it needs the parts separated. Tabs is live, not static.

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

### 5.5 Styles

The shell's HTML carries the component's scoped class names, but the component's JavaScript, which normally pulls in its CSS, is no longer imported. The document has to import the component's styles alone. vite-plugin-svelte exposes them as a virtual module (`Component.svelte?svelte&type=style&lang.css`), but that id is its own internal format. See Q4.

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
- **The name and args are known immediately.** `start_block_directive` emits the open, then the `name` and `args` attrs, then the label, before any body child. The scope starts on the `name` attr, so a batch boundary between the open and the attr is harmless.
- **`wrap_from` is a pointer change the renderer never sees half-done.** A handler runs straight after its node is pushed, when the node has no children and is its parent's last child. Rendering happens after the whole `feed`.

### 7.3 What has to be reversible

A node can be revoked after its handler ran. Everything that handler did has to unwind, logged against that node as today:

| what the handler did | on revoke |
|---|---|
| `wrap_from` | the wrapper is removed, and any siblings already inside return to the original parent |
| `wrapper.close()` | the wrapper reopens, and later siblings flow into it again |
| wrote `ctx.state` | the previous value comes back |
| consumed an `index` | the count goes back by one |

- **`state` is a logged proxy,** like `attrs`. It is shallow: replace a value to change it, and don't mutate an object held in it.
- **`index` belongs to the builder,** which rolls it back.
- **Which nodes can be revoked.** Tight-list paragraphs, paragraphs opened at a tag, HTML nodes and speculative inline constructs open as pending. Headings and block directives are emitted committed.
- **First version: `wrap_from` refuses a pending node.** That removes the first row of the table, the only one that moves nodes back. The other three rows are still needed, because a handler on a pending paragraph can close a wrapper and write state.

### 7.4 Scope lifetime

- **Pushed** when the `name` attr arrives.
- **Popped** when the directive closes, including at the end of input.
- **Popped on revoke.** Block directives aren't pending today, so this isn't expected, but the stack must not be left holding a dead scope.
- **Open wrappers close with the directive.** A wrapper that is still open when its directive closes is closed then.

### 7.5 The inside-only rule

A bound handler may change only nodes inside its own directive.

- **Why:** a closed top-level block is never rendered again, and there is no dirty tracking. A handler that reaches out through `node.parent` and changes an earlier block leaves stale output.
- **Global plugins have this hazard today.** Bound handlers avoid it by construction unless they reach out on purpose.
- **Enforcement** is Q9.

### 7.6 Costs

- **An open container is rendered again on every update,** including its children that finished long ago. This is true today of any open blockquote or list, and is fine for now. Caching the finished children of an open container would fix it, but it would also need the inside-only rule to cover finished siblings, or real dirty tracking.
- **Any plugin turns off compiler reuse.** `CompilerSession` falls back to the one-shot path when `parse_plugins` is set, because the dispatcher owns a per-document text view (`packages/mdsvex/src/compile.ts`). A common kit would cost every document that fast path, whether or not it uses the directive. See Q8.
- **Static directives don't interact with any of this.** Shells are a Vite-plugin step, and a streaming preview compiles every directive live.

## 8. Phasing

| phase | work | depends on |
|---|---|---|
| 1 | `plugins` option, bundle shape, plugin component sources, precedence, manifest entries | — |
| 2 | bound handlers: the scope stack and its lifetime, `children`, `descendants`, `parse`, `DirectiveContext`, logged `state` | 1 |
| 3 | `wrap_from` in both builders: redirect, undo for `close()`, the pending-node refusal, revocation tests | — |
| 4 | kit plugins on 2 and 3: steps, tabs, accordion, code group; sectionize as a global plugin | 2, 3 |
| 5 | static directives: scan, SSR shells, marker fill, styles, HMR tracking, `static` on entries and `static_directives` | 1 |

## 9. Open questions

- **Q1. Overrides.** Do a plugin's handlers still run when the user replaces its component? This draft says yes (§3.2). The alternative is that an override takes the directive over completely.
- **Q2. Which headings split.** The shallowest heading level among the direct children, the level of the first heading, a fixed level, or an arg such as `:::steps[](level=3)`?
- **Q3. Blocks inside a label.** `directive_label` holds inline content today. The rewrite puts a `heading` in it. Does the renderer accept that, or should the step get the heading another way?
- **Q4. Styles for static directives.** Import vite-plugin-svelte's virtual style module, ask upstream for a sanctioned way to import a component's CSS alone, or require static components to use global styles?
- **Q5. Where static is declared.** On the registration (§5.6), by a marker the component exports from `<script module>`, or both?
- **Q6. Loading components at build time.** The dev server can load a module through its SSR environment. A production build has no dev server. What loads and renders the component there?
- **Q7. Leaf and inline directives.** Their bracket text is parsed into a label. Should `children` handlers also run for the nodes inside a label?
- **Q8. Compiler reuse.** Teach `CompilerSession` to reset a dispatcher between documents, or keep the fast path for documents that use no claimed directive?
- **Q9. Enforcing the inside-only rule.** Document it only, or check in development that a bound handler's writes land inside its directive?

Answered by reading the parser (2026-10-10):

- **When the name is set.** Straight after the open and before any child, label included (§7.2).
- **Args on synthetic directives.** They are the `args` attr, an object of strings (§4, Tabs).
