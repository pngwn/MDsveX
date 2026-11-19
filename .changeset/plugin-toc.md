---
'@mdsvex/plugin-toc': minor
---

New package: a table of contents. It leaves the headings of each document in its plugin data, as a flat list with the depth, id, text and source position of each.

```js
import { toc } from '@mdsvex/plugin-toc';

mdsvex({ heading_ids: true, plugins: [toc()] });
```

```js
import Page, { plugin_data } from './getting-started.svx';

plugin_data.toc.headings;
// [{ depth: 2, id: 'install', text: 'Install', position: { start, end } }, ...]
```

- It needs `heading_ids` and makes no ids of its own. With the option off, the compile of a document that has a heading to list fails with a `TocError`.
- `min_depth` and `max_depth` choose the depths, 2 and 3 by default. A `<!-- no-toc -->` comment in a heading leaves that heading out.
- `toc_tree(headings)` nests the list, and `@mdsvex/plugin-toc/Toc.svelte` renders it as nested links, for a template to put in a sidebar. It needs Svelte 5.20 or later.
- `::toc` on a line of its own renders the same component in the document, with the headings after it included. `::toc[On this page]` gives it a label and `::toc(max_depth=2)` narrows it.
- The build warns about a heading that skips a level, a heading left out because it has no id, and a `::toc` with nothing to list.
