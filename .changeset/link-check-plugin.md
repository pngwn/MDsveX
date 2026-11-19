---
'@mdsvex/plugin-link-check': minor
---

New package: link checking. It warns at every link that goes nowhere, a `#fragment` no element of the page has, and a link to another document, by file or by route, that does not exist or has no such id.

```js
import { link_check } from '@mdsvex/plugin-link-check';

mdsvex({ heading_ids: true, plugins: [link_check({ routes: 'src/routes' })] });
```

```md
See [the setup](#setup) and [the guide](../guide/+page.md#usage).
```

```
#setup links to no element of this document, none has the id "setup"
../guide/+page.md#usage links to src/routes/guide/+page.md, which has no element with the id "usage"
```

Linked documents are read once for every document a compiler takes and become dependencies of the documents that link to them, so a change to one checks those again in the dev server. `strict: true` fails the compile with a `LinkCheckError` that lists each broken link, for a build. Checking other documents reads them, so it takes the Vite plugin or `compile_async` with a `read` option, and `documents: false` checks links within a page alone under `compile`.
