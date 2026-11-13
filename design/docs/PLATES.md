# Cutting a docs page into plates

The docs are plates, as pngwn decided on 2026-11-09 (`design/docs/LAB.md`): each concept a page teaches is one atlas sheet across the page, and the prose between them stays in the reading column. These pages are the worked examples, so read them beside this file:
- `packages/site/src/routes/docs/learn/markdown/+page.svx`, a language page with contrasts and a grid of marks
- `packages/site/src/routes/docs/guides/templates/+page.svx`, a guide with config, compiled documents and errors

Change a page's form, not its meaning. Keep every fact, link and anchor the page has. New words go only where a plate needs a title or a one-line lede the page didn't have.

## The pieces

````svx
::::plate[Inside a word](mark="|_", tone=emph)
A `_` or `*` opens after a space or punctuation… The `|` is not rendered:

```svx result
fan|_tas_|tic
```

:::notes
Curly quotes, dashes and other Unicode punctuation count as punctuation there…
:::

:::edges
- Write `\>` or `\^` for a cell of that one character.
:::
::::
````

- **`::::plate[Title](mark="…", tone=…)`.** Four colons, so the three-colon `notes` and `edges` can nest in it. The bracket text is the title, and it can hold code and emphasis but not links.
  - `mark` is quoted.
  - `tone` is one of `list` `item` `para` `quote` `heading` `fence` `emph` `strong` `code` `link` `expr` `comp` `logic` `directive` `text` `other`, the colours in `lib/design/score/kinds.ts`.
  - `id=` sets the anchor. Without it, the anchor comes from the title and never repeats an id already on the page.
- **The lede.** The first prose in a plate, up to its first fence or directive, is its lede. The docs plugin moves it into the plate's head, beside the mark.
- **The body.** After the lede, each fence and directive is a part across the plate. A plain fence directly before a flagged one shares its part: that is how a config sits over the document it compiles.
- **`:::notes` and `:::edges`.** They sit side by side when the plate is wide.
- **Fence flags**, on `svx` fences:
  - `result`: you write beside what mdsvex compiles it to.
  - `score`: the parser's reading. With `result` too, the pair opens on the score.
  - `error`: the build fails unless the compile throws, and shows the error.
  - `commonmark`: the source read by CommonMark and by mdsvex. Add `gfm` for GFM's reading, and `cue="regex"` to rule on the score the characters that make the difference.
  - `templates`: compile with the templates guide's `default` and `docs` templates.
  - `file="src/routes/x/+page.svx"`: name the file over the example.
- **`::marks`.** A line of its own after the page's intro. It draws the strip of the page's plates, grouped by their `##` sections. Use it on a page with a dozen plates or more, where a reader wants to jump.
- **`::::added` holding `:::add[what you write](mark=…, tone=…)`.** A grid of small marks, each with what you get as its body. Use it for a list of short syntax with no example of its own, like Learn's "Added to CommonMark". Each cell joins the strip.
- **The reading switch is the template's.** Pages need nothing for it. It is off by default in Learn, Guides and Plugins, and on in Reference and Internals.

## Where a concept starts and ends

- **A plate is one thing a reader could look up.** Its title is the answer to "what is this about?". It starts where the page starts talking about that thing and ends before the next.
- **Most `###` sections and bold-led bullets are a plate each.** On the markdown page, each `**A paragraph of only tags gets no <p>.**` bullet became one, and its bold text the title.
- **A `##` stays a heading.** It names the section the plates sit in, gives the plates their kicker and the strip its groups, and keeps its anchor for links from other pages.
- **A table row that pairs a source with what it does is a plate.** If a source shows the row, the plate gets a `commonmark` fence or a `result`. If it doesn't, the row goes in an `::::added` grid.
- **One example, one plate.** Two examples showing the same rule share a plate. Two rules sharing one example are two plates, or one plate with an `edges` list.
- **Prose that frames several plates stays between them as prose,** like the "Tables are GFM pipe tables…" paragraph before the two table plates.

## Titles and marks

- **Title.** A few words naming the concept, in the page's own words. A bold lead becomes the title as written, full stop included. A heading becomes it as is. Don't write new claims into a title.
- **Mark.** The characters a reader types for it, `|_`, `[x]`, `{#}`, `---`, `#lib`, never a symbol that stands for it. Keep it to six characters; past three it is set smaller. For something with no syntax, use the name it is written with: `$props`, `false`, `.svx`.
- **Tone.** The colour of the construct the plate is about, as the score colours it: `emph` for anything around emphasis, `fence` for tables and fences, `comp` for elements and components, `expr` for braces, script and imports, `link` for links and references. A guide's plates take the tone of what the reader writes, and `text` or `other` when nothing fits.

## Lede and notes

- **Lede.** What the reader must know to read the example: the rule, in one or two sentences, ending on the colon that leads into the example when the page had one. A list that is the rule, such as the order a template is chosen in, belongs in the lede.
- **Notes.** What follows the example: why it works so, a consequence, a see-also link. Prose after the example on the old page goes here.
- **Edges.** Where the construct stops holding, as a list. These are the sentences with "can't", "only", "an error", "text instead", "write `\x` to…". An edge that is an error gets an `error` fence under it, so the reader sees the real message.
- **CommonMark differences.** On a contrast plate, CommonMark's and mdsvex's readings are the lede, one sentence each. What to write instead goes in `:::notes`; a contrast plate shows it as one line.

## When to use `commonmark`

When a page says PFM differs from CommonMark or GFM, and a short source shows it, use one `commonmark` fence per difference.
- **Give it a `cue`.** The regex is matched line by line, so `^` and `$` are a line's ends. Examples: `cue="##$"` for closing hashes, `cue="^    "` for an indent, `cue=" +$"` for trailing spaces.
- **A cue that matches nothing fails the build.** That is deliberate. Editors trim trailing whitespace (`.editorconfig` says so), and a trimmed `one  ` would silently stop showing the line break. If an edit trims it, restore the spaces from a script or with a careful editor.
- **Don't use `commonmark` for a page's own features.** Use `result`.

## What stays prose

- **Stays prose:**
  - the page's intro, under its `# Title`;
  - a paragraph that frames a whole section;
  - links out, "see also" sentences that belong to no one plate;
  - a conceptual explanation with no example, such as most of Internals. Leave those pages as prose with `score` examples.
- **Never a plate:** a single sentence on its own. Fold it into the nearest plate's notes, or leave it as prose.

## How to check a page

1. Run the dev server (`pnpm --filter @mdsvex/site dev`) and open the page. The build checks:
   - every fence compiles;
   - a `result` that can't compile fails;
   - an `error` that compiles fails;
   - a `cue` that matches nothing fails.
2. **Read it at 375, 1440 and 1920.** Plates run to the page's right gutter on wide screens. Nothing may pass the right edge. Measure element right edges against the viewport, not `scrollWidth`: `.design-frame` clips.
3. **Turn on "Show the reading".** Every example becomes its score, a contrast's score shows its cue, and the choice survives a reload.
4. **Check anchors.** Click the strip's cells and every anchor other pages link to (`grep -rn "your-page#" packages/site/src/routes`).
5. **Run the builds.** `pnpm --filter "@mdsvex/site^..." build`, then `pnpm --filter @mdsvex/site build`. The site build is strict: a broken link, anchor or example fails it.
6. **Watch the console.** No errors, in dev or in `vite preview`.
