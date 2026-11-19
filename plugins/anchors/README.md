# @mdsvex/plugin-anchors

Heading anchors for [mdsvex](https://mdsvex.pngwn.io): a link to itself on every heading that has an id.

```bash
pnpm add --save-dev @mdsvex/plugin-anchors@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { anchors } from '@mdsvex/plugin-anchors';

export default {
	plugins: [mdsvex({ heading_ids: true, plugins: [anchors()] })],
};
```

```md
## Getting started
```

```html
<h2 id="getting-started"><a href="#getting-started">Getting started</a></h2>
```

## It needs `heading_ids`

The plugin makes no ids. It links the id each heading has after the [`heading_ids`](https://mdsvex.pngwn.io/docs#heading_ids) option of mdsvex has run, so **with `heading_ids` off no heading has an id and nothing is linked**.

- A heading that ends up with no id, such as `## {title}`, gets no link.
- An id a parse plugin set is linked like any other.
- A heading typed as HTML (`<h2 id="x">`) is not a markdown heading and is left alone.
- To change the ids, pass a `slug` function to `heading_ids`.

## Options

```ts
anchors({
	position: 'wrap' | 'prepend' | 'append', // 'wrap'
	attrs: Record<string, string>,
});
```

### `position`

- `'wrap'` puts the content of the heading inside the link. It needs no styles and is reachable by keyboard. A heading that already holds a link is left as it is, since a link can't hold another.
- `'prepend'` and `'append'` add an empty link before or after the content, with `aria-hidden="true"` and `tabindex="-1"`. Draw it with a stylesheet:

```js
anchors({ position: 'prepend', attrs: { class: 'anchor' } });
```

```html
<h2 id="getting-started">
	<a href="#getting-started" aria-hidden="true" tabindex="-1" class="anchor"></a
	>Getting started
</h2>
```

```css
.anchor::before {
	content: '#';
}
```

### `attrs`

More attributes for the link. One with the name of a default (`aria-hidden`, `tabindex`) replaces it.

## With `compile`

```js
import { compile } from 'mdsvex';

compile(source, { heading_ids: true, plugins: [anchors()] });
```

`@mdsvex/parse` used on its own makes no heading ids, so the plugin does nothing there.
