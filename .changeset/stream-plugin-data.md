---
'@mdsvex/render': minor
'mdsvex': minor
---

A streaming view follows what plugins write and what their deferred tasks change. `PluginStream` from `@mdsvex/render/stream` holds the wire builder and the dispatcher of a document that arrives in pieces:

```js
import { PluginStream } from '@mdsvex/render/stream';

const stream = new PluginStream({ plugins, headings: make_heading_ids() });
stream.renderers.push(renderer);
stream.on_change(() => renderer.update(stream.buffer, ''));
for await (const batch of batches) stream.apply(batch);
await stream.end();
```

- `stream.data.current` is what plugins wrote, a new object after each change, and a component that reads it renders again when it changes.
- A node a deferred task changed renders again, even in a block the renderer had cached. `CursorHTMLRenderer` and `ComponentRenderer` take `invalidate(buf, nodes)` for this.
- `end()` runs the sequential passes, waits for the deferred tasks and runs the document hooks, then renders every block again.

Components read the data from the Svelte context under `Symbol.for('mdsvex.plugin_data')`, as `{ current }`. `Node.svelte` sets it from its `plugin_data` prop and a compiled document that has plugin data sets it too, so a component reads it the same way in both:

```svelte
<script>
	import { getContext } from 'svelte';
	const data = getContext(Symbol.for('mdsvex.plugin_data'));
</script>

{data?.current?.toc?.headings.length}
```

`Node.svelte` also takes `directives`, a component for a directive by its name, which gets the args as props and the label and the content as snippets, as in a compile. A stream with no plugin renders as before.
