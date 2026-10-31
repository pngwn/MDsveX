# @mdsvex/plugin-link-check

## 0.1.0-next.0

### Minor Changes

- [#1227](https://github.com/pngwn/MDsveX/pull/1227) [`f612da1`](https://github.com/pngwn/MDsveX/commit/f612da187dd383c8d1d4d48dc5427156a8760310) Thanks [@pngwn](https://github.com/pngwn)! - New package: link checking. It warns at every link that goes nowhere, a `#fragment` no element of the page has, and a link to another document, by file or by route, that does not exist or has no such id.

  ```js
  import { link_check } from '@mdsvex/plugin-link-check';

  mdsvex({
  	heading_ids: true,
  	plugins: [link_check({ routes: 'src/routes' })],
  });
  ```

  ```md
  See [the setup](#setup) and [the guide](../guide/+page.md#usage).
  ```

  ```
  #setup links to no element of this document, none has the id "setup"
  ../guide/+page.md#usage links to src/routes/guide/+page.md, which has no element with the id "usage"
  ```

  Linked documents are read once for every document a compiler takes and become dependencies of the documents that link to them, so a change to one checks those again in the dev server. `strict: true` fails the compile with a `LinkCheckError` that lists each broken link, for a build. Checking other documents reads them, so it takes the Vite plugin or `compile_async` with a `read` option, and `documents: false` checks links within a page alone under `compile`.

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
