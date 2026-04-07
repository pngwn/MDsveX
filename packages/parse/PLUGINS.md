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
- `textContent` — flattened text of all descendants (populated as children arrive)
- `parent`, `firstChild`, `lastChild`, `next`, `prev` — lazy traversal, each returns a view for the corresponding node or `null`
- Type-specific properties surfaced directly (`depth` for headings, `lang` for code blocks, etc.)

**Writable properties**
- `attrs` — a key-value bag for arbitrary attributes. Proxied so setter calls flow through to the SoA and trigger dirty marking.
- `type` — yes, writable. Changing the type rewrites the type slot in the SoA. The renderer will read the new type when rendering. No validation — if you set heading `type` to `paragraph`, `depth` becomes meaningless but the system doesn't care.

**Structural methods**
- `wrapInner(type, attrs?)` — inserts a new node between this node and its current children, returns the new node's view
- `prepend(type, attrs?)` — inserts a new node as the first child, returns the new node's view
- `append(type, attrs?)` — inserts a new node as the last child, returns the new node's view

### Mutation Semantics

Property mutations are **local to the node being mutated**. Setting `node.attrs.id = 'foo'` writes to that one node's slot and does nothing else. It cannot cause side effects elsewhere in the tree.

Traversal is cheap and safe. You can reach any node from any other node via `parent`/`firstChild`/etc., and mutate its properties:

```js
parse(node, ctx) {
  if (node.parent?.type === 'heading') {
    node.parent.attrs.class = 'has-link';
  }
}
```

The parent is a view over the same backing store. Writing `attrs.class` on it updates the heading's attrs slot directly. The dirty marking machinery handles re-rendering automatically.

Structural mutations (`wrapInner`, `prepend`, `append`) can also be called on any node reached via traversal, not just the handler's own node. The builder handles the consequences — updating SoA pointers, emitting synthetic opcodes where appropriate, marking the affected subtree dirty.

### Node View Identity

Views are cached by node ID within a single dispatch. If two handlers both read `node.parent`, they get the same view object. This matters because the attrs proxy needs stable identity for dirty tracking to work correctly.

The cache is short-lived — it exists for the duration of plugin dispatch on a single node and is discarded afterward. Views are cheap to create, so this isn't an optimization concern, it's a correctness requirement.

## Handler Lifecycle

### Open-Time Execution

The `parse` function fires when the builder encounters a node's open opcode. At this point:

- The node's type and initial attrs are known
- Its parent is known
- Its children have not yet arrived
- `textContent` is empty (or partial, if content is streaming in)

This is the window for structural mutations. `wrapInner` works because the children haven't been emitted downstream yet — the builder can inject the synthetic node's open opcode immediately, and subsequent children stream through it naturally.

### Close-Time Execution

Returning a function from the parse handler registers it as a close callback. It fires when the node's close opcode is processed, after all children have been added to the tree.

At close time:

- All children are present in the SoA
- `textContent` is fully populated
- Traversal of descendants is meaningful

This is the window for data-dependent work. Slug generation, content analysis, anything that needs to see the finished node.

The closure captures whatever state the open handler set up:

```js
heading: {
  parse(node, ctx) {
    const link = node.wrapInner('link');

    return () => {
      const slug = slugify(node.textContent);
      node.attrs.id = slug;
      link.attrs.href = `#${slug}`;
    };
  }
}
```

`link` is captured by closure. On close, the callback uses it directly — no lookup, no re-traversal.

### Streaming vs Batch

In `WireTreeBuilder` (streaming), the gap between open and close can be arbitrarily long. Content arrives in opcode batches, the builder processes each batch, and the close callback fires whenever the close opcode arrives.

In `TreeBuilder` (batch), the gap is effectively zero. Open and close fire back-to-back as the builder walks through a pre-parsed opcode sequence.

Plugin code is identical in both modes. The handler doesn't know which builder it's running in. The only observable difference is that `textContent` is only guaranteed complete in the close callback — during the open handler, it reflects whatever has arrived so far (which is nothing in batch mode, and a partial state in streaming mode).

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

If two plugins both call `wrapInner` on the same node, the wrappers nest in registration order:

```js
// Plugin A: wrapInner('link')
// Plugin B: wrapInner('span')

