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
| `Frame.svelte` | the page frame: paper, faces, texture, a `nav` slot, a footer, `theme` of `auto`, `light` or `dark`. The root layout puts every page but the playground in it |
| `base.css`, `code.css`, `prose.css` | the page under the frame; code in the mono with riso, highlighted in the score's colours; `.prose`, the docs' long reading type |
| `theme.svelte.ts` | the frame's theme in context, `use_theme()` to read or set it; `?theme=dark` on any page sets it |

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

A docs page doesn't import it. It flags a fence, and `packages/site/build/examples.js` makes the fence an `example` directive at build time (`src/lib/docs/Example.svelte`):

````md
```svx score       the score, the source a click away
```svx result      you write beside you get, the score a click away
```svx result score   both, opening on the score
````

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

Phase 2 brought SCORE.md in line with v12: no staves, full names, text lines in `#8b8e99`, the kinds it didn't name, the Berkeley Mono `local()` names, and the streaming fixes below. What is left:

- **Dark mode** is a proposal (SCORE.md "Dark mode, a proposal"); cvd's dark values are not yet checked under CVD simulation.
- **Streaming on v12's bars.** A guess's row grows by its raise, so a raised name keeps its clearance from the row above. A list item's paragraph, revoked when a tight list closes, leaves no ghost (`reading.ts`); every other revoked guess stays struck to the end.
