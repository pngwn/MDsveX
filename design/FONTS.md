# Berkeley Mono on the site

2026-11-01, phase 0. pngwn's licence covers web embedding, so the public site self-hosts Berkeley Mono. Its files must never be committed or embedded in git; they arrive at deploy. This page proposes how they get there, and lists the cuts and features to ask for in the custom web build pngwn offered.

Nothing here is implemented beyond the `@font-face` rules. There are no secrets, no scripts and no bucket yet.

## What the code loads today

`packages/site/src/lib/design/type.css` declares three faces under the family `Berkeley Mono`:

| face | weight, style | `src`, in order |
|---|---|---|
| Regular | 400 normal | `local("Berkeley Mono")`, `local("Berkeley Mono Regular")`, `local("BerkeleyMono-Regular")`, `/fonts/berkeley-mono/BerkeleyMono-Regular.woff2` |
| Italic | 400 italic | `local("Berkeley Mono Italic")`, `local("BerkeleyMono-Italic")`, `/fonts/berkeley-mono/BerkeleyMono-Italic.woff2` |
| Bold | 700 normal | `local("Berkeley Mono Bold")`, `local("BerkeleyMono-Bold")`, `/fonts/berkeley-mono/BerkeleyMono-Bold.woff2` |

The stack is `'Berkeley Mono', 'IBM Plex Mono', ui-monospace, monospace`. Plex comes from Google Fonts with the same 0.6em advance, so the score's cells hold when Berkeley Mono is missing.

What the design uses: Regular for the underlay, code and meta. Italic for held characters while streaming. Bold is held back for syntax that colour alone can't set apart (SCORE.md). Bold Italic is unused, so it is not declared.

One finding: `local("Berkeley Mono")`, as SCORE.md writes it, does not match the desktop cuts installed here. Their full names are `Berkeley Mono Regular`, `Berkeley Mono Italic` and so on, and their PostScript names are `BerkeleyMono-Regular` and so on. The experiments never noticed, because they declared no `@font-face` and fell through to the installed family by name. An `@font-face` with the same family name hides the installed family, so `local()` has to name each face. The rules list the family name first in case a web build is named that way.

The `url()` files live under `packages/site/static/fonts/berkeley-mono/`, which is empty and not in git. **Add that folder to `.gitignore`** before anyone copies a font into it. Phase 0 could only touch `lib/design`, `routes/design` and `design/`, so the ignore line is not there yet.

## Getting the files into the Cloudflare build

The site will build on Cloudflare: the docs plan moves it off `adapter-auto`, and the old `wrangler.toml` points at a Sapper export. Three ways in, all keeping the files out of git:

1. **A private R2 bucket and a build step (recommended).**
   - Make a bucket, say `mdsvex-private`, with the WOFF2 files under `berkeley-mono/`.
   - Create an R2 API token that can only read that bucket, and put it in the Cloudflare build's environment as encrypted variables: `FONTS_R2_ACCOUNT`, `FONTS_R2_KEY_ID`, `FONTS_R2_SECRET`.
   - A `prebuild` script in `packages/site` fetches the files with the S3 API into `static/fonts/berkeley-mono/` before `vite build`.
   - With no credentials (a fork, a local build, a preview without secrets), the script logs a line and exits 0. The page then falls back to `local()` and Plex. The build never fails for a missing font.
   - Why this one: the files are versioned in one place pngwn controls, and a new cut is an upload, with no repo change. The token can do nothing else, and the step works whichever adapter the site ends on, static or Worker.
2. **CI secrets holding the files.** Base64 each WOFF2 into a secret and decode it in the build. This needs no bucket, but GitHub caps a secret at 48 KB, which a full Latin cut of a mono can pass, a variable one easily. Updating a cut means re-encoding by hand. Workable for one small file, fragile for several.
3. **Served from R2 at request time.** Bind the bucket to the site's Worker and answer `/fonts/*` from it in `hooks.server.ts`, with long cache headers. The files never enter the build output at all. But it ties fonts to the Worker adapter and to a server route, and a prerendered page would still reference URLs the static host doesn't have. Worth it only if the site becomes a Worker for other reasons.

Whichever way: once deployed, the files can be downloaded from the site, as with any web font. That is what the web licence allows. The goal is only that git and the npm packages never hold them.

Preload only the Regular (`<link rel="preload" as="font" type="font/woff2" crossorigin>`). The frame can add it in phase 2, once the files exist, so nothing preloads a 404.

