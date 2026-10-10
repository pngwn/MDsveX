# remark / rehype plugin audit

Sources: the official lists at `remarkjs/remark/doc/plugins.md` (~150 plugins) and `rehypejs/rehype/doc/plugins.md` (~135 plugins). The `awesome-remark` and `awesome-rehype` lists added nothing new. The survey also covers about 25 popular plugins that are missing from those lists, such as `rehype-pretty-code`, `rehype-mermaid` and `remark-reading-time`.

Popularity is **npm downloads for the month to 2026-10-09**. Some numbers are inflated by a single big dependent:

- `rehype-sanitize` and `rehype-raw` by react-markdown.
- `rehype-attr`, `rehype-ignore` and `rehype-rewrite` by @uiw/react-md-editor.
- `remark-cjk-friendly`, probably by one large tool.

## How this is organised

Features are grouped by **concern**: the job a user is trying to get done. That isn't the node type a feature touches, and it isn't how the feature gets built. Each feature has a separate **delivery** tag. A concern often spans several kinds of delivery. Footnotes, citations and numbering are one concern, for example, even though footnotes need parser syntax and numbering needs plugin API work.

| Delivery | Meaning |
| --- | --- |
| `core` | parser syntax, or a default in the renderer; plugins can't add syntax |
| `vite` | mdsvex's compiler and Vite plugin: anything that joins the module graph |
| `plugin` | a parse plugin that today's API supports |
| `plugin+API` | a parse plugin that needs an API capability that doesn't exist yet (§4) |
| `component` | a directive or a replaced element already does it; ship components and docs |
| `tooling` | language-tools or a CLI: diagnostics, lint, editor features |

The parse-plugin API can annotate, retag, wrap and append existing node kinds. It can't add syntax, group siblings, supply components, rewrite text, read frontmatter or write document metadata.

---

## 1. Filtered out: already supported

| Plugin(s) | Covered by |
| --- | --- |
| remark-directive, remark-directive-rehype, remark-generic-extensions, remark-container(s), remark-custom-blocks, remark-admonitions, remark-flexible-containers, remark-shortcodes, remark-hexo, remark-mdc, remark-align, rehype-semantic-blockquotes | generic directives with `(k=v)` args, turned into components |
| remark-attr, rehype-attr | rejected (`{}` belongs to Svelte); directive args replace them |
| remark-gfm (tables and strikethrough only), remark-extended-table, remark-grid-tables, @adobe/remark-gridtables, rehype-merge-cells | GFM tables plus extended tables (`\|\|`, `\|>`, `\|^`) |
| remark-sub-super, remark-supersub | `^sup^`, `~sub~` |
| remark-frontmatter, remark-extract-frontmatter, remark-parse-yaml, remark-yaml-config | frontmatter becomes `metadata`; `frontmatter.parse` handles TOML or full YAML |
| remark-highlight.js, remark-prism, rehype-highlight, rehype-prism(-plus), @shikijs/rehype, rehype-pretty-code, rehype-shiki, rehype-starry-night, rehype-highlight-code-block, remark-tree-sitter, remark-torchlight | built-in twinkleplop highlighting, or a custom highlighter function |
| rehype-highlight-code-lines, remark-code-title(s), remark-flexible-code-titles, rehype-code-titles, rehype-code-meta, rehype-twoslash, most of expressive-code | fence meta (`{1,3-4}`, `/word/`, line numbers, `title=` / `caption=`), `[!code …]` notation, opt-in twoslash |
| remark-code-extra, rehype-rewrite, rehype-wrap(-all/-sibling), rehype-components, rehype-slots | component replacement (`components`, `component_mode: 'all'`) |
| rehype-document, rehype-template, rehype-lodash-template, remark-variables | templates and `{expr}` mustaches |
| remark-rehype, rehype-stringify, remark-html, rehype-raw, remark-mdx, rehype-react | the PFM → Svelte pipeline |
| remark-breaks | contradicts PFM on purpose: soft breaks are kept, hard breaks use `\` |
| autolink literals (part of remark-gfm) | won't be supported: `<https://…>` already links a URL, and the bare shorthand adds little |

