# Docs lab: three directions for the docs

2026-11-02. Three ways to draw a docs page, each drawn over the same two pages: `docs/learn/markdown` (the language tour) and `docs/guides/templates` (a typical guide). They are at `/docs-lab`, which links all six. Screenshots at 1440 and 375, light, with the real `/atlas` beside them, are in `design/screenshots/docs-lab/`. The `*-reading-on` crops show the page switch turned on.

All three use the real prose, the real compile and the real parser:
- The pages are data in `packages/site/src/lib/docs-lab/content/`, split into units (one concept each), with the prose as written. `build.server.ts` compiles every piece with mdsvex at build time.
- Every "you get" is mdsvex's `compile` with its mappings, so the score washes the output as it does on the atlas.
- Every CommonMark reading is micromark's (GFM's for the autolink row). Every mdsvex reading is the build's own render (`build/examples.js`).

## What all three share

- **The page switch, "Show the reading".** It turns every example on the page into its score. Each example keeps its own source/score toggle, which holds until the page switch is next flipped. It defaults off in Learn, Guides and Plugins and on in Reference and Internals. The reader's choice is kept per section in `localStorage` (`reading.svelte.ts`). It costs authors nothing, because the template provides it from the route's section. An example flagged `score` still opens on its score.
- **The CommonMark table became eleven contrasts.** Each one is a source, CommonMark's reading and mdsvex's reading, each shown rendered and as html, plus the table's "write this instead". The two `_`/`*` rows share one source. With the score on, the characters that make the difference are ruled under their cells (new `cue` prop on `Score.svelte`, its own commit `0f37ab90`). That covers the four spaces of indent, the two trailing spaces, the `##` that stays and the `===` line.
- **The strip.** Every mark the page teaches, in its construct's colour, each one a link to where the page takes it up. Each direction draws it its own way.

## 1. Plates

Each concept is an atlas plate: the mark cell with its colour bar, the section and the plate's number, a Playfair title, the lede, then the pair as the hero, then Notes and Edges side by side. Sections are phrase heads, like the atlas index's families. The contrasts are small plates, two to a row. "Added to CommonMark" is round one's grid of marks. The strip is the atlas index: a hairline cell per mark under each section's phrase head, with a readout.

- **Does well.** It is unmistakably the atlas's site. A long page becomes something you can scan, and the prose shrinks to a lede and a note. Edges get a home, and on Templates they can be real compile errors shown as specimens (`template: blog`, a `children:` key). It works on Guides too: the config is "Given" over the pair.
- **Costs authors the most.** Every concept needs a title and a typed mark that the pages don't have today, and the prose has to be cut at the example into lede and notes. In `.svx` it would be one container directive per concept, with the hero being the first flagged fence inside it:

  ````md
  :::plate[Inside a word](mark="|_")
  A `_` or `*` opens after a space or punctuation… The `|` is not rendered:

  ```svx result
  fan|_tas_|tic
  ```

  Curly quotes, dashes and other Unicode punctuation count as punctuation there…
  :::
  ````

  Edges would be a nested `:::edges` holding a list.

## 2. Margins

A critical edition. The example is the text, set in the wide middle column; the prose is the commentary beside it, narrower; edges, CommonMark notes, see-alsos and the real error specimens are the apparatus in the outer margin. The contrasts are set as variant readings: a numbered lemma, the text, and what each witness (CommonMark, mdsvex) makes of it, with "Instead" in the margin. The strip is a sticky running head of marks. "Coming from 0.x" moves to the margin of the title page. Below 1180px it is two columns (text, margin), and on a phone one column, with the apparatus as a ruled indent.

- **Does well.** It is the most book-like, and it reads calmly. It keeps the prose's own order, so a long guide stays a guide. The margin finally gives edges and see-alsos a place that isn't the next paragraph. It scales to every section, including Internals' explanation pages.
- **Costs authors little.** Asides only. A margin note is a container directive placed after the paragraph it belongs to, which authors already write as a sentence: `:::margin[edge]` … `:::`. The template's grid floats it. No titles or marks are needed, except an optional mark per passage. The cost is visual: it is still prose-first, the furthest of the three from the atlas, and on a phone it falls back to a stream with indented notes.

## 3. Workbook

Lessons. Each concept with an example is a numbered lesson: the brief on the left, and on the right an editor beside what mdsvex compiles it to, with "Now try" nudges under it that load a change. The embeds are static until touched: on the production build, the page loads 344 KB of JS and no compiler. The first focus loads mdsvex's compile (395 KB), and from then on the output follows each keystroke. The contrasts are one bench with a key per difference: edit the source and micromark and mdsvex both read it in the browser (a further 837 KB, the first time). The strip is a row of keys. Config and component code sits between lessons as dashed "reading" panels.

