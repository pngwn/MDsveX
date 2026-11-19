# The score, the shared notation

Round three makes the score the design language for the whole site. Three strands work in it at once: 05, the score itself; 01, the Title wordmark; 02, the construct atlas. This file is the system they share, so their pages read as one site. It is taken from the two pages pngwn picked: the round one score (`/experiments/05-surprise`) and the Title wordmark (`/experiments/01-wordmark/v4`).

The experiments, and every `/experiments/...` route and `lib/experiments/...` file this page names as history, are archived on the local branch `p/mdsvex-1.0-design`. What ships is extracted into `packages/site/src/lib/design/` (see its `README.md`), and `/design` on the site renders it.

Follow it. If your page shows a rule here is wrong, change it in your own folder, try it, and propose the change in your NOTES.md with a screenshot. 05 owns this file and folds the good proposals in afterwards.

## What a score is

A score is the parser's reading of a source, drawn over the source. It is always there, with both parts: the phrases and the underlay. A page that only uses the vocabulary, with no phrases over a real underlay, is not a score. That is what went wrong with 05's round two.

This is v12 (`/experiments/05-surprise/v12` on the archive), the pick, as `lib/design/score/Score.svelte` draws it.

- **Underlay.** The source, set in letterspaced mono, as written. Every character keeps its own cell, so the phrases above line up with it.
- **Rows, not staves.** There are no stave lines. Phrases sit in rows by tree depth, the outermost node at the top, the deepest just above the underlay; a row exists only where a phrase sits in it, and position alone shows the nesting.
- **Phrases.** One per node, from its first character to its last: a line, a short vertical bar where the node opens and a matching one where it closes, both centred on the line, and its name in small italic in the corner the opening bar makes with the line.
  - Lines, bars and brackets are 1.5px. Bars are about 0.7rem tall. Don't go heavier: 2px reads more clearly but loses the score's lightness.
  - Text nodes are phrases too, so the reading is complete, but quiet: a 1px line in `#8b8e99` (`--quiet-line`, 3.15:1 on the paper), 0.4rem bars, and no name. `# md{"sv"}ex` is a heading phrase over everything, and under it a text line, an `expression` and a text line.
  - A row that holds only text phrases has no names to clear, so it closes up to about 0.6rem.
- **Nesting.** A block that takes more than one system is drawn once, over its first, as wide as its widest line, with a bracket down the margin to the foot of its last line, one step in for each block around it.
- **Bar lines.** A thin bar line just past the last character of a block, and the double bar at the end of the piece.

## Type

Chosen by pngwn on 2026-11-01, after comparing faces at `/experiments/type` (notes in `design/experiments/TYPE.md` on `p/mdsvex-1.0-design`):

- **Playfair** (Playfair 2, `opsz` 5 to 1200) for titles and the large typeset form, the `mdsvex` of the Title. It replaces Bodoni Moda, whose hairlines are too thin even very large. Let the optical size axis follow the size (`font-optical-sizing: auto`, the default).
- **Playfair italic at 14px** for phrase names. The same family as the titles, at a size its small optical sizes hold.
- **Source Serif 4** for body text: docs prose, ledes, descriptions.
- **Berkeley Mono** for the underlay and all code. Also for meta (nav, captions, labels) unless a page shows that needs a sans: one mono for source, code and labels ties the system together.
  - pngwn owns a licence, and it covers web embedding (confirmed 2026-11-01), so the public site self-hosts it. Never commit its files; they are added at deploy time. The site's `@font-face` is in `lib/design/type.css`, and `design/FONTS.md` says how the files reach the deploy.
  - Before the files, `local()` finds an installed copy. A face named "Berkeley Mono" hides the installed family of that name, so `local()` names each installed face by its full name and its PostScript name, as the desktop cuts carry them: `local("Berkeley Mono Regular")`, `local("BerkeleyMono-Regular")` (plus plain `local("Berkeley Mono")`, which a build whose regular has that name matches); `local("Berkeley Mono Italic")`, `local("BerkeleyMono-Italic")`; `local("Berkeley Mono Bold")`, `local("BerkeleyMono-Bold")`. `local("Berkeley Mono")` alone misses the desktop cuts.
  - Fall back to IBM Plex Mono from Google Fonts, which has the same 0.6em advance, so a visitor without Berkeley Mono still gets a sound underlay.
  - It comes in Regular, Italic, Bold and Bold Italic only, with no 500 or 300. A weight in between falls back to 400. So set syntax apart from content by voice colour, or by bold where colour isn't enough, never by an in-between weight.
- At display sizes the underlay is tracked wide, around 0.5em at the Title's size. The tracking is what makes the Title's notation easy to read, so keep it wide, and tighten it only as the size comes down (about 0.25em at 16 to 20px, never under 0.2em).

