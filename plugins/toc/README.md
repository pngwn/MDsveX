# @mdsvex/plugin-toc

A table of contents for [mdsvex](https://mdsvex.pngwn.io): the headings of each document as data, a component that renders them as a nested list, and a `::toc` directive that puts that list in the document.

```bash
pnpm add --save-dev @mdsvex/plugin-toc@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { toc } from '@mdsvex/plugin-toc';

export default {
	plugins: [mdsvex({ heading_ids: true, plugins: [toc()] })],
};
```

```md
# Getting started

## Install

### With pnpm

## Configure
```

```js
import Page, { plugin_data } from './getting-started.svx';

plugin_data.toc.headings;
// [
//   { depth: 2, id: 'install', text: 'Install', position: { start, end } },
//   { depth: 3, id: 'with-pnpm', text: 'With pnpm', position: { start, end } },
//   { depth: 2, id: 'configure', text: 'Configure', position: { start, end } },
// ]
```

It needs Svelte 5.20 or later.

## The data

`plugin_data.toc.headings` is a flat list, in the order the headings are written. Each entry has:

- **`depth`**, 1 to 6.
- **`id`**, the id the heading has in the page, so `'#' + id` links to it.
- **`text`**, the text a reader sees, without markup. Emphasis, links and code are their text, an image is its alt, and a character reference such as `&amp;` is its character. What only exists once the page runs is not in it: a `{expression}`, a component, a directive.
- **`position`**, where the heading is in the source, as `{ start, end }` with an `offset`, a `line` from 1 and a `column` from 0 each.

The list is flat because that is what the document holds and what is easy to filter. `toc_tree` nests it:

```js
import { toc_tree } from '@mdsvex/plugin-toc';

toc_tree(plugin_data.toc.headings);
// [
//   { depth: 2, id: 'install', text: 'Install', children: [
//     { depth: 3, id: 'with-pnpm', text: 'With pnpm', children: [] },
//   ] },
//   { depth: 2, id: 'configure', text: 'Configure', children: [] },
// ]
```

Each heading goes under the nearest heading before it that is less deep, so one that skips a level still has a parent.

The data reaches a page the three ways all [plugin data](https://mdsvex.pngwn.io/docs#plugin-data) does: the `plugin_data` export of the document, the `plugin_data` prop of its template, and a `?data` import, which parses a document without rendering it:

```js
const pages = import.meta.glob('./docs/*.svx', { query: '?data', eager: true });
// pages['./docs/intro.svx'].plugin_data?.toc?.headings
```

**A document with nothing to list has no `toc` key**, so read it as `plugin_data?.toc?.headings ?? []`. The package types the key, by adding to the `PluginData` interface of mdsvex. That is in effect once TypeScript sees an import of the package, which a `vite.config.ts` gives it. With a config it does not check, add `import type {} from '@mdsvex/plugin-toc';` to a declaration file such as `src/app.d.ts`.

## It needs `heading_ids`

The plugin makes no ids. It lists the id each heading has after the [`heading_ids`](https://mdsvex.pngwn.io/docs#heading_ids) option of mdsvex has run.

- **With `heading_ids` off the compile fails** with a `TocError` whose `code` is `'heading_ids'`, as soon as a document has a heading to list.
- A heading that ends up with no id, such as `## {title}`, is left out, with a `heading_without_id` warning.
- An id a parse plugin set is listed like any other.
- A heading typed as HTML (`<h2 id="x">`) is not a markdown heading and is not listed.

A plugin is not told the options of the compile, so the plugin reads this off the document: it fails when no heading has an id and one that would be listed has text an id could be made from.

## Options

```ts
toc({
	min_depth: 1 | 2 | 3 | 4 | 5 | 6, // 2
	max_depth: 1 | 2 | 3 | 4 | 5 | 6, // 3
});
```

The defaults leave out the `#` title of the page and anything below `###`. A value that is no heading depth throws a `TocError` with the `code` `'option'` when the plugin is made.

## Leaving a heading out

Put a `<!-- no-toc -->` comment in the heading:

```md
## Changelog <!-- no-toc -->
```

The heading keeps its id and its anchor. The comment is no part of its text or its id, and a renderer that knows nothing of it, such as GitHub, shows nothing for it.

## Which headings

Every markdown heading inside the depths is listed, wherever it is written: in a block quote, a list item, an element, a `{#if}` block or a container directive.

- **[`@mdsvex/plugin-steps`](https://www.npmjs.com/package/@mdsvex/plugin-steps)** keeps its headings, so each step is listed.
- **[`@mdsvex/plugin-tabs`](https://www.npmjs.com/package/@mdsvex/plugin-tabs)** turns the headings that start a tab into labels, which have no id, so they are not listed. A heading inside a panel is. The order of the plugins does not matter.

## `Toc.svelte`

The component renders the list, nested. In a template, give it the data:

```svelte
<script>
	import Toc from '@mdsvex/plugin-toc/Toc.svelte';

	let { plugin_data, children } = $props();
</script>

<aside>
	<Toc headings={plugin_data?.toc?.headings} aria-label="On this page" />
</aside>
<main>{@render children()}</main>
```

```html
<nav aria-label="On this page" class="toc">
	<ul>
		<li>
			<a href="#install">Install</a>
			<ul>
				<li><a href="#with-pnpm">With pnpm</a></li>
			</ul>
		</li>
		<li><a href="#configure">Configure</a></li>
	</ul>
</nav>
```

| prop                     |                                                                         |
| ------------------------ | ----------------------------------------------------------------------- |
| `headings`               | the flat list, `undefined` renders nothing                              |
| `min_depth`, `max_depth` | narrow the list, such as `max_depth={2}` for a sidebar                  |
| `label`                  | a snippet, rendered in a `<p class="toc-label">` that names the `<nav>` |
| `class`                  | added to `toc`                                                          |
| anything else            | an attribute of the `<nav>`, such as `aria-label`                       |

With nothing to list it renders nothing, not an empty `<nav>`. It ships no stylesheet.

## `::toc`

On a line of its own, `::toc` renders the same component in the document:

```md
# Getting started

::toc[On this page]

## Install
```

- **The brackets are the label.** `::toc` alone has none.
- **`::toc(max_depth=2)`** and `min_depth` narrow that list. The data keeps every entry.
- **Any other arg is an attribute of the `<nav>`**, such as `::toc(class=inline)`.
- **It lists the whole document**, the headings after it as well. Each heading is added to the data as it closes, with its id, and the component reads the data from the context of the document.
- **While a document streams**, the list grows as headings arrive, in a view that gives `Node.svelte` the live data (`PluginStream` in `@mdsvex/render/stream`).
- **With nothing to list it renders nothing**, and the build warns `no_headings`.
- A `toc` export from your own directives module replaces the component. It gets the `label` snippet and the args, and reads the headings from the context, `getContext(Symbol.for('mdsvex.plugin_data')).current.toc.headings`. Type what it reads as `PluginDataContext` from `mdsvex/compile`, and the headings are `TocHeading[]`.

## Warnings

| code                 | when                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `skipped_level`      | an entry is more than one level below the heading before it, such as a `###` after a `#` |
| `heading_without_id` | a heading inside the depths has no id and is left out                                    |
| `no_headings`        | a `::toc` has nothing to list                                                            |
| `bad_depth`          | `min_depth` or `max_depth` of a `::toc` is no heading depth, the arg is ignored          |
| `not_a_leaf`         | `toc` was written as a container (`:::toc`) or inline (`:toc[]`), which list nothing     |

## With `compile`

```js
import { compile } from 'mdsvex';

const { data, warnings } = compile(source, {
	heading_ids: true,
	plugins: [toc()],
});
data?.toc?.headings;
```

`@mdsvex/parse` used on its own makes no heading ids, so there the plugin lists only the headings another plugin gave an id. A tree built from the wire format has no positions, so its entries have no `position`.
