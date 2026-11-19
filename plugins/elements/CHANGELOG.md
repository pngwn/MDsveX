# @mdsvex/plugin-elements

## 0.1.0-next.1

### Minor Changes

- [#1253](https://github.com/pngwn/MDsveX/pull/1253) [`5014392`](https://github.com/pngwn/MDsveX/commit/501439265f43b62313eecc062dfe884fc9f05172) Thanks [@pngwn](https://github.com/pngwn)! - Steps, the elements (`details`, `accordion`, `kbd`, `ruby`, `badge`, `mark`, `ins`, `abbr`) and the video embeds render at build time. A page gets their HTML and the plugin's stylesheet, and never loads or hydrates their components. Content inside them stays live. The components are still exported under the same paths, such as `@mdsvex/plugin-steps/Steps.svelte`, to wrap one in your own.

  An embed with an id no longer passes its label to the component, since the label is already the title of the frame. With no id, the label still shows in place of the frame.

### Patch Changes

- [#1255](https://github.com/pngwn/MDsveX/pull/1255) [`0b0bc32`](https://github.com/pngwn/MDsveX/commit/0b0bc324af748e9e97bcebf7b20d4c1a2c399bda) Thanks [@pngwn](https://github.com/pngwn)! - Each package's `package.json` has an `mdsvex` field that says what the plugin is for and what it reads: `concerns`, the jobs it does, such as `layout` or `cite`; `syntax`, samples of what it reads, each compiled with the plugin when the docs build and required to change the output; `needs`, the mdsvex options it needs beside it, such as `heading_ids`; and `waits`, why a document that uses it needs `compile_async` or the Vite plugin. The docs' plugin finder reads it, and a third-party plugin can set the same field. Nothing in the plugins' code changes.

- Updated dependencies [[`66bdb8d`](https://github.com/pngwn/MDsveX/commit/66bdb8d89274417537ba021f91ec2f733bda1ee4), [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147), [`15fe6dc`](https://github.com/pngwn/MDsveX/commit/15fe6dce507dac7abee4be14ed608df90a408f1c), [`cabe59c`](https://github.com/pngwn/MDsveX/commit/cabe59ce286d42306de75c4f650ffc589758eda8)]:
  - mdsvex@1.0.0-next.4

## 0.1.0-next.0

### Minor Changes

- [#1237](https://github.com/pngwn/MDsveX/pull/1237) [`bd7f9dd`](https://github.com/pngwn/MDsveX/commit/bd7f9dd49467d24250b5bc581e8020c5ac6e0431) Thanks [@pngwn](https://github.com/pngwn)! - Three inline directives over native elements: `:mark[text]` renders a `<mark>`, `:ins[text]` an `<ins>` that takes its `datetime` and `cite` as args, and `:abbr[HTML](title="HyperText Markup Language")` an `<abbr>`. An `:abbr` with no `title` warns `abbr_without_title`. A mark is a tint behind the text, set by `--mark-color`, so it reads on a dark page.

- [#1226](https://github.com/pngwn/MDsveX/pull/1226) [`16a0b29`](https://github.com/pngwn/MDsveX/commit/16a0b294f788ec2b43938cd1a02fb97e92986c73) Thanks [@pngwn](https://github.com/pngwn)! - New package: directives over plain HTML elements. `:::details[Summary]`, `:::accordion` (each heading inside it is an item, `(name=...)` keeps one open at a time), `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)` and `:badge[new](tone=tip)`. None loads a script, and each works without JavaScript.

  ```js
  import { elements } from '@mdsvex/plugin-elements';

  mdsvex({ plugins: [elements()] });
  ```

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
