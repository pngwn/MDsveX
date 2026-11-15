# @mdsvex/plugin-diagram

## 0.1.0-next.1

### Minor Changes

- [#1245](https://github.com/pngwn/MDsveX/pull/1245) [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147) Thanks [@pngwn](https://github.com/pngwn)! - `diagram()` claims the `mermaid` language, so the build no longer warns once per file that there is no highlighter for it, with either engine. The highlighter never sees a mermaid fence, so the diagram's source renders as a plain `<pre><code class="language-mermaid">`, as it does with `highlight: false`, rather than an empty twinkleplop block.

### Patch Changes

- [#1255](https://github.com/pngwn/MDsveX/pull/1255) [`0b0bc32`](https://github.com/pngwn/MDsveX/commit/0b0bc324af748e9e97bcebf7b20d4c1a2c399bda) Thanks [@pngwn](https://github.com/pngwn)! - Each package's `package.json` has an `mdsvex` field that says what the plugin is for and what it reads: `concerns`, the jobs it does, such as `layout` or `cite`; `syntax`, samples of what it reads, each compiled with the plugin when the docs build and required to change the output; `needs`, the mdsvex options it needs beside it, such as `heading_ids`; and `waits`, why a document that uses it needs `compile_async` or the Vite plugin. The docs' plugin finder reads it, and a third-party plugin can set the same field. Nothing in the plugins' code changes.

- Updated dependencies [[`66bdb8d`](https://github.com/pngwn/MDsveX/commit/66bdb8d89274417537ba021f91ec2f733bda1ee4), [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147), [`15fe6dc`](https://github.com/pngwn/MDsveX/commit/15fe6dce507dac7abee4be14ed608df90a408f1c), [`cabe59c`](https://github.com/pngwn/MDsveX/commit/cabe59ce286d42306de75c4f650ffc589758eda8)]:
  - mdsvex@1.0.0-next.4

## 0.1.0-next.0

### Minor Changes

- [#1231](https://github.com/pngwn/MDsveX/pull/1231) [`2041da7`](https://github.com/pngwn/MDsveX/commit/2041da73b57173a31911e77c17c421ab573d29b6) Thanks [@pngwn](https://github.com/pngwn)! - New package: `diagram()` draws each `mermaid` fence as a diagram. With `pele` installed it is drawn at build time and the page ships the SVG, themed by CSS variables for light and dark, with no script. With `mermaid` installed it is drawn in the browser. Both are optional peer dependencies, `engine` picks one, and the source of each diagram stays on the page beside it.

  ```js
  import { diagram } from '@mdsvex/plugin-diagram';

  mdsvex({ plugins: [diagram()] });
  ```

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