Google Fonts link for the rest: `family=Playfair:ital,opsz,wdth,wght@0,5..1200,87.5..112.5,300..900;1,5..1200,87.5..112.5,300..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=IBM+Plex+Mono:ital,wght@0,400;0,700;1,400`.

## Colour

Paper `#fbfbf8`, ink `#121318`, quiet `#5d606b`, rules `#b9bac2` (a table's, the frame's; the score has no staff lines), text lines `#8b8e99`.

Each kind of construct has its own colour, chosen by pngwn on 2026-11-01 from the v12 palettes (`/experiments/05-surprise/v12`). A construct's colour paints its phrase and the syntax characters it owns; content characters stay ink, and text is quiet. The voices are still the families the kinds fall into (block, inline, Svelte, directive, document), but colour now tells constructs apart rather than voices, because a list, its items and their paragraphs drawn in one blue were hard to tell apart.

Each colour comes in two tones:
- **Line tone** for lines, bars and brackets. A line is not text, so it only has to hold 3:1 on the paper (WCAG 1.4.11). It is the ink itself where the ink holds 3:1, and darkened just to 3:1 where it doesn't.
- **Name tone** for phrase names and syntax characters, which are text and hold 4.5:1. It is the ink darkened only as far as it needs.

The palette is RISO drum inks, at the riso-colors list's screen values, which suits the riso and linen texture. The kinds are placed on the inks so that constructs that nest or sit side by side are far apart: the closest such pair is 16 apart in OKLab (ΔE × 100), and the closest of any two kinds is 8.

| Kind | Riso ink | Line | Name |
|---|---|---|---|
| list | blue | `#0078bf` | `#0077be` |
| item | bright red | `#f15060` | `#d5334a` |
| paragraph | violet | `#9d7ad2` | `#8461b6` |
| quote | grass | `#397e58` | `#397e58` |
| heading | aqua | `#289bb7` | `#007d96` |
| fence, table | copper | `#bd6439` | `#b25a2f` |
| emphasis | fluorescent pink | `#fb43ac` | `#d7108d` |
| strong | bright olive green | `#a48f0a` | `#847200` |
| code span | kelly green | `#55a031` | `#388202` |
| link | burgundy | `#914e72` | `#914e72` |
| expression, tag | orange | `#f2601f` | `#c84700` |
| component, html | lake | `#235ba8` | `#235ba8` |
| logic block, branch | indigo | `#484d7a` | `#484d7a` |
| directive | turquoise | `#00a18b` | `#00816f` |
| text, frontmatter | | `#8b8e99` | quiet `#5d606b` |

The parser has more kinds than the table's constructs. Each takes the colour of the construct it reads as (`lib/design/score/kinds.ts`):

| Kind | Colour of |
|---|---|
| strikethrough, superscript, subscript | emphasis |
| image, footnote reference | link |
| import | expression |
| table header, table row, table cell | fence, table |
| element (`html`, a typed tag or component) | component |
| directive label | directive |
| thematic break, definition, footnote definition, HTML comment, line break | ink |

Riso is not colour blind safe. Under protan vision quote and item collapse (ΔE 2) and so do list and paragraph (5). The accessible alternative is Okabe and Ito's colours (`?palette=cvd` on v12; in `lib/design/tokens.css`, and `<Score palette="cvd">`), where no nested pair falls under 11 for normal, protan or deutan vision. Colour is never the only cue, since every structural phrase is named and nesting shows by position, but a page that leans on colour should offer the alternative.

A page that colours by voice rather than by construct, a Title or a small mark, uses ultramarine `#2a2fd4`, rose `#d4145a`, orange `#c93300` and green `#0b8457`. The orange was `#e63a00`, which is 4.08:1 on the paper and fails AA for names; `#c93300` is 5.12:1.

## Ink texture

Chosen by pngwn on 2026-11-01, from the plates on `/experiments/01-wordmark/v7` (built in `lib/experiments/01-wordmark/print.ts`, now `lib/design/texture.ts`). The texture follows the face:

- **Playfair: linen.** A fine thread weave in the ink, for titles and the typeset `mdsvex`. Only display sizes get the ragged edge; at small sizes it hurts legibility.
- **Berkeley Mono: riso, at display sizes only.** Grain and paper flecks, like a typewriter, for the Title and the atlas's scores. Code, labels, meta and a docs score at a body size stay plain: there the grain reads as noise.
- **Source Serif 4: plain.** Body text stays clean for reading.

Every face keeps its own colour; the texture shows as gaps where the paper comes through. Phrase names are Playfair, so they take linen; at 14px the weave is faint and doesn't muddy them. Phrase lines, bars and rules are not type, and stay plain. The mono gets no dark specks; they can't show on black.

## Phrase names

