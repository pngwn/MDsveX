# @mdsvex/plugin-citations

Citations for [mdsvex](https://mdsvex.pngwn.io): `:cite[key]` cites an entry of a [CSL JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html) bibliography, and `::bibliography` lists every entry the document cites. Each citation links to its entry and each entry links back.

```bash
pnpm add --save-dev @mdsvex/plugin-citations@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { citations } from '@mdsvex/plugin-citations';

export default {
	plugins: [mdsvex({ plugins: [citations()] })],
};
```

```md
---
bibliography: ./refs.json
---

The engine could do more than count :cite[lovelace1843], as was later
proved :cite[turing1936, lovelace1843].

::bibliography[References]
```

```json
[
	{
		"id": "lovelace1843",
		"type": "article-journal",
		"title": "Notes on the Analytical Engine",
		"author": [{ "family": "Lovelace", "given": "Ada" }],
		"issued": { "date-parts": [[1843]] },
		"container-title": "Scientific Memoirs",
		"volume": 3,
		"page": "666-731"
	},
	{
		"id": "turing1936",
		"title": "On Computable Numbers",
		"author": [{ "family": "Turing", "given": "Alan" }],
		"issued": { "date-parts": [[1936]] },
		"DOI": "10.1112/plms/s2-42.1.230"
	}
]
```

The paragraph renders as `The engine could do more than count [1], as was later proved [2, 1].`, each number a link to its entry, and the list as:

```html
<section
	role="doc-bibliography"
	aria-labelledby="s1-label"
	class="bibliography"
>
	<p class="bibliography-label" id="s1-label">References</p>
	<ol>
		<li id="bib-lovelace1843">
			Ada Lovelace. <cite>Notes on the Analytical Engine.</cite> Scientific
			Memoirs 3, 666-731. 1843.
			<a href="#cite-1" role="doc-backlink" aria-label="Back to citation 1"
				>↩︎</a
			>
			<a href="#cite-3" role="doc-backlink" aria-label="Back to citation 3"
				>↩︎</a
			>
		</li>
		<li id="bib-turing1936">
			Alan Turing. <cite>On Computable Numbers.</cite> 1936.
			<a href="https://doi.org/10.1112/plms/s2-42.1.230"
				>https://doi.org/10.1112/plms/s2-42.1.230</a
			>
			<a href="#cite-2" role="doc-backlink" aria-label="Back to citation 2"
				>↩︎</a
			>
		</li>
	</ol>
</section>
```

It needs Svelte 5.20 or later.

## Options

```ts
citations({
	bibliography: string, // none
	style: 'numeric' | 'author-date', // 'numeric'
});
```

An option of the wrong shape throws a `CitationsError` with `code` set to `'option'` when the plugin is made.

## The bibliography file

- **The frontmatter names it**, as `bibliography`, relative to the document or absolute.
- **The `bibliography` option** is the file of every document whose frontmatter names none, absolute or relative to the working directory.
- **It is read once** for every document the compiler takes, the dev server or a build, and read again when it changes. A document that cites it compiles again then, and so does its `?data` import.
- **It is CSL JSON**, an array of entries, each with an `id`. What is read of an entry: `author` (or `editor`), `issued`, `title`, `container-title`, `volume`, `issue`, `page`, `publisher`, `DOI` and `URL`. Other fields are left alone.

A typed error fails the compile, with `code` set to:

- **`'no_bibliography'`**, for a document that cites and names no file, or a compile that was given no way to read one.
- **`'bibliography'`**, for a file that can not be read, is not CSL JSON, has an entry with no `id` or two with one `id`, and for a frontmatter key that is no path.

### Why not BibTeX

BibTeX is not read, and a `.bib` file fails with a message that says how to export CSL JSON. A BibTeX entry is LaTeX: `{\"o}`, `\&`, `--` and braces that protect case are part of the value, and reading them right is most of the work of a BibTeX parser, which is a dependency much larger than this plugin. A small subset that skipped LaTeX would show those characters in pages. CSL JSON is what citation processors read, and every reference manager writes it: Zotero and JabRef export it, Better BibTeX keeps it in sync, and pandoc converts a `.bib` file:

```bash
pandoc refs.bib -t csljson -o refs.json
```

## Citing

- **`:cite[key]`** cites one entry and **`:cite[a, b]`** several, by `id`. Spaces around a key do not count.
- **The brackets are required**, as for every inline directive.
- **An unknown key** is the warning `unknown_key` at the citation, which shows the key as written, with no link and no number.
- **`:cite[]`** is the warning `no_key` and cites nothing. Cite as a leaf or a container directive is the warning `not_inline`.

## Styles

|            | `numeric`                                                                            | `author-date`                                                                         |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| a citation | `[1]`, `[1, 2]`                                                                      | `(Lovelace 1843)`, `(Turing 1936; Lovelace 1843)`                                     |
| the list   | an `<ol>`, in the order entries are first cited                                      | a `<ul>`, by the first author's family name, then year, then title                    |
| an entry   | `Ada Lovelace. Notes on the Analytical Engine. Scientific Memoirs 3, 666-731. 1843.` | `Ada Lovelace (1843). Notes on the Analytical Engine. Scientific Memoirs 3, 666-731.` |

- **Names**: the citation of an entry with one or two authors names both, three or more is the first and `et al.`. An entry with no author or editor is cited by its title. The year is `n.d.` when the entry has none.
- **The title is a `<cite>` element**, and a `DOI` becomes a link to `https://doi.org/`, ahead of a `URL`.

This is kept small. A full CSL processor such as [citeproc-js](https://github.com/Juris-M/citeproc-js) is what you need for a named style (APA, Chicago, IEEE) or a CSL style file, locators such as page numbers, telling two works of one author in one year apart (`2020a`, `2020b`), name particles and initials by the rules of a style, and languages other than English.

## The list

`::bibliography` renders the list where it is written, and nothing when the document cites nothing. Its brackets are the label of the list, and without them the list is named `References` for screen readers. A second `::bibliography` in a document is the warning `more_than_one` and lists nothing. As a container or inline it is the warning `not_a_leaf`.

The list has every entry the document cites, the citations after it too. The component reads the data of the document from the context, `getContext(Symbol.for('mdsvex.plugin_data')).current.citations`, and once the document is whole it is also handed that data as JSON in its `data` arg. A `data` prop, an object or JSON, wins over the context, so a template that passes one renders what it passes.

A `bibliography` export from your own directives module replaces the component. It gets the `label` snippet, `style`, the args, and `data` once the document is whole, and reads the context for the list while the document streams.

## The data

`plugin_data.citations` has each key of each citation, in the order they are written, and the entry of each key the file has, under `entry:` and the key:

```js
plugin_data.citations;
// {
//   cited: ['lovelace1843', 'turing1936', 'lovelace1843'],
//   'entry:lovelace1843': { key, short: 'Lovelace', authors: 'Ada Lovelace', year: '1843', title, source },
//   'entry:turing1936': { key, short: 'Turing', authors: 'Alan Turing', year: '1936', title, url },
// }
```

It reaches a page the three ways all [plugin data](https://mdsvex.pngwn.io/docs#plugin-data) does: the `plugin_data` export, the `plugin_data` prop of a template, and a `?data` import. So a template can render the list itself:

```svelte
<script>
	import Bibliography from '@mdsvex/plugin-citations/Bibliography.svelte';
	let { plugin_data, children } = $props();
</script>

<article>{@render children()}</article>
<Bibliography data={plugin_data?.citations} style="author-date" />
```

`bibliography_of(data, style)` gives the list as data, each entry with its `id`, its `label` and `cited_by`, the ids of its citations, and `entry_parts(entry, style)` the pieces of its text, for a list of your own.

## With `compile_async`

The file is read while the document compiles, so a document that cites needs a compile that waits: the Vite plugin waits, and so does `compile_async`, which needs a `read` option. `compile` throws a `PluginAsyncError`.

```js
import { readFile } from 'node:fs/promises';
import { compile_async } from 'mdsvex';

const plugins = [citations()];
const { code, data } = await compile_async(source, {
	filename: '/site/posts/post.svx',
	plugins,
	read: (path) => readFile(path, 'utf8'),
});
```

Pass the same `plugins` array to each call, and the file is read once for all of them.

## While a document streams

Each citation is written as it closes, and its entry is looked up as soon as the file has loaded, so a view that streams the document can show citations filling in. The list grows with them: each entry is added as its lookup lands, in a view that gives `Node.svelte` the live data (`PluginStream` in `@mdsvex/render/stream`). The numbers and ids of every citation and the list are settled once the document is whole, and a stream ends with the page a compile renders.

```js
import { citations } from '@mdsvex/plugin-citations';
import { PluginStream } from '@mdsvex/render/stream';

const bundle = citations({ bibliography: '/refs.json' });
const stream = new PluginStream({
	plugins: [{ name: bundle.name, ...bundle.parse }],
	directive_handlers: [{ name: bundle.name, directives: bundle.directives }],
	document: {
		filename: '/post.svx',
		read: (path) => fetch(path).then((r) => r.text()),
	},
});
```
