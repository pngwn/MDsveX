# @mdsvex/tree-sitter

A [tree-sitter](https://tree-sitter.github.io/) grammar for mdsvex documents, Penguin-Flavoured Markdown as `PFM.md` at the repo root describes it. It parses `.svx` and `.pfm` files for editors that highlight with tree-sitter.

## Layout

- `grammar.js`: the rules, blocks and inlines in one grammar
- `src/scanner.c`: the external scanner
- `src/parser.c`, `src/grammar.json`, `src/node-types.json`, `src/tree_sitter/`: written by `tree-sitter generate`, committed so consumers need no CLI
- `queries/highlights.scm`, `queries/injections.scm`: highlighting and embedded languages
- `test/corpus/`: trees for each construct, `test/highlight/`: highlight assertions

## Working on it

```bash
pnpm --filter @mdsvex/tree-sitter generate
```

```bash
pnpm --filter @mdsvex/tree-sitter test
```

```bash
pnpm --filter @mdsvex/tree-sitter parse path/to/file.svx
```

Run `generate` after any change to `grammar.js`, and commit the files it writes. `test` compiles the parser with the system C compiler. `tree-sitter fuzz` from this directory edits the corpus inputs at random and checks that incremental parses match fresh ones.

## How it parses

tree-sitter-markdown splits blocks and inlines into two grammars because CommonMark needs to know a paragraph's whole extent before it reads its inlines. PFM drops what forces that split (lazy block quotes, setext headings, indented code, `*` and `_` meaning the same thing), so one grammar holds both, and one tree covers a document.

The scanner owns what a context free grammar cannot say:

- **Line structure.** Every line starts with the prefixes of its open containers: a `>` for a block quote, an indent for a list item or a footnote. The scanner matches them as `block_continuation` (visible for quotes) or a hidden indent, and closes a container whose prefix is missing. At a line ending inside a paragraph it reads the next line to decide whether the paragraph goes on (`_soft_line_ending`) or the block ends (`_line_ending`).
- **Block starts.** Headings, fences, lists, tables, directives, Svelte block lines and html lines are told apart by reading the line. A line that starts no block is left to the inline rules by a zero width token, since the lexer cannot move back.
- **Delimiters.** `_`, `*`, `~~`, `~` and `^` open only when a closer follows within the paragraph. That closer must not sit inside brackets opened later, and no opener of another mark may still be open before it. Flanking needs the char before a delimiter, so plain text comes from the scanner too.
- **Brackets.** `[` opens a link only when its `]` is followed by a destination that closes, or by a label defined above it. The scanner keeps a hash of each definition's label, so `[text][ref]` is a link only after `[ref]: url`, as PFM requires.
- **Raw content.** Fences, code spans, inline math, frontmatter, imports, `<script>`, `<style>`, `<textarea>` and `<pre>` content, and the inside of `{...}` with its strings and template literals.

Container directives nest by colon count, so `:::` closes only a directive opened with three colons. Svelte blocks (`{#if}` ... `{:else}` ... `{/if}`) on lines of their own hold blocks; on a line with other content they are inline tags.

## Injections

| node                                 | language                                         |
| ------------------------------------ | ------------------------------------------------ |
| `frontmatter_content`                | yaml                                             |
| `import_statement`, `expression`     | javascript                                       |
| `raw_text` of `<script>` / `<style>` | javascript, or typescript with `lang="ts"` / css |
| `code_fence_content`                 | the fence's language, `math` as latex            |
| `math_content`                       | latex                                            |

## Where it differs from `@mdsvex/parse`

Compared kind by kind against `@mdsvex/parse` over `packages/parse/test/fixtures/pfm`, 855 of 872 trees agree, and every `.svx`, `.pfm` and `.md` file in the repo parses with no error node. The trees that differ:

- Pathological emphasis, such as `foo*_*_*_bar*_*_*_*_*baz`, nests differently.
- A thematic break indented four or more columns still ends a paragraph here.
- A few CommonMark link corners: a link holding a bracketed link, emphasis whose closer sits in a link destination (`[foo *bar](baz*)`), a destination and title split over lines with padding.
- Text after the close tag of a raw element on the same line (`</script>1. item`) stays in the html line rather than starting a block.
- A paragraph of only tags, or only images with `unwrap_images`, is still a `paragraph`, and a tight list item's text is still in one. Those are rendering choices, not syntax.

Past 100 nested containers the scanner stops tracking depth, and the tree degrades from there.