- **Does well.** For Learn it is the best teacher of the three. Breaking the syntax on purpose (`fan_tas_tic`, `[x]write`, `\^`) shows the rule faster than the sentence does. With the reading on, the score redraws as you type. **Templates works too**, and better than I expected: the guide's subject is a transformation of a document, so lessons like "ask for `template: blog`" (a real error listing the known templates), "take the key out" (the `default` entry answers) and "add `<svelte:window />`" (it hoists) are real compiles. It does not suit guides whose subject is configuration or tooling (Vite, Without Vite, Prettier, Migrating): there is nothing in a document to edit. Those would be Margins pages.
- **Costs authors the most writing.** Every nudge is new prose plus a source, about 20 for these two pages, and the only new writing in the lab: `try` in the content files. In `.svx`: a `live` fence flag beside `result`, and nudges as `:::try[the sentence]` around a fence. It also costs runtime: about 1.2 MB on first touch of a contrast.

## Pick

**Plates**, for Learn, Guides and Reference. It answers "a giant stream of prose" most directly, and it is the atlas's own language, which is the part pngwn loves. The Templates plates show it holds for a guide as well as for syntax. Two things to borrow, without the other directions' forms:
- the Workbook's bench as the plate's pair, since embeds waking on touch is already decided (docs plan decision 7), with no nudges and no lessons;
- the Margins treatment for Internals' explanation pages, which are arguments rather than concepts and would be hurt by being cut into sheets.

**Decided 2026-11-09: Plates, full width.** pngwn picked Plates with one change, now in the lab:
- A plate takes the whole content area, from the nav's edge to the page's right gutter. Past the frame's 92rem measure it keeps growing, while the nav stays under the site's own (`Shell`'s `bleed`).
- Inside a plate, the title, the lede and the notes keep a reading measure, and the extra width goes to the pair: "you write", where a score wraps, takes 1.4 parts to "you get"'s 1.
- Prose between plates stays in the 46rem column, so the page alternates between a narrow text column and wide plates.
- At 1440 the plate already reached the gutter (1048px beside the nav), so what changes there is the split inside it. At 1920 the plate grows from 1184px to 1352px.
- Screenshots: `plates-*-{1440,1920,375}-light.jpg`.

## What it takes to apply Plates to all 42 pages

1. **Code, once.** Move the lab's pieces into `lib/docs`:
   - `Pair` replaces `Example.svelte` and reads the page's reading context.
   - The switch goes in the docs template, with the section default taken from the route.
   - Add a `plate` directive in the docs plugin (`build/examples.js`) and register it in `vite.config.js`.
   - Add a `commonmark` fence flag that renders micromark's reading at build time.
   - Generate the strip from the page's plates.
   - Add `micromark` and `micromark-extension-gfm` as site devDependencies. The lab finds them in `node_modules/.pnpm` through `@mdsvex/migrate`'s remark (`commonmark.ts`), which is fine for a lab and not for the site.
   - Move `rendered` and `pretty` out of `build/` into `lib/docs`. The dev server won't serve `build/` to the browser, so the lab keeps a copy in `workbook/render.js`.
   - About two days.
2. **Content, per page.** Cut each page into plates, and give each plate a title and a typed mark: roughly 250 concepts over the 42 pages. Learn (3 pages) and Reference (10) are natural. Guides (8) and Plugins (21, mostly one plugin and its options each) take an afternoon per section. Internals has no pages yet; when phase 3 writes them they stay prose with margins (see the pick). Edge bullets are already written in most Reference pages, and the CommonMark notes are already in the atlas's `constructs.ts`. About a week, one section per session, as SITE_PLAN phase 3 already splits it.

## Notes for whoever picks this up

- **Some examples are new, taken from the prose.** Where a sentence names its own example (`<Badge /> new today`, `<div>one</div> two`, `{1 + 1}`), the lab compiles that source as the plate's pair (`from_prose` in the content files). The Templates plates add the smallest documents that show what a sentence says (a post under the default template, a `children:` key). No facts were added or changed.
- **"Svelte in markdown" was hand-written.** On the real page its output is hand-written. The real compile gives the same html, character for character, so nothing had drifted. Every lab pair is compiled.
- **The atlas's `Output.svelte` doesn't wrap.** `code.css` gives `pre > code` `width: max-content`, so `white-space: pre-wrap` never wraps it. A one-line compile, which most are, scrolls sideways. The lab wraps it with a `.wrap` class (`lab.css`). Worth fixing in the atlas, which is being revised now.
- **Dark mode is unreviewed**, as everywhere on the site.
