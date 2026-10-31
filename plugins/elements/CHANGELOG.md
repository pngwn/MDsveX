# @mdsvex/plugin-elements

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
