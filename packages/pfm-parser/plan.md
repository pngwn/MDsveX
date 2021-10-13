# how

Contexts:

- Document
  - Container block
    - Inline
  - Leaf block

## Container blocks

- `>` -> `BLOCKQUOTE`
- `-`, `+`, `*`, `[0-9]` -> `LIST`
- `:::` (3+) -> `GENERIC_DIRECTIVE_CONTAINER`

## Leaf blocks

- `---`, `***`, `___` (3+) -> `THEMATIC_BREAK`
- `#` (1-6) -> `ATX_HEADING`
- backticks (3) -> `FENCED_CODE`
- `::` (2) -> `GENERIC_DIRECTIVE_LEAF`
- `[` -> `LINK_REFERENCE_DEFINITIION`
- -> `PARAGRAPH`

## Inline

- backtick(1) -> `CODE`
  - backtick(1) -> END
  - -> char+=value
- ` *` -> `EMPHASIS`
  - `* ` -> END
  - -> char+=value
- ` _` -> `STRONG_EMPHASIS`
  - `_ ` -> END
  - -> char+=value
- `~*` -> `INTRAWORD_EMPHASIS`
  - `*~` -> END
  - -> char+=value
- `~_` -> `INTRAWORD_EMPHASIS`
  - `_~` -> END
- `[` -> `LINK`
  - `LINK_TEXT` (auto)
    - `]` -> END
    - -> char+=value
  - `(` -> `LINK_DATA`
    - `LINK_DESTINATION` (auto)
      - ` ` -> END +
      - -> char+=value
    - `)` -> END
    - ` ` -> `LINK_TITLE` (auto if ` ` before)
      - `)` -> END
      - -> char+=value
