---
'@mdsvex/plugin-page-data': minor
---

`last_modified` gives the date a document last changed, as `plugin_data.page.last_modified`, an ISO string. It is off by default. `'git'` is the date of the last commit that touched the document, read from one `git log` of the repository for every document. `'fs'` is the modification time of the file. A function is given the path of the document and returns a `Date`, a string or nothing:

```js
page_data({ last_modified: 'git' });
page_data({ last_modified: async (filename) => (await cms.page(filename))?.updated_at });
```

Finding the date waits, so the Vite plugin and `compile_async` take a document with it, and `compile` throws a `PluginAsyncError`. `'git'` and `'fs'` need Node and throw a `PageDataError` with `code: 'node'` when the plugin is made anywhere else. In a shallow clone a file whose last commit is before the cut has no date and the warning `shallow_history`.

The plugin now reads the document in a `document` hook. The data is the same, and a document of blank lines alone still has none.