// Result in SoA:
// heading → link → span → [original children]
```

Each `wrapInner` is its own structural operation on the current state of the tree. The second one wraps whatever the first one produced.

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

## Dirty Tracking

Every mutation through the node view marks the affected node dirty. This is how the system knows what to re-render after parse plugins have run.

Two levels of dirty state:

- **attrs dirty** — the node's own output needs re-rendering, children are fine
- **children dirty** — the node's subtree structure has changed, full subtree needs re-rendering

Attribute setters flip the first bit. Structural methods (`wrapInner`, `prepend`, `append`) and type changes flip the second.

In streaming mode, dirty marking drives incremental re-rendering — only the changed subtrees get re-rendered and patched into the output. In batch mode, dirty marking is moot because rendering happens once after parse completes, so the dirty state just gets consumed by the initial render.

## Dispatch Implementation

The builder dispatches to handlers via a codegen'd switch on node type, with destructured local bindings for each composed handler function. This keeps every call site monomorphic — the JIT can inline-cache each arm independently, and the composed handlers are stable references captured at registration time.

The dispatch structure is generated at PFM build time based on the known node type set. Plugin registration builds a stable handlers object keyed by node type; the dispatch function destructures it once per invocation and calls into specific locals in the switch arms. No property lookups in the hot path, no polymorphic call sites, no runtime code generation.

Multiple plugins on the same node type are composed into a single function at registration time. For small numbers of plugins (up to a codegen'd arity limit), the composition is unrolled with captured closure bindings — each call site stays monomorphic. Beyond the limit, a loop fallback accepts the deopt for the rare pathological case.

## Constraints and Guarantees

**What parse plugins can do:**
- Read any property on any node reachable via traversal
- Write attrs, type, and type-specific properties on any reachable node
- Inject synthetic children via `wrapInner`/`prepend`/`append` on any reachable node
- Register close callbacks via return value
- Capture state in closures between open and close

**What parse plugins cannot do:**
- Walk the tree during their own handler (no `walk`, `querySelectorAll`, etc.) — they react to what the builder sends them
- Reparent existing nodes across unrelated parts of the tree (structural methods only add, not move)
- Remove nodes
- Modify the parser itself or affect how tokens become nodes
- Do work outside their registered node types — if a plugin only has a `heading` entry, it never sees other node types

**Guarantees:**
- Property mutations never have non-local effects beyond dirty marking
- Synthetic nodes behave identically to parser-produced nodes (traversal, rendering, revocation)
- Revocation of a parent node revokes all its synthetic descendants automatically
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

**Structural mutations.** `wrapInner`, `prepend`, and `append` each create synthetic nodes. The builder records the IDs of the created nodes and the SoA pointer state before the mutation. Revocation deletes the synthetic nodes and restores the original parent-child relationships.

**Cross-node mutations.** When a plugin reaches through traversal to modify a different node (say, setting an attr on `node.parent`), that mutation is captured in the undo log of the node whose handler is running, not the node that was modified. This is because the revocation boundary is the handler's node — if the parser revokes the parent later, that's a separate revocation event with its own undo log.

### Scoping the Undo Log

The undo log is keyed by node ID. Each node has an associated log of mutations made during its lifetime. When a revoke opcode arrives for a node, the builder:

1. Walks the undo log for that node in reverse order
2. Applies each undo entry (restoring prior attr values, deleting synthetic children, reverting type changes)
3. Recurses into descendants, doing the same for each
4. Removes the node from the SoA

Because plugin mutations on traversal-reached nodes are logged against the handler's node, revoking node A automatically unwinds any mutations A's handlers made to unrelated nodes. This prevents the scenario where revoking a link leaves behind an attr change the link's handler made on its parent heading.

### Close Callback Captures Are Not Special

The close callback runs later, potentially well after the open handler. Its mutations are captured the same way — through the view setters, into the same undo log for the node being mutated. Revocation between open and close is handled by the builder discarding the close callback entirely (it's held in a per-node registration) and running the undo log.

If revocation happens after close has fired, the close callback's mutations are already in the undo log alongside the open handler's mutations, and they get unwound together in reverse order.

## Implementation Notes

The undo log is the main new piece of state the builder needs to maintain. It's per-node, short-lived (discarded when the node is committed or revoked), and proportional in size to how much plugin activity happened on that node.

For nodes with no plugin activity, the undo log is never allocated. This is the common case, and the builder can skip the bookkeeping entirely when no handlers have registered against the node's type.

For nodes with handlers, the log accumulates as the handler runs. The setters on the node view check whether a log exists for the current node and append to it. Structural methods write their own entries. The log is a simple array of records, each describing one mutation and how to reverse it.

Commit is the inverse of revoke: when a node is committed (its close opcode is processed and no revoke followed), the undo log is simply discarded. The mutations become permanent, and the memory is freed.

## Guarantees

**Type changes preserve identity.** Changing a node's type doesn't affect opcode routing. Close and revoke opcodes continue to target the correct node by ID.

**Mutations are fully reversible.** Any property or structural change made by a plugin can be undone if the node is later revoked. The undo log captures prior state at mutation time, not revocation time, so there's no race between plugin execution and revocation arriving.

**Revocation cascades.** Revoking a node revokes all its descendants — parser-produced and plugin-synthesized alike. The undo log walks the subtree and restores each node's pre-plugin state before removing the nodes from the SoA.

**Close callbacks are cancelable.** If revocation happens between open and close, the registered close callback is discarded and never runs. Plugins don't need to check whether their node still exists — if the callback fires, the node is real.

**Zero cost for unhandled nodes.** Nodes of types with no registered plugins pay nothing for the undo machinery. The log is only allocated when a handler actually mutates the node.