## The custom web build to ask for

Checked against the desktop cuts (version 1.009: 619 glyphs, a 600-unit advance on every glyph, `calt`, `ccmp`, `locl`, `ordn`, `aalt` and `ss01` to `ss08`) and against what the code uses.

### Cuts

- **Variable, two files:** `BerkeleyMono-Variable.woff2` (roman) and `BerkeleyMono-VariableItalic.woff2`.
  - One axis, `wght`, from **350 to 700**. The default instance is 400.
  - Named instances: 400 (Regular) and 700 (Bold).
  - Nothing above 700.
- **Statics as a fallback:** Regular 400, Italic 400 and Bold 700 as WOFF2. Same names as today's `url()`s, so they drop in with no CSS change.
- **Why an axis from about 350 to 500 matters more than the bold.** The design sets one mono at small sizes under a riso mask that knocks flecks of paper out of the ink, and it will run on a dark paper. Two adjustments then become possible:
  - About 420 to 450 on light paper restores the ink the riso mask takes out of 13 to 15px text.
  - About 360 to 380 in dark mode keeps light-on-dark text from blooming.
  - SCORE.md's rule stays: syntax is set apart by colour, never by an in-between weight. The axis is for tuning a whole context, not for marking up text.
- With the variable build in place, `type.css` becomes:
  ```css
  @font-face {
  	font-family: 'Berkeley Mono';
  	font-style: normal;
  	font-weight: 350 700;
  	font-display: swap;
  	src: local('Berkeley Mono'), url('/fonts/berkeley-mono/BerkeleyMono-Variable.woff2') format('woff2-variations');
  }
  ```
  The italic follows with `font-style: italic`. The statics stay as a second `src` for old browsers.

### Features

- **No ligatures.** Remove the `calt` ligature lookups and their 158 `.lig` glyphs: `->`, `=>`, `{{`, `}}`, `--`, `...`, `::` and the rest.
  - Every character must keep its own cell. That is the whole premise of the underlay, and code samples must show what the reader types.
  - CSS can turn them off, and the code does. But phase 0 found that a `font:` shorthand silently resets `font-variant-ligatures` and `font-feature-settings`. The demo page's specimen showed `=>` as an arrow until it was fixed. A font that has no ligatures can't regress that way, and it is smaller.
- **A distinct zero, baked into the default glyph.** The default `zero` is already dotted, and it reads apart from `O` at the underlay's size. Keep it as `zero`, and drop the alternates (`ss01` to `ss04`; `ss02` is a plain zero that reads as `O`).
- **Tabular figures by default.** These come free: Berkeley Mono is monospaced, so every figure is already 600 units wide. Ask for no `tnum` feature, and no proportional figures.
- **Drop the other stylistic sets** (`ss05` and `ss06` sevens, `ss07` and `ss08` ligature variants), and `aalt` and `ordn`. The site picks one form of each glyph.
- **Keep `ccmp` and `locl`,** so accented letters built from marks still compose.
- **No kerning,** as in any mono. Check that the web build adds none.
- Keep the family name `Berkeley Mono`, and give each static the same full and PostScript names as the desktop cuts. Then the `local()` rules find an installed copy first.

### Coverage

WOFF2, subset to:

| range | why |
|---|---|
| U+0000–007F Basic Latin | source and code |
| U+00A0–00FF Latin-1 Supplement | includes U+00A0, which the score sets for every space in the underlay |
| U+0100–017F Latin Extended-A | names and prose quoted in code |
| U+0180–024F Latin Extended-B (the 7 glyphs the cut has) | for completeness, cheap |
| U+0300–036F combining marks | for `ccmp` |
| U+2000–206F General Punctuation | ’ “ ” – — … in meta and captions |
| U+2190–21FF arrows, U+2500–257F box drawing | file trees and CLI output in the docs (`├──`) |

Leave out the private use area (U+E000 block, the 8 glyphs there) and anything else the desktop cut carries beyond these.

### To check when the build arrives

- Every glyph still advances 600 units, the same as IBM Plex Mono's 0.6em, so the cells don't shift between the fallback and the real face.
- The score's measure probe (`.cellw` in `Score.svelte`) reports the same cell width before and after the font loads. The score lays itself out again on `document.fonts.ready`, but a changed advance would move every system break.
- The italic is a true italic. It is only used for held characters, so check it under the riso mask at 15px.
