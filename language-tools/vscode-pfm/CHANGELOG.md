# vscode-pfm

## 0.1.0-next.6

### Patch Changes

- Updated dependencies []:
  - @mdsvex/migrate@0.2.0-next.5
  - @mdsvex/typescript-plugin@0.1.0-next.6

## 0.1.0-next.5

### Minor Changes

- [#1263](https://github.com/pngwn/MDsveX/pull/1263) [`8c782b6`](https://github.com/pngwn/MDsveX/commit/8c782b621f8c0b315f7dbbd80a8d584dcbaa1edd) Thanks [@pngwn](https://github.com/pngwn)! - Add **mdsvex: Migrate File from mdsvex 0.x**, which migrates the document, config or layout in the editor with `@mdsvex/migrate` in one undoable edit and lists its notes in the **mdsvex migrate** output panel. The `mdsvex.migrate.smartypants` and `mdsvex.migrate.math` settings pass the 0.x options.

### Patch Changes

- [#1260](https://github.com/pngwn/MDsveX/pull/1260) [`03b42f0`](https://github.com/pngwn/MDsveX/commit/03b42f0f11dd370df1d1927dd9499966117423a4) Thanks [@pngwn](https://github.com/pngwn)! - The extension installs from the VS Code Marketplace and Open VSX. The Marketplace has no prerelease versions, so a prerelease ships as a pre-release on an odd minor: `0.1.0-next.5` installs as `0.3.5`, and a release such as `1.0.0` keeps its version.

- Updated dependencies [[`3da2c4d`](https://github.com/pngwn/MDsveX/commit/3da2c4d2f90f709fd80371b0107283ead13d83b8), [`8c782b6`](https://github.com/pngwn/MDsveX/commit/8c782b621f8c0b315f7dbbd80a8d584dcbaa1edd)]:
  - @mdsvex/migrate@0.2.0-next.5
  - @mdsvex/typescript-plugin@0.1.0-next.5

## 0.1.0-next.4

### Patch Changes

- [#1245](https://github.com/pngwn/MDsveX/pull/1245) [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147) Thanks [@pngwn](https://github.com/pngwn)! - The editor no longer warns of an unknown language on a fence a plugin claims, such as `mermaid` with `@mdsvex/plugin-diagram`, as the build does not.

- [#1257](https://github.com/pngwn/MDsveX/pull/1257) [`64563b7`](https://github.com/pngwn/MDsveX/commit/64563b775f51b610bf1a4377256b1fbb70c5683d) Thanks [@pngwn](https://github.com/pngwn)! - The editor highlights a document as the parser reads it in more places:
  - an unclosed `*`, `_` or `~~` no longer colors the rest of the file, it ends with its paragraph, and a mark opens after punctuation, as in `(*note*)`, and runs on over the lines of a block quote
  - `**bold**` is bold, not an empty mark followed by text
  - headings, fences and comments in block quotes and list items, a fence on the line of its list marker, and a heading at any indent
  - a container directive with a label, `::::figure[The *penguin*](id=fig)`, and only the arguments the parser takes, a quoted `)` among them
  - link text holds marks and images, as in a badge `[![npm](badge.svg)](url)`
  - an import over several lines, and no import in a line of prose that starts with the word
  - `<svelte:head>` is a tag, an autolink takes any scheme, a code span closes only on a run of its own length, and a superscript no longer runs over a code span
  - an unclosed tag ends at a blank line

- Updated dependencies []:
  - @mdsvex/typescript-plugin@0.1.0-next.4

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