Moved out of this list on a second pass, because "covered" was too generous:

- **rehype-class-names, rehype-add-classes:** a component replacement just to add a class is heavy. See Presentation, "styling hooks".
- **rehype-partials, @it-service-npm/remark-include:** importing a `.md` file as a component isolates its ids, footnotes and TOC. See Composition.

## 2. Filtered out: pointless for mdsvex

| Group | Plugin(s) | Why |
| --- | --- | --- |
| Other output targets | remark-man, remark-docx, @m2d/remark-docx, remark-pdf, remark-slate(-transformer), remark-vdom, @handlewithcare/remark-prosemirror, rehype-dom-parse/-stringify, rehype-remark, remark-utf8 | mdsvex targets Svelte only |
| Markdown-to-markdown formatting | remark-heading-gap, remark-defsplit, remark-inline-links, remark-reference-links, remark-sort-definitions, remark-remove-unused-definitions, remark-renumber-references, remark-tight-comments, remark-prettier, remark-squeeze-paragraphs | these serialize markdown; a PFM formatter is a tooling job |
| unified internals | remark-disable-tokenizers, remark-comment-config, remark-ignore, rehype-ignore | no unified processor to configure |
| README generators | remark-api, remark-usage, remark-license, remark-contributors, remark-git-contributors, remark-package-dependencies, remark-insert-headings, remark-strip-badges | made for GitHub READMEs, not sites |
| HTML minification and document assembly | all of rehype-minify (~25 packages), rehype-preset-minify, rehype-format, rehype-concat-css-style / -javascript, rehype-css-to-top, rehype-javascript-to-bottom, rehype-sort-attribute(s/-values), rehype-prevent-favicon-request, rehype-postcss, rehype-remove-unused-css, rehype-sort-tailwind-classes, rehype-inline, rehype-extract-meta | Svelte and Vite own the output; `<svelte:head>` is in templates |
| Stripping content | remark-unlink, remark-strip-html, remark-remove-comments, rehype-remove-comments, rehype-remove-images, remark-redact, remark-redactable | Svelte drops comments, and `{#if}` hides content. Plain-text extraction is covered under Collections. |
| Sanitizing | rehype-sanitize | compiling to Svelte already runs code; mdsvex is not a sandbox for untrusted input |
| Gimmicks and one-offs | remark-code-screenshot, remark-codesandbox, remark-capitalize(-headings), remark-dropcap (use CSS `::first-letter`), rehype-auto-ads, rehype-scroll-to-top, rehype-annotate, remark-merge-data, remark-code-frontmatter, remark-smcat | niche, or already a few lines of CSS or a component |
| Vendor or chain specific | remark-corebc, remark-corepass, remark-fediverse-user, remark-cloudinary-docusaurus, remark-typedoc-symbol-links, rehype-katex-svelte | tied to one product |

Moved out of this list on a second pass:

- **remark-lint, remark-message-control, remark-normalize-headings, remark-first-heading, remark-title:** a PFM linter is valuable, just not as a plugin. See Quality.
- **remark-retext, rehype-retext:** these exist for prose linting (spelling, readability, inclusive language). See Quality.
- **rehype-meta, rehype-infer-\*-meta:** head tags are a template's job, but the data behind them is a real need. See Document data.
- **remark-code-blocks:** collecting a page's code blocks enables doc tests. See Code.

---

## 3. Keepers, grouped by concern

Twelve concerns. Each lists the state its features share, which is what makes them one concern.

### 3.1 Navigation

Getting around within a page. **Shared state:** one slug registry, so ids, anchors, the TOC and anchor validation always agree.

