# vscode-pfm

## 0.1.0-next.3

### Patch Changes

- Updated dependencies []:
  - @mdsvex/typescript-plugin@0.1.0-next.3

## 0.1.0-next.2

### Minor Changes

- [#948](https://github.com/pngwn/MDsveX/pull/948) [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27) Thanks [@pngwn](https://github.com/pngwn)! - The editor reads leaf and container directives written without square brackets. Args complete after `::toc(` and `:::Callout(`, and are checked and hovered as the props they become. The grammar highlights `::name` and `:::name(key=val)` when they are alone on their line, after any quote or list markers. An inline directive is still only highlighted and completed with its brackets.

- [#1139](https://github.com/pngwn/MDsveX/pull/1139) [`7dfb9c9`](https://github.com/pngwn/MDsveX/commit/7dfb9c9c7301e96e4780c03ff45b04dbee6e92c4) Thanks [@pngwn](https://github.com/pngwn)! - The editor highlights more of a document:
  - tables, with their cell bars, the `||` of header columns, the delimiter row and the `>` and `^` of merged cells
  - `~subscript~` and `^superscript^`
  - the `[ ]` and `[x]` of a task list item
  - the meta of a code fence: `src=`, `run` and `run=client`, titles, line ranges, highlighted words and props
  - link reference definitions and the links that use them
  - the `:::` that closes a container directive, and a backslash line break

  A fence with anything after its language, such as ` ```ts title="a.ts" `, now gets the highlighting of its language, which only a bare ` ```ts ` did before. `math` fences are read as LaTeX and `svx` fences as a document.

- [#1165](https://github.com/pngwn/MDsveX/pull/1165) [`965f604`](https://github.com/pngwn/MDsveX/commit/965f60422c8647ea737eea97703e8e6d73e92b5d) Thanks [@autriz](https://github.com/autriz)! - Code fences highlight many more languages, such as Ruby, PHP, Java, C, C++, C#, SQL, Dockerfile and Vue. The code in these fences is treated as its language, so toggling a comment or matching brackets works as it does in a file of that language. `md` and `markdown` fences are highlighted as Markdown, as they are in the built page, and `svx` fences as mdsvex.

- [#1135](https://github.com/pngwn/MDsveX/pull/1135) [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4) Thanks [@pngwn](https://github.com/pngwn)! - Footnote references and definitions are highlighted. A reference with no definition and a label defined twice are reported where they are written, and the rest of the document keeps working. A definition nothing refers to is a warning.

- [#1128](https://github.com/pngwn/MDsveX/pull/1128) [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738) Thanks [@pngwn](https://github.com/pngwn)! - Inline math, a code span wrapped in dollars such as ``# vscode-pfmx^2`$``, is highlighted as math. The editor compiles it as the Vite plugin does, so with Temml LaTeX that can't be rendered is reported at its place and the rest of the document keeps working.

### Patch Changes

- [#1180](https://github.com/pngwn/MDsveX/pull/1180) [`cb4782f`](https://github.com/pngwn/MDsveX/commit/cb4782f8bbb11adb02d682702e00f75f2900cda7) Thanks [@pngwn](https://github.com/pngwn)! - With an `mdsvex.config.json`, the editor finds the names a components or template module exports the way the build does, so an exported `enum` counts as a replacement in both.

- [#1215](https://github.com/pngwn/MDsveX/pull/1215) [`0c8b126`](https://github.com/pngwn/MDsveX/commit/0c8b1262437a4d22258949ad082b927c90078d98) Thanks [@pngwn](https://github.com/pngwn)! - A footnote definition may start its text on the next line, indented by four spaces, which is how Prettier formats a long one. It is the same footnote as one written with its text after the label:

  ```md
  [^1]:
      To add line breaks within a footnote,
      add a second line.
  ```

  A definition with no text, `[^1]:` with no indented line after it, fails the build with a `FootnoteError` whose code is `footnote_empty`.

- Updated dependencies [[`7dfb9c9`](https://github.com/pngwn/MDsveX/commit/7dfb9c9c7301e96e4780c03ff45b04dbee6e92c4)]:
  - @mdsvex/typescript-plugin@0.1.0-next.2

## 0.0.2-next.1

### Patch Changes

- Updated dependencies [[`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67), [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67)]:
  - @mdsvex/typescript-plugin@0.1.0-next.1

## 0.0.2-next.0

### Patch Changes

- Updated dependencies [[`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/typescript-plugin@0.1.0-next.0