Full words, italic, lowercase, in the construct's name tone, everywhere, 375px included: `heading`, `paragraph`, `expression`, `emphasis`, `strong`, `link`, `code`, `list`, `item`, `quote`, `code block`, `table`, `table cell`, `logic block`, `tag`, `frontmatter`. An element is named by its tag, `<Counter>` or `<div>`, and a directive by its name, `note directive`. v12 drew full names and they read; the short forms (`head.`, `para.`) are retired. Text phrases are not named. Where two names in a row would collide, the later one is left out; a phrase that carries on from the system before takes its name in brackets, `(paragraph)`.

A name hugs the corner of its opening bar and its line, so it reads as that line's and not the row's above:
- Its left edge sits 2px past the bar.
- Its descenders clear the line by 1px, which puts its baseline about 4px over the line. Set any lower, and p and g cut the line.
- It sits closer to its own line than to the row above. At 14px in a 1.25rem row, its baseline is about 4px over its own line, and the top of its x-height is about 9px under the line above.
- In a nested header, the name sits at the construct's first character, beside its bar, not at the bracket.
- Positions are measured in the underlay's cells. Work them out in the mono (in CSS, a registered `<length>` property set on the phrase), not inside the name, where Playfair's `ch` is narrower.

## Streaming, only where it is the subject

These marks belong to pages about incremental parsing, and `Score.svelte` draws them only when it is given a `stream`:

- a guess (a pending node) is written small, raised and dashed, its opening bar a hollow 4px bar. It is raised by a third of a row, and its row grows by as much, so its name never reaches the line of the row above;
- a revoked guess is struck through, and its delimiter turns back to ink. It stays struck to the end of the stream, so the change can be read;
- a list item's paragraph is a guess that the list is loose, settled when the list closes. A loose list commits it; a tight list revokes it. That revoke gives nothing back (a paragraph has no delimiters, and its text stays in the item), so it leaves no struck ghost: the guess goes, as a committed one's dashes do, and the finished bar matches the settled reading;
- held characters (fed, not yet in any node) sit under a fermata, with the bird's eye.

Everywhere else the score shows the settled reading.

## The penguin

Chosen by pngwn on 2026-11-01, from `/experiments/penguin`. Two pieces go in; the minim, the engraved device, Sung and microprint do not.

- **The perched bird.** pngwn.at's own penguin, the line drawing from the blog header (`lib/design/penguin/pngwn.ts`), at its smallest and lightest: 17px tall, a 1px non-scaling stroke, plain ink, facing left, back into the page. Small, but it still reads, and the subtlety is the point. One per page, perched at the right end of a line; the double bar that ends the last piece and the Title's heading line are the tested spots. On the perch pages: `?bird=line&size=17&weight=1&facing=in`.
- **The bird's eye.** While streaming, the fermata over held characters has a small orange beak (`lib/design/penguin/BirdsEye.svelte`). It peeks up while the parser holds and ducks back when it decides, so it only appears when the real parser is holding. It might grow into a general streaming cursor; that's an idea to try, not decided.
- Both stay still under reduced motion, are `aria-hidden` and carry no label.

## Rules

- No legend on an opening or an intro page. The notation must read from the source below it and the output beside it. If it doesn't, simplify it.
- Hover, focus or a caret on a phrase washes its characters in the underlay and its output together. That is the one interaction every score has.
  - The wash is pale and in the phrase's own colour: its line tone at 13% over the paper.
  - Every other phrase, bracket and bar line steps back to 35% opacity, and every character outside the phrase to 40%.
  - Nothing else changes. The phrase doesn't thicken or go bold, and nothing moves. With reduced motion the change is instant; otherwise it fades in about 160ms.
  - Only a phrase's own row points at it. Its bars and name hang over the rows next to it and must not catch the pointer.
  - Two nodes can cover the same characters, a list and its only item, so the wash matches on kind as well as range.
- Real parser output only: `pfm_tree` or `pfm_stream` from `packages/site/src/lib/design/pfm.ts`.
- Works at 375px. A long source wraps by systems, as a score does, a nested block's bracket running down the margin across them. Below 600px the underlay steps down to 15px at 0.2em tracking and the names to 13px.

## Dark mode, a proposal

Not decided: pngwn has not reviewed it. `lib/design/tokens.css` carries a dark palette, and the site follows the reader's setting (`?theme=dark` forces it). It is made by this page's own contrast rule:

- Paper `#15161b`, ink `#e8e6de`, quiet `#9b9eaa`, rules `#3d3f48`, text lines `#6e717c`.
- Each construct's line and name tone is its light ink where that holds 3:1 (a line) or 4.5:1 (a name) on the dark paper, and lightened in OKLCH only as far as it needs to. Most line tones are unchanged; most name tones are the line ink itself.
- Okabe and Ito's colours are lifted the same way, but not yet checked under colour blind simulation.
- To check: the riso and linen masks were tuned on the light paper. On the dark one their gaps show the paper through light ink, as darker flecks. Highlighted code uses the same tokens, so it follows.
