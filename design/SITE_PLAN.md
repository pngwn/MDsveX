# Bringing it together: the 1.0 site

2026-11-01. This plan joins two bodies of work into one site:
- **the identity:** `design/SCORE.md` (`design/experiments/SCORE.md` on the archive) and `design/experiments/TYPE.md`, with the experiments at `/experiments`
- **the docs plan:** `design/docs/PLAN.md` and its 12 decisions

Both are saved on the local branch `p/mdsvex-1.0-design`.

## Where things stand

- **The design is decided, but it lives in seven experiment folders.** About 25,000 lines across `lib/experiments/*`, written to compare ideas, not to ship.
  - The chosen pieces are 05's `Notation.svelte` (v12), 01's Title (v7) and its texture plates, 02's atlas layout, and the penguin's `Pngwn.svelte`, `Perch.svelte` and `BirdsEye.svelte`.
  - They overlap. The Title and the atlas each draw their own score and have not taken v12's nesting, bars, palette or name placement. `print.ts` exists twice, in 01 and 05.
- **The docs plan says the docs stay one page until step one.** That step is the split into `.svx` routes compiled by the Vite plugin, with prose unchanged and nav generated from the files. No new writing comes before it.
- **The site itself is still the old one:** `global.css`, `Nav`, the old favicons and penguin GIFs, `{@html}` docs, and `adapter-auto`.

## The approach

**Don't ship the experiments; extract from them.** Start a new branch from `next` and bring over only what was chosen, rebuilt as a small set of shared components. `p/mdsvex-1.0-design` stays as the archive and reference. Every phase lands as a PR, with stacked PRs where one phase needs another.

One score engine is the heart of it. The docs, the Title and the atlas all draw the score, so they must draw it with one component. Otherwise every later decision, like a colour or a name position, has to be made three times.

## Phases

### Phase 0, foundation (one session, sequential)

Builds `lib/design/` on a new branch from `next`:

| piece | from | notes |
|---|---|---|
| tokens: paper, ink, quiet, the riso palette (line and name tones per kind), cvd as an alternative | SCORE.md, 05 `studies.ts` | CSS custom properties, one file |
| type: Playfair, Source Serif 4, Berkeley Mono self-hosted with IBM Plex Mono fallback | SCORE.md type section, `type/faces.ts` | Berkeley Mono files stay out of git and are added at deploy; dev keeps `local()` first |
| texture: linen on Playfair, riso on the mono, plain body, as masks | 01 and 05 `print.ts` | one copy |
| `Score.svelte`, the one engine: nested, no staves, bars, names hugging their line, dim-others hover, a `source` prop, streaming marks behind a prop | 05 `Notation.svelte`, `engrave.ts`, `score.ts`, `lib/experiments/pfm.ts` | the Title and atlas are rebuilt on it in phase 2 |
| penguins: the line bird (17px, 1px, facing left) with `Perch`, and the bird's eye | penguin `pngwn.ts`, `Pngwn.svelte`, `Perch.svelte`, `BirdsEye.svelte` | one per page |
| a layout shell: page frame, nav slot, footer, light and dark | new | replaces `global.css` and `Nav` |

Done when one plain page renders a score from a source string in the decided style, with texture, type and penguin, at 1440px and 375px.

### Phase 1, docs split and dogfood (one session, alongside phase 0)

This is the docs plan's step one, unchanged:
- `_docs.svtext` becomes `.svx` routes under Learn, Guides, Plugins, Reference and Internals
- compiled by the real Vite plugin with the first-party plugins on
- nav built from `?metadata`
- the small fixes the plan lists

It touches `routes/docs/**`, `vite.config.js` and the Svelte config, and phase 0 touches `lib/design/**`. So the two can run at once if phase 1 leaves styling alone. Plain pages are fine here.

Done when every current section has a route, the build fails on a broken example or link, and old `/docs#anchor` links land on their new pages.

### Phase 2, the design meets the docs (after 0 and 1)

- **A docs page template:** Source Serif 4 body, Playfair headings, riso mono code, the layout shell, the perched penguin on the last score of a page.
- **`<Score>` usable inside `.svx`.** A docs page can drop a score over any example. This is the dogfooding payoff: a page about a construct shows the parser's reading of its own example.
- **"You write / you get"** pairs generated at build time, with a score on request.
- **The home page is the Title** (01 v7), rebuilt on `Score.svelte`, with paper dots, linen, riso and the heading notation.
- **The construct atlas is a page of its own,** beside the docs: a specimen book of every construct with its score, output and notes, laid out from 02's round-one atlas and drawn with `Score.svelte`. The PFM Reference stays a plain spec and links each construct to its atlas entry.
- New favicons from the line bird, replacing the old GIFs and PNGs.

### Phase 3, content and code (in parallel)

Once phase 2's template exists, these are independent. Each can be its own session and PR:
- **Learn:** quick start, the PFM tour with embeds, Build a blog
- **Plugins:** catalogue, authoring split out, Your first plugin, Testing, Packaging
- **Internals:** the six explanation pages, then API pages
- **Playground:** plugins on demand in the worker, embeds that start on interaction, the stream lab with the bird's eye

The code tasks from the docs plan are PRs on `next`. They don't wait on phase 2. Each one unblocks a guide:

| code task | unblocks |
|---|---|
| the `@mdsvex/parse` and `@mdsvex/render` public surface, `./internal` and READMEs | streaming guide, Internals API pages |
| `npx @mdsvex/migrate` | migration guide |
| `BundleDirective.static` | plugin API reference |
| VS Code extension on the Marketplace and Open VSX | VS Code page |
| plugins on demand in the REPL worker | "open in playground" on plugin pages |

## Order and parallelism

```
phase 0 ─┐
         ├─► phase 2 ─► phase 3 (Learn · Plugins · Internals · Playground)
phase 1 ─┘
code tasks ───────────────► (each unblocks one guide)
```

At most three writing sessions at once in phases 0 and 1: phase 0, phase 1, and one code task. In phase 3, one session per section. No two sessions write the same files; the docs sections each own their own route folder.

## Decisions

pngwn's answers, 2026-11-01:

1. **The experiments are archived.** They stay on `p/mdsvex-1.0-design`; the site branch ships none of them, only what is extracted into `lib/design/`.
2. **The atlas is a page of its own,** beside the docs, not the PFM Reference. Both draw with `Score.svelte`, and the Reference links into the atlas.
3. **The streaming marks sit behind a prop** on `Score.svelte`: guess, revoke, hold and the bird's eye draw only when it is given a stream. Used on the streaming guide, the stream lab and the playground.
4. **Berkeley Mono is licensed for web embedding,** so the public site self-hosts it. The font files never go in git; they are added at deploy time. How (a private bucket, a CI secret, a step in the Cloudflare build) is settled in phase 0. pngwn can cut a custom web build, including a variable one, so phase 0 sends them the list of cuts and features the design needs. IBM Plex Mono stays as the fallback.
5. **A new `p/site-1.0` from `next`,** with the phase PRs stacked on it, so half-built design never reaches `next`. Code tasks still go to `next` as their own PRs.
