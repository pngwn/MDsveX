# @mdsvex/plugin-link-check

## 0.1.0-next.1

### Patch Changes

- [#1255](https://github.com/pngwn/MDsveX/pull/1255) [`0b0bc32`](https://github.com/pngwn/MDsveX/commit/0b0bc324af748e9e97bcebf7b20d4c1a2c399bda) Thanks [@pngwn](https://github.com/pngwn)! - Each package's `package.json` has an `mdsvex` field that says what the plugin is for and what it reads: `concerns`, the jobs it does, such as `layout` or `cite`; `syntax`, samples of what it reads, each compiled with the plugin when the docs build and required to change the output; `needs`, the mdsvex options it needs beside it, such as `heading_ids`; and `waits`, why a document that uses it needs `compile_async` or the Vite plugin. The docs' plugin finder reads it, and a third-party plugin can set the same field. Nothing in the plugins' code changes.

- Updated dependencies [[`66bdb8d`](https://github.com/pngwn/MDsveX/commit/66bdb8d89274417537ba021f91ec2f733bda1ee4), [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147), [`15fe6dc`](https://github.com/pngwn/MDsveX/commit/15fe6dce507dac7abee4be14ed608df90a408f1c), [`cabe59c`](https://github.com/pngwn/MDsveX/commit/cabe59ce286d42306de75c4f650ffc589758eda8)]:
  - mdsvex@1.0.0-next.4

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
