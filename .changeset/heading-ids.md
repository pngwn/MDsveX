---
'mdsvex': minor
---

`heading_ids`, off by default, gives every markdown heading an `id` made from its text, as `rehype-slug` did. The id is the one GitHub makes, and a repeated heading gets `-1`, `-2` and so on.

```js
mdsvex({ heading_ids: true });
```

```svx
## Getting _started_

## Getting started
```

```html
<h2 id="getting-started">Getting <em>started</em></h2>
<h2 id="getting-started-1">Getting started</h2>
```

The text is what a reader sees, so expressions, components and directives contribute nothing. A heading that already has an `id` keeps it, and a heading with no text left gets none. A replaced heading gets the `id` as a prop, and a sequential parse plugin can read it from `node.attrs.id`.

For another scheme pass a `slug` function. Duplicates in what it returns are numbered the same way, and `heading_slug` is the default one.

```js
import { mdsvex, heading_slug } from 'mdsvex';

mdsvex({
	heading_ids: { slug: (text, { depth }) => `h${depth}-${heading_slug(text)}` },
});
```

`compile()` takes the option too. `@mdsvex/parse` on its own makes no ids.