| Feature | Plugins (downloads/mo) | Delivery | Notes |
| --- | --- | --- | --- |
| **Heading ids** | rehype-slug (17.6M) | `core` option | Decided: a core option, off by default. The slug code lives inside the private `@mdsvex/plugin-autolink` today. |
| **Heading anchors** | rehype-autolink-headings (9.9M) | `plugin` (exists) | Two styles: wrap the content (autolink today), or prepend an `aria-hidden` anchor (the site's `heading_anchors`). |
| **TOC as data** | remark-toc (1.4M), @stefanprobst/rehype-extract-toc (287k), @vcarl/remark-headings (123k), rehype-toc (44k), remark-flexible-toc (15k) | `plugin+API` (write metadata) | Exports `metadata.headings` as a tree for a template to render. Don't inject HTML. |
| **Sectionize** | remark-sectionize (184k), rehype-section(ize) | `plugin+API` (`wrap_from`) | Wraps each heading and the content after it in `<section>`, for scroll-spy and CSS. |
| **Custom heading ids** | remark-heading-id (229k), remark-custom-header-id (42k), rehype-slug-custom-id (35k) | `core`, deferred | `{#id}` is out because `{}` belongs to Svelte. Deferred until it's clearly needed. It would use square brackets, like directives. |

### 3.2 Resolution

Turning paths and URLs into the right module or route. **Shared state:** the document's file path, Vite's resolver, and one decision per URL: internal (rewrite, import, validate) or external (apply link policy). The same mechanism as `src=` in `design/code-modules.md`, so most of this belongs in the Vite plugin, with options only for policy.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **External link policy** | rehype-external-links (10M) | `plugin` today, Vite option later | `rel`, `target`, an optional icon, and screen-reader text for "opens in a new tab". |
| **Relative images become imports** | no direct equivalent; remark-embed-images (39k), remark-copy-linked-files (2k), rehype-inline-svg and rehype-svgo are workarounds | `vite` | `![](./a.png)` → `import a from './a.png'`, so Vite hashes and optimises it. `?inline` and `?raw` cover the SVG cases. Pairs with `@sveltejs/enhanced-img`. |
| **Image size and loading** | rehype-img-size (32k), rehype-plugin-image-native-lazy-loading (11k), rehype-picture, rehype-resolution | `vite` | Intrinsic `width` and `height` (#611), `loading=lazy`, `decoding=async`, available once images are imports. |
| **Links to routes and the base path** | remark-link-rewrite (40k), rehype-urls (53k), rehype-url-inspector (8k), remark-prepend-url, remark-relative-links, remark-remove-url-trailing-slash, remark-img-links | `vite`, with a `rewrite(url, ctx)` option | `./guide.md` → `/guide`, SvelteKit `base`, trailing slashes (#389). One option replaces seven plugins. |

### 3.3 Composition

Building a page from several files. **Shared state:** the including document's slug registry, footnote counter and TOC. That's the gap today: importing a `.md` file as a component works, but the imported part keeps its own ids, footnotes and TOC. Two included parts that both have `## Install` give duplicate ids.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Transclusion** | @it-service-npm/remark-include, rehype-partials, Obsidian's `![[note]]` | `vite` + `core` (syntax) | Splices a fragment into the tree at compile time, so its headings join the page's TOC and slugs. A runtime component import stays the isolated option. Low download counts, because MDX users import components instead, but this is the only way to get one coherent TOC. Decided: do this last, and reuse existing constructs unless new syntax clearly earns its place. |
| **Heading shift** | remark-behead (19k), rehype-shift-heading (6k) | part of transclusion | The included part's `#` becomes `###` under an `##`. Only matters when composing, so it lives here, not under Navigation. |
| **Reusable snippets and variables** | remark-variables | covered | `{expr}`, Svelte imports and templates already do this. |

### 3.4 Presentation

How blocks render, and how authors style them. **Shared state:** none at runtime; this is the component layer. Delivery is mostly components, plus the few core defaults those components rely on.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Task lists** | part of remark-gfm (181M) | `core` | `- [x]`. The renderer already passes `checked` to a replaced `li`; only the parser is missing. |
| **Callouts and GitHub alerts** | remark-github-blockquote-alert (3.8M), remark-github-admonitions-to-directives (119k), remark-github-alerts (113k), rehype-callouts (92k), remark-hint, remark-obsidian-callout | `component` (`:::note`) + `core` (`> [!NOTE]`, deferred) | The alert syntax duplicates `:::note`, but it degrades well on GitHub (PFM principle 7). Deferred for now; it will probably be supported properly. |
| **Styling hooks** | rehype-class-names (1.4M), rehype-add-classes (35k) | `plugin` | Classes or attributes per element without writing a component, for example `table: { class: 'table' }` or `not-prose` on code. Today's API supports this. |
| **Unwrap lone images** | rehype-unwrap-images (404k), remark-unwrap-images (137k) | `core` option | Decided: a core option, off by default. A `<figure>` can't sit inside a `<p>`, so this has to come first. mdsvex already unwraps paragraphs made only of tags; check whether images count. |
| **Figure and caption** | @microflash/rehype-figure (80k), rehype-figure, remark-figure-caption, remark-captions, rehype-semantic-images | `component` (replaced `img`) | Works once images are unwrapped. Code fences already do this with `title` and `caption`. |
| **Details, kbd, ruby, badges** | remark-collapse (61k), remark-kbd(-plus), remark-ruby (4k), remark-directive-sugar (4k), remark-flexible-paragraphs | `component` | One starter kit: `:::details`, `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)`, `:badge[new]`. |
| **Structured containers: steps, tabs, accordions, code groups** | rehype-code-group (30k), expressive-code tabs | `plugin+API` (plugin-owned directives, `wrap_from`) + `component` | The plugin claims `:::steps`, supplies the component, and its bound handlers rewrite the headings inside into `step` directives. See `design/plugin-directives.md`. |
| **Static directives** | none | `vite` | Opt-in: render a directive's component at build time and write its HTML into the page, with holes for the label and children. No component code ships for it. Suits callouts, steps and badges. See `design/plugin-directives.md` §5. |
| **Embeds** | @remark-embedder/core (20k), remark-oembed, remark-youtube, remark-iframes | `component`, `plugin+API` (async) for oEmbed | `::youtube[](id=…)`. Fetching oEmbed at build time needs async. |
| **Media links** | rehype-video (180k), remark-images (59k) | `component` (replaced `a`, `img`) | A link to `.mp4` renders `<video>`. |
| **Definition lists** | remark-definition-list (818k), remark-deflist (61k) | `core`, or a `:::dl` component | |
| **Mark and insert** | remark-flexible-markers (143k), remark-ins (148k), remark-mark-highlight (61k) | `core` | `==mark==`, `++ins++`. Issue #721 is the component gap for plugin-made `mark`. |

### 3.5 Code

Showing code, and running it. **Shared state:** the fence meta conventions and snippet modules (`design/code-modules.md`).

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Code from a file** | remark-code-import (156k), remark-sources | `vite` | `src=./x.ts#L5-L20`. The file is tracked for HMR. |
| **Runnable blocks** | no remark equivalent; #832, #52, #432, #608 | `vite` | A `run` flag turns the fence into a virtual module, which the replaced `pre` gets as `module`. |
| **Copy button, frames, terminal chrome** | expressive-code (5.4M) | `component` | A reference `Pre.svelte`. |
| **Code tabs** | rehype-code-group (30k), expressive-code tabs | `plugin+API` + `component` | `:::tabs` around fences. One of the structured containers under Presentation. |
| **Doc tests** | remark-code-blocks (5.5k) | `vite` + `tooling` | Snippet modules are real modules, so a test runner could import every `run` block. Needs a snippet manifest. |
| **Color chips** | rehype-color-chips (19k) | `plugin` | Appends a swatch to `` `#e2551b` ``. |
| **TS → JS view** | remark-typescript | `vite` | Niche. With snippet modules, the compiled output is already available. |

### 3.6 Diagrams

A fence that renders as a picture. **Shared state:** the language-to-renderer table.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Mermaid** | rehype-mermaid (2.3M), remark-mermaidjs (20k), rehype-mermaidjs | `component` (client), `plugin+API` (async, build time) | Replace `pre` when the language is `mermaid`. Rendering at build time needs Playwright, so client rendering is the cheap path. |
| **Other engines** | remark-kroki (4k), remark-simple-plantuml, remark-refer-plantuml, rehype-graphviz-diagram | `component` | Same pattern. Low priority. |

### 3.7 Typography

How text reads. **Shared state:** one text-rewriting pass with conflict rules (smartypants and arrows both touch `--` and `->`), plus the document's language.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Smart punctuation** | remark-smartypants (17.7M) | `core` option | Decided: a core feature that can be toggled. Issue #825. |
| **Emoji shortcodes** | remark-emoji (8.8M), remark-gemoji (861k), remark-twemoji, rehype-twemojify, rehype-accessible-emojis (8k), remark-a11y-emoji | `plugin+API` (text rewrite) | `:tada:` doesn't clash with directives, because directives need `[`. Wrap each emoji in `role="img"` with a label. Load the emoji data only when the option is on. |
| **Typographic details** | remark-textr (193k), remark-typograf, remark-arrow (14k), remark-fix-guillemets (5k), rehype-widont, remark-plugin-autonbsp | `plugin+API` (text rewrite) | Arrows, guillemets, non-breaking spaces, widows. Locale-aware, so it needs the document's `lang` from frontmatter. |
| **CJK text** | remark-cjk-friendly (12.8M), …-gfm-strikethrough (10.5M), remark-join-cjk-lines, rehype-join-line | `core` check | Check that PFM's delimiter rules handle CJK punctuation, and that soft breaks between CJK characters don't render as spaces. |

### 3.8 Cross-references

Text that becomes a link to something else. **Shared state:** a table of patterns and a resolver per target.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **GitHub references** | remark-github (3.2M) | `plugin+API` (text rewrite) | `#123`, `@user`, commit SHAs. |
| **Mentions and regex linkify** | remark-mentions, remark-ping, remark-linkify-regex (9k), remark-truncate-links | `plugin+API` (text rewrite) | One pattern table covers these and remark-github. |
| **Wiki links** | remark-wiki-link (108k), remark-obsidian | `core` + resolver option | `[[Page]]`. The resolver is shared with Resolution's route rewriting. Decided: last, with transclusion. |

### 3.9 Reference apparatus

What technical and academic writing needs. **Shared state:** counters and labels: footnote numbers, figure, table, equation and section numbers, and citation keys.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Footnotes** | part of remark-gfm (181M), remark-numbered-footnote-labels, remark-footnotes-extra | `core` | GFM parity. The migrator passes them through raw today. |
| **Math** | remark-math (36M), rehype-katex (32M), rehype-mathjax (531k), @daiji256/rehype-mathml (4k), rehype-katex-notranslate (14k) | `core` + render option | Issue #302. Decided: Temml (MathML, no runtime JS) by default; KaTeX as an option, an optional peer dependency the user installs. Add `translate="no"`. Syntax: a `math` fence for display, `` $`…`$ `` inline. |
| **Numbering and cross-references** | not on the lists (pandoc-crossref is the reference) | `plugin+API` (metadata, text) | "Figure 3", numbered equations and sections, with `@fig:chart` style references that resolve to the number. |
| **Citations and bibliography** | rehype-citation (170k), @benrbray/remark-cite | `core` (`[@key]`) + `plugin+API` (async, metadata) | Loads BibTeX or CSL and renders a bibliography. |
| **Abbreviations and glossary** | remark-abbr (9k), @richardtowers/remark-abbr, remark-terms (3k) | `component` | `:abbr[HTML](title=…)`. A glossary could auto-link defined terms, which is Cross-references' pattern table again. |

### 3.10 Document data

Facts about a page, for templates, listings and `<svelte:head>`. **Shared state:** `metadata`, which frontmatter starts and plugins add to.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Reading time and word count** | remark-reading-time (1M), rehype-infer-reading-time-meta (3k) | `plugin+API` (write metadata) | |
| **Excerpt and description** | rehype-infer-description-meta (64k), rehype-truncate (7k) | `plugin+API` (write metadata) | First paragraph, or text up to `<!-- more -->`. |
| **Inferred title** | rehype-infer-title-meta, remark-title | `plugin+API` (write metadata) | The first `h1` when frontmatter has no `title`. |
| **Source info** | not on the lists (Astro's last-modified recipe is the reference) | `plugin+API` (file path) | Last modified from git, and the source path for an "Edit this page" link. |
| **Frontmatter transforms** | issue #831 | `core` hook | Defaults and derived fields. The hook the features above write through. |
| **Head tags** | rehype-meta (7k) | `component` (template) | The template renders `<svelte:head>` from `metadata`. |

### 3.11 Collections

Working with many documents at once: listing pages, feeds, search. remark has nothing here, because frameworks own it, but mdsvex users hit it constantly. The docs suggest `import.meta.glob(..., { eager: true })`, which pulls in every page's component code just to read its frontmatter.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Metadata-only imports** | none | `vite` | `import.meta.glob('./*.md', { query: '?metadata', eager: true })` returns `metadata` without the component. Underlies every listing, feed and sitemap. |
| **Plain text for search and feeds** | remark-strip-html (4k), remark-unlink | `vite` | `?text`, or a field on `?metadata`: the page as plain text by section, for search indexes (FlexSearch), RSS bodies and `llms.txt`. Pagefind indexes built HTML, so it doesn't need this. |
| **Tags, series, previous and next** | none | userland recipe | Built on `?metadata`. Document it rather than ship it. |

### 3.12 Quality

Catching mistakes before readers do. **Shared state:** a diagnostics channel with source positions, plus a cross-document index of files and anchors.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Link validation** | remark-validate-links (639k) | `plugin+API` (diagnostics) + Navigation's slugs and Resolution's resolver | Broken `#anchors` and file links at build time. |
| **PFM lint** | remark-lint (1.5M), remark-message-control (1.7M), remark-normalize-headings (119k), remark-first-heading | `tooling` | One `h1`, heading order, missing alt text, empty links. Lives in language-tools, so it shows in the editor. |
| **Prose lint** | remark-retext (652k), rehype-retext (209k) | `tooling` | Spelling, readability, inclusive language (retext-spell, retext-readability, alex). Could run retext plugins on the PFM text directly. |

---

## 4. Plugin API gaps

Resolution, Composition, Code and Collections moved to the Vite plugin, so they no longer depend on the parse-plugin API. `design/plugin-directives.md` covers the two directive rows.

| Missing capability | Unblocks |
| --- | --- |
| **Rewrite or split text** (replace a range with new text or nodes) | Typography (emoji, typographic details), Cross-references (GitHub refs, mentions, linkify), numbering |
| **Group siblings** (`wrap_from`: wrap a node and the siblings after it in a new parent) | sectionize, and the rewrites behind steps, tabs, accordions and code groups |
| **Plugin-owned directives** (a plugin supplies components, and handlers bound to a directive run only for the nodes inside it) | structured containers, and any kit that ships as one plugin |
| **Remove or replace nodes** | GitHub alerts if done as a plugin |
| **Read frontmatter and write metadata**, plus the file path | TOC data, Document data, numbering, citations, per-page options such as `toc: false` or `lang: ja` |
| **Async hooks**, or a pre-pass | bibliographies, oEmbed, build-time mermaid |
| **Diagnostics** (warnings with positions) | link validation, plus any plugin that wants to report errors |

---

## 5. Priority list

Ranked on usefulness to mdsvex users × popularity × cost. Items tagged `core` or `plugin+API` also depend on that work.

| # | Item | Concern | Delivery | Signal |
| --- | --- | --- | --- | --- |
| 1 | Heading ids | Navigation | core option | 17.6M |
| 2 | Heading anchors | Navigation | plugin, exists | 9.9M |
| 3 | External link policy | Resolution | plugin | 10M |
| 4 | Footnotes | Reference apparatus | core | remark-gfm 181M; migration blocker |
| 5 | Task lists | Presentation | core | remark-gfm 181M |
| 6 | Math | Reference apparatus | core | 36M + 32M; issue #302 |
| 7 | TOC as data | Navigation | plugin+API | ~1.9M combined |
| 8 | Relative images as imports, with size and loading | Resolution | vite | Svelte-specific; #611 |
| 9 | Smart punctuation | Typography | core option | 17.7M; issue #825 |
| 10 | Callouts and GitHub alerts | Presentation | component + core | ~4.2M combined |
| 11 | Emoji shortcodes | Typography | plugin+API | 9.7M |
| 12 | Styling hooks | Presentation | plugin | 1.4M |
| 13 | Reading time | Document data | plugin+API | 1M |
| 14 | Links to routes and the base path | Resolution | vite | ~150k combined; issue #389 |
| 15 | Metadata-only imports | Collections | vite | every blog and docs listing |
| 16 | Component starter kit (details, kbd, ruby, badges, embeds; steps and tabs need plugin-owned directives) | Presentation | component + plugin+API | replaces ~10 plugins |
| 17 | Mermaid | Diagrams | component | 2.3M |
| 18 | Unwrap lone images (core option), then figure and caption | Presentation | core + component | 540k + 90k |
| 19 | Code from a file (`src=`) | Code | vite | 156k |
| 20 | Runnable blocks (`run`) | Code | vite | issue #832 |
| 21 | Excerpt, inferred title, source info | Document data | plugin+API | 64k+ |
| 22 | Copy button and code tabs | Code | component + plugin+API | expressive-code 5.4M |
| 23 | Definition lists | Presentation | core / component | 818k |
| 24 | Link validation | Quality | plugin+API | 639k |
| 25 | GitHub refs, mentions, linkify | Cross-references | plugin+API | 3.2M |
| 26 | CJK check | Typography | core | 12.8M + 10.5M (inflated) |
| 27 | Transclusion with heading shift (last) | Composition | vite + core | low downloads, structural gap |
| 28 | PFM lint | Quality | tooling | remark-lint 1.5M |
| 29 | Mark and insert | Presentation | core | ~350k combined |
| 30 | Sectionize | Navigation | plugin+API | 184k |
| 31 | Custom heading id syntax (deferred) | Navigation | core | ~300k combined |
| 32 | Wiki links (last) | Cross-references | core | 108k |
| 33 | Plain text for search and feeds | Collections | vite | — |
| 34 | Citations and bibliography | Reference apparatus | core + plugin+API | 170k |
| 35 | Numbering and cross-references | Reference apparatus | plugin+API | — |
| 36 | Typographic details | Typography | plugin+API | ~200k combined |
| 37 | Prose lint | Quality | tooling | ~860k |
| 38 | Abbreviations and glossary | Reference apparatus | component | 12k |
| 39 | Media links | Presentation | component | 180k |
| 40 | Doc tests | Code | vite + tooling | — |
| 41 | Color chips | Code | plugin | 19k |
| 42 | Other diagram engines | Diagrams | component | low |
| 43 | TS → JS view | Code | vite | niche |

---

## 6. Decisions

Decided 2026-10-10:

- **Core defaults.** Heading ids and unwrapping lone images go into core, each behind an option. Probably off by default.
- **GitHub alerts.** Deferred for now. They will probably be supported properly.
- **Custom heading ids.** Deferred until it's certain they're needed. The syntax would use square brackets, like directives.
- **Transclusion and wiki links.** Done last. Transclusion should reuse existing constructs. New syntax only if its value is very strong.
- **Autolink literals.** Not supported. `<https://…>` already exists, and the shorthand adds little.
- **Smart punctuation.** A core feature that can be toggled.
- **Math output.** Temml by default: it's lighter, MathML support is now excellent, and it's the forward-looking choice. KaTeX is an option, shipped as an optional peer dependency that the user installs when they switch it on. This is the same pattern as twoslash.
- **Math syntax.** A `math` fence for display math, and `` $`…`$ `` (a code span wrapped in dollars) for inline math.
  - Both keep LaTeX raw, so `{}`, `\`, `_` and `^` need no escaping.
  - Both render natively on GitHub and GitLab.
  - The fence needs no parser work. The inline form is a small addition: sugar for a code span whose language is `math`.
  - Fence meta carries equation options, such as a label for numbering.
  - Not supported: plain `$…$` (ambiguous with currency and with Svelte's `{}`), `$$…$$` (a second way to write the fence; the migrator rewrites it), and directives (their text isn't raw).
  - A `latex` fence stays a code block that shows the source. Highlighting it needs a LaTeX grammar in twinkleplop.

Nothing is open.
