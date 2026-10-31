# @mdsvex/plugin-figures

## 0.1.0-next.0

### Minor Changes

- [#1228](https://github.com/pngwn/MDsveX/pull/1228) [`0fc60ae`](https://github.com/pngwn/MDsveX/commit/0fc60aeb4629b680fe99070c04c9e331118de70f) Thanks [@pngwn](https://github.com/pngwn)! - New package: a `:::figure` directive. What is written inside it, an image, a code block, a table or a diagram, is put in a `<figure>` with the bracket text as its caption, and an optional `id` stays on the element so a link can reach it. A numbering plugin can number it through plugin data.

  ```md
  :::figure[Sales by month](id=fig:sales)
  ![A bar chart of sales by month](./chart.png)
  :::
  ```

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
