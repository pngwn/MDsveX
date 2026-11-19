---
'@mdsvex/plugin-anchors': minor
---

New package: heading anchors. It puts a link to itself on every heading that has an id, and needs the `heading_ids` option of mdsvex, which makes the ids.

```js
import { anchors } from '@mdsvex/plugin-anchors';

mdsvex({ heading_ids: true, plugins: [anchors()] });
```

```html
<h2 id="getting-started"><a href="#getting-started">Getting started</a></h2>
```

`position` is `'wrap'` (the default), `'prepend'` or `'append'`. The last two add an empty link with `aria-hidden="true"` and `tabindex="-1"` for a stylesheet to draw, and `attrs` adds attributes such as a class.

This replaces the unpublished `@mdsvex/plugin-autolink`, which made its own ids. Without `heading_ids` no heading has an id and nothing is linked.
