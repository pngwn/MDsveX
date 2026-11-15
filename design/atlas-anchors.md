# Atlas anchors

Every entry on `/atlas` has a stable anchor, `/atlas#<anchor>`. They are the `id`s in `packages/site/src/lib/design/atlas/constructs.ts` and never change once shipped, so the PFM Reference (`routes/docs/reference/**`) can link each construct to its entry. The parser kinds column says which tree nodes each entry draws, for matching a Reference section to its entry.

## Block

| construct | link | parser kinds |
|---|---|---|
| Heading | `/atlas#heading` | `heading` |
| Paragraph | `/atlas#paragraph` | `paragraph` |
| Block quote | `/atlas#block-quote` | `block_quote` |
| List | `/atlas#list` | `list`, `list_item` |
| Task item | `/atlas#task-item` | `list_item` |
| Code fence | `/atlas#code-fence` | `code_fence` |
| Math | `/atlas#math` | `code_fence`, `code_span` |
| Table | `/atlas#table` | `table`, `table_header`, `table_row`, `table_cell` |
| Thematic break | `/atlas#thematic-break` | `thematic_break` |
| Footnote | `/atlas#footnote` | `footnote_reference`, `footnote_definition` |
| Comment | `/atlas#comment` | `html_comment` |

## Inline

| construct | link | parser kinds |
|---|---|---|
| Text and escapes | `/atlas#text` | `text` |
| Emphasis | `/atlas#emphasis` | `emphasis` |
| Strong | `/atlas#strong` | `strong_emphasis` |
| Strikethrough | `/atlas#strikethrough` | `strikethrough` |
| Superscript | `/atlas#superscript` | `superscript` |
| Subscript | `/atlas#subscript` | `subscript` |
| Code span | `/atlas#code-span` | `code_span` |
| Link | `/atlas#link` | `link` |
| Reference link | `/atlas#reference-link` | `link`, `definition` |
| Image | `/atlas#image` | `image` |
| Autolink | `/atlas#autolink` | `link` |
| Hard break | `/atlas#hard-break` | `hard_break` |

## Svelte

| construct | link | parser kinds |
|---|---|---|
| Expression | `/atlas#expression` | `mustache` |
| Element | `/atlas#element` | `html` |
| Component | `/atlas#component` | `html` |
| Logic block | `/atlas#logic-block` | `svelte_block`, `svelte_branch` |
| Special tag | `/atlas#special-tag` | `svelte_tag` |
| Script and style | `/atlas#script` | `html` |

## Directive

| construct | link | parser kinds |
|---|---|---|
| Inline directive | `/atlas#inline-directive` | `directive_inline` |
| Leaf directive | `/atlas#leaf-directive` | `directive_leaf`, `directive_label` |
| Container directive | `/atlas#container-directive` | `directive_container`, `directive_label` |

## Document

| construct | link | parser kinds |
|---|---|---|
| Frontmatter | `/atlas#frontmatter` | `frontmatter` |
| Import | `/atlas#import` | `import_statement` |
| Live code | `/atlas#live-code` | `code_fence` |
| Template | `/atlas#template` | `frontmatter` |

## Notes for the Reference links

- Inline math and display math share one entry, `#math`. Footnote references and definitions share `#footnote`. Link reference definitions are under `#reference-link`.
- A task list item is its own entry, `#task-item`, apart from `#list`.
- `<script>`, `<script module>` and `<style>` are `#script`. HTML elements are `#element` and components `#component`.
- Escapes, character references and soft breaks are `#text`.
