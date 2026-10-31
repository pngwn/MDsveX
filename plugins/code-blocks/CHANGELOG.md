# @mdsvex/plugin-code-blocks

## 0.1.0-next.0

### Minor Changes

- [#1230](https://github.com/pngwn/MDsveX/pull/1230) [`d5d73f3`](https://github.com/pngwn/MDsveX/commit/d5d73f3561082fd862dfd4c49cf70c5be4b4c8f3) Thanks [@pngwn](https://github.com/pngwn)! - New package: `code_blocks()` renders each code block with a copy button, with the title of the fence above it and its caption below. The button is named after the title, the result is announced to screen readers, and `nocopy` in the fence meta leaves the button out.

  ```js
  import { code_blocks } from '@mdsvex/plugin-code-blocks';

  mdsvex({ plugins: [code_blocks()] });
  ```

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
