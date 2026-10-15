---
'@mdsvex/plugin-citations': minor
---

New package: citations. `:cite[key]` cites an entry of a CSL JSON file the frontmatter names, and `::bibliography` lists every entry the document cites. Each citation links to its entry and each entry links back to its citations.

```js
import { citations } from '@mdsvex/plugin-citations';

mdsvex({ plugins: [citations({ style: 'author-date' })] });
```

```md
---
bibliography: ./refs.json
---

As shown before :cite[lovelace1843, turing1936].

::bibliography[References]
```

- `style` is `numeric`, `[1]` and a list in the order of first citation, or `author-date`, `(Lovelace 1843)` and a list by author.
- The file is read once for every document and read again when it changes. An unknown key is a warning and shows as written.
- The citations and entries are plugin data, `plugin_data.citations`, so a template can render the list with the `Bibliography` component.
- Reading the file waits, so a document that cites needs the Vite plugin or `compile_async`.
