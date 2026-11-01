# lib/design

The 1.0 design foundation, phase 0 of `design/SITE_PLAN.md`. `design/SCORE.md` is the authority on every visual rule; this folder is its code. `/design` renders all of it on one page.

| file | what it is |
|---|---|
| `tokens.css` | paper, ink, quiet, the voices, and `--line-<tone>` / `--name-<tone>` per construct for riso, with `[data-palette='cvd']` for Okabe and Ito. Every token is `light-dark()`; the dark values are a proposal |
| `type.css`, `fonts.ts` | `--face-display` (Playfair), `--face-text` (Source Serif 4), `--face-mono` (Berkeley Mono, then IBM Plex Mono). The Berkeley Mono `@font-face` rules; `design/FONTS.md` covers the files |
| `texture.ts`, `texture.css` | linen and riso as masks, set as custom properties by the frame; `.linen`, `.riso`, and `.rag` for the ragged edge at display sizes |
| `pfm.ts` | `pfm_tree` and `pfm_stream`, the real parser in the browser |
| `score/` | the engine: `reading.ts` (what the parser said), `layout.ts` (where it goes), `kinds.ts` (names and tones per parser kind), `Score.svelte`, and `player.svelte.ts` to play a stream |
| `penguin/` | the line bird (`Pngwn`), `Perch` to stand it at the end of a line, `BirdsEye` for held characters |
| `Frame.svelte` | the page frame: paper, faces, texture, a `nav` slot, a footer, `theme` of `auto`, `light` or `dark` |

## Score

```svelte
<Score source={'# md{"sv"}ex\n'} />
<Score {source} palette="cvd" />
<Score {source} stream={player.pos} />
```

- `source`, the PFM to read.
- `palette`, `riso` (default), `cvd`, or `voice` to colour by family (blue blocks, rose inlines, orange Svelte, green directives) as a Title does.
- `stream`, a bar index. When given, the source is fed a character at a time and that bar is drawn, with guesses, revokes and the bird's eye. Bar `i` is the reading after `i + 1` characters; the last bar is the finished document. `new Player(() => source)` plays one.
- `focus`, bindable, the lit phrase `{ start, end, kind }`, for output beside the score to light with it. `tone(focus.kind)` from `kinds.ts` gives its colour as `var(--line-<tone>)`.
- `label`, the figure's accessible name. The source is also given whole to screen readers; the drawing is hidden from them.

Sizing is custom properties on any parent: `--size`, `--track`, `--row`, `--name-size`, `--quiet-row`, `--line-gap`, `--block-gap`, `--underlay-gap`, `--inset`, `--margin`. The defaults are v12's, and below 600px the size, tracking, inset and names step down the way v12's page did.

The settled reading feeds the whole source as one chunk. Only a streamed score feeds a character at a time, which copies the tree once per character. Readings are cached by source, so a player and its score parse once.

## From Notation.svelte

`Score.svelte` is 05's `Notation.svelte` with v12's options fixed: `text: 'quiet'`, `names: 'full'`, `nest: true`, `staves: 'none'`, `join: 'none'`, `reach: 'line'`, `barlines: true`, riso at 1.5px, and v12's spacing (`--row` 1.25rem, `--line-gap` 1.4rem, `--block-gap` 2.5rem). Dropped:

- the props `text`, `names`, `staves`, `reach`, `nest`, `join` and `barlines`, and with them the stave rules, round three's left bracket, the system bar, staves to the page edge, and text that can be hidden;
- `palette` and `lettering` as colour maps (now `'riso' | 'cvd'` over tokens), and the other palettes (distinct, split, even, families) and the voice colouring that filled in for kinds a palette lacked;
- `--weight`, the 2px comparison;
- the short names (`head.`, `para.`): v12 draws full names;
- `wash`, the bindable colour read back with `getComputedStyle`; the wash is `var(--line-<tone>)` of the lit kind;
- `score` as a prop: it takes `source` and reads it itself.

Added: `stream` and the streaming marks, which were Engraving's (round three) and are redrawn for v12's bars (a guess's opening bar is hollow, a revoked one is struck across), and the bird's eye placed by the engine over the held characters instead of measured from outside.

## Where the code departs from, or fills in, SCORE.md

- **Staves.** "What a score is" still says one thin line per tree depth; v12, the pick, draws none.
- **Names.** SCORE.md says short names, the full word when a page has room; v12 draws full names everywhere, including at 375px.
- **Text lines.** SCORE.md's table gives text "quiet" (`#5d606b`); v12 draws text lines in `#8b8e99` (`--quiet-line`, 3.15:1), and so does this.
- **Kinds SCORE.md doesn't name.** Strikethrough, superscript and subscript take emphasis's tone; image and footnote reference take link's; import takes expression's; table rows and cells take the fence's; a thematic break, a definition, a footnote definition and an HTML comment take the ink (`kinds.ts`).
- **Streaming on v12's bars.** SCORE.md's marks were written for round three's dots: "its opening bar hollow" is drawn as a hollow 4px bar. A guess is raised by a third of a row and can sit on the row above's line; that reads, but is tight. At the end of a stream, ghosts stay drawn, and a tight list's paragraphs are revoked at the finish, so the finished bar shows struck paragraphs the settled reading doesn't have.
- **`local("Berkeley Mono")`** doesn't match the installed desktop cuts, whose full names carry the style (`design/FONTS.md`).
- **Dark mode.** SCORE.md has no dark palette. The proposal is in `tokens.css`; cvd's dark values are lifted the same way but not yet checked under CVD simulation.
