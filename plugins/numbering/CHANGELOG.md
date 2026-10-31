# @mdsvex/plugin-numbering

## 0.1.0-next.0

### Minor Changes

- [#1233](https://github.com/pngwn/MDsveX/pull/1233) [`8622e80`](https://github.com/pngwn/MDsveX/commit/8622e8059df5b342171e8e61c8dd843c34786849) Thanks [@pngwn](https://github.com/pngwn)! - New package: numbering and cross-references. Figures, tables, equations and sections are numbered, and `:ref[id]` reads as the number and links to it. The prefix of the id says what it is.

  ````md
  :::table[What each plan costs](id=tbl:plans)
  | plan | price |
  | --- | --- |
  | free | 0 |
  :::

  ```math id=eq:energy
  E = mc^2
  ```

  The plans are in :ref[tbl:plans], :ref[eq:energy] gives the energy, and :ref[fig:a, fig:b] reads "Figures 1 and 2".
  :ref[fig:a](prefix=Chart) reads "Chart 1" and :ref[fig:a](prefix=false) reads "1".
  ````

  The words are the `prefixes` option. A figure is the `:::figure[Caption](id=fig:x)` of `@mdsvex/plugin-figures`, a section is a heading referenced as `sec:` and its id, and `number_sections: true` puts the number in front of each heading. In a streaming view each number shows as soon as its target arrives, and a reference to a target further down reads "Figure ?" until then.

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
