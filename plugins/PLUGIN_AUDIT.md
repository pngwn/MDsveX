# remark / rehype plugin audit

Sources: the official lists at `remarkjs/remark/doc/plugins.md` (~150 plugins) and `rehypejs/rehype/doc/plugins.md` (~135 plugins). The `awesome-remark` and `awesome-rehype` lists added nothing new. The survey also covers about 25 popular plugins that are missing from those lists, such as `rehype-pretty-code`, `rehype-mermaid` and `remark-reading-time`.

Popularity is **npm downloads for the month to 2026-10-09**. Some numbers are inflated by a single big dependent:

- `rehype-sanitize` and `rehype-raw` by react-markdown.
- `rehype-attr`, `rehype-ignore` and `rehype-rewrite` by @uiw/react-md-editor.
- `remark-cjk-friendly`, probably by one large tool.

**Status as of 2026-10-24.** The tables say what exists on `next` today: "exists" names the option or package, "in progress" is being built, and a row with neither is not built. The same answers, written for someone with a 0.x plugin list, are in the docs, in the section "Coming from remark and rehype plugins" of [`packages/site/src/routes/_docs.svtext`](../packages/site/src/routes/_docs.svtext).

## How this is organised

Features are grouped by **concern**: the job a user is trying to get done. That isn't the node type a feature touches, and it isn't how the feature gets built. Each feature has a separate **delivery** tag. A concern often spans several kinds of delivery. Footnotes, citations and numbering are one concern, for example, even though footnotes need parser syntax and numbering needs plugin API work.

| Delivery | Meaning |
| --- | --- |
| `core` | parser syntax, or a default in the renderer; plugins can't add syntax |
| `vite` | mdsvex's compiler and Vite plugin: anything that joins the module graph |
| `plugin` | a parse plugin that today's API supports |
| `plugin+API` | a parse plugin that needs an API capability from §4, which says which of those exist now |
| `component` | a directive or a replaced element already does it; ship components and docs |
| `tooling` | language-tools or a CLI: diagnostics, lint, editor features |

The parse-plugin API can annotate, retag, wrap, append and remove existing node kinds, add text nodes, group siblings (`wrap_from`), read the file path and the frontmatter, report warnings, and hand data back to the page (`plugin_data`). A plugin can bring directives and their components, and replace elements. A sequential plugin can rewrite text (`run.replace`). A plugin can wait: `ctx.defer` runs a task for a node, the `document` hook may be async, and `ctx.read` and `ctx.cached` load files, under `compile_async` and the Vite plugin. A plugin can't add syntax or write to `metadata`.

---

## 1. Filtered out: already supported

| Plugin(s) | Covered by |
| --- | --- |
| remark-directive, remark-directive-rehype, remark-generic-extensions, remark-container(s), remark-custom-blocks, remark-admonitions, remark-flexible-containers, remark-shortcodes, remark-hexo, remark-mdc, remark-align, rehype-semantic-blockquotes | generic directives with `(k=v)` args, turned into components |
| remark-attr, rehype-attr | rejected (`{}` belongs to Svelte); directive args replace them |
| remark-gfm (tables, strikethrough and task lists), remark-extended-table, remark-grid-tables, @adobe/remark-gridtables, rehype-merge-cells | GFM tables plus extended tables (`\|\|`, `\|>`, `\|^`), `~~strike~~`, `- [x]` |
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
| **Heading ids** | rehype-slug (17.6M) | `core` option, exists (`heading_ids`) | Off by default. GitHub's slugs, or a `slug` function. |
| **Heading anchors** | rehype-autolink-headings (9.9M) | `plugin`, exists (`@mdsvex/plugin-anchors`) | Three positions: wrap the content, or prepend or append an `aria-hidden` anchor. Needs `heading_ids`. |
| **TOC as data** | remark-toc (1.4M), @stefanprobst/rehype-extract-toc (287k), @vcarl/remark-headings (123k), rehype-toc (44k), remark-flexible-toc (15k) | `plugin`, exists (`@mdsvex/plugin-toc`) | Leaves the headings in `plugin_data.toc.headings` as a flat list, with a helper that nests it, a component and a `::toc` directive. `metadata` stays the frontmatter. |
| **Sectionize** | remark-sectionize (184k), rehype-section(ize) | `plugin`, a recipe in the docs (`wrap_from` exists), no package | Wraps each heading and the content after it in `<section>`, for scroll-spy and CSS. |
| **Custom heading ids** | remark-heading-id (229k), remark-custom-header-id (42k), rehype-slug-custom-id (35k) | `core`, deferred | `{#id}` is out because `{}` belongs to Svelte. Deferred until it's clearly needed. It would use square brackets, like directives. |

### 3.2 Resolution

Turning paths and URLs into the right module or route. **Shared state:** the document's file path, Vite's resolver, and one decision per URL: internal (rewrite, import, validate) or external (apply link policy). The same mechanism as `src=` in `design/code-modules.md`, so most of this belongs in the Vite plugin, with options only for policy.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **External link policy** | rehype-external-links (10M) | `plugin`, exists (`@mdsvex/plugin-external-links`), Vite option later | `rel`, `target`, an optional icon, and a screen-reader label for "opens in a new tab". |
| **Relative images become imports** | no direct equivalent; remark-embed-images (39k), remark-copy-linked-files (2k), rehype-inline-svg and rehype-svgo are workarounds | `vite`, exists (`import_images`, on by default) | `![](./a.png)` → `import a from './a.png'`, so Vite hashes and optimises it. `?inline` and `?raw` cover the SVG cases. Pairs with `@sveltejs/enhanced-img`. |
| **Image size and loading** | rehype-img-size (32k), rehype-plugin-image-native-lazy-loading (11k), rehype-picture, rehype-resolution | `vite`, not built | Intrinsic `width` and `height` (#611), `loading=lazy`, `decoding=async`. Images are imports now, so a replaced `img` can do this today with `?enhanced`. |
| **Links to routes and the base path** | remark-link-rewrite (40k), rehype-urls (53k), rehype-url-inspector (8k), remark-prepend-url, remark-relative-links, remark-remove-url-trailing-slash, remark-img-links | `vite`, exists (`links: { routes, base }` and `rewrite(url, ctx)`) | `./guide.md` → `/guide`, SvelteKit `base`, trailing slashes (#389). Two options replace seven plugins. |

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
| **Task lists** | part of remark-gfm (181M) | `core`, exists | `- [x]`. A replaced `li` gets `checked`. |
| **Callouts and GitHub alerts** | remark-github-blockquote-alert (3.8M), remark-github-admonitions-to-directives (119k), remark-github-alerts (113k), rehype-callouts (92k), remark-hint, remark-obsidian-callout | `component` (`:::note`) + `core` (`> [!NOTE]`, deferred) | The alert syntax duplicates `:::note`, but it degrades well on GitHub (PFM principle 7). Deferred for now; it will probably be supported properly. |
| **Styling hooks** | rehype-class-names (1.4M), rehype-add-classes (35k) | `plugin`, a recipe in the docs, no package | Classes or attributes per element without writing a component, for example `table: { class: 'table' }` or `not-prose` on code. Three lines of `parse_plugins`. |
| **Unwrap lone images** | rehype-unwrap-images (404k), remark-unwrap-images (137k) | `core` option, exists (`unwrap_images`) | Off by default. A `<figure>` can't sit inside a `<p>`, so this comes before figures. |
| **Figure and caption** | @microflash/rehype-figure (80k), rehype-figure, remark-figure-caption, remark-captions, rehype-semantic-images | `component`, exists (`figures()` in `@mdsvex/plugin-kit`) | `:::figure[Caption](id=fig:x)` around an image, a code block, a table or anything else renders a `<figure>` with the bracket text as its caption. The `id` is optional and stays on the element. It is the one way to make a figure: a lone image stays an image, unwrapped by `unwrap_images`. A numbering plugin numbers a figure through plugin data, which the component reads from Svelte context. Code fences also take `title` and `caption`. |
| **Details, kbd, ruby, badges** | remark-collapse (61k), remark-kbd(-plus), remark-ruby (4k), remark-directive-sugar (4k), remark-flexible-paragraphs | `component`, exists (`kit()` in `@mdsvex/plugin-kit`) | One starter kit: `:::details`, `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)`, `:badge[new](tone=tip)`. No script, each works without JavaScript. |
| **Structured containers: steps, tabs, accordions, code groups** | rehype-code-group (30k), expressive-code tabs | `plugin+API` (plugin-owned directives, `wrap_from`) + `component`; all exist (`@mdsvex/plugin-steps`, `@mdsvex/plugin-tabs`, and accordions in `kit()` of `@mdsvex/plugin-kit`) | The plugin claims `:::steps`, supplies the component, and its bound handlers rewrite the headings inside into `step` directives. See `design/plugin-directives.md`. An accordion item is a native `<details>`, and `(name=…)` keeps one open at a time. |
| **Static directives** | none | `vite` | Opt-in: render a directive's component at build time and write its HTML into the page, with holes for the label and children. No component code ships for it. Suits callouts, steps and badges. See `design/plugin-directives.md` §5. |
| **Embeds** | @remark-embedder/core (20k), remark-oembed, remark-youtube, remark-iframes | `component`, exists for YouTube and Vimeo (`kit()` in `@mdsvex/plugin-kit`); `plugin` for oEmbed, not built | `::youtube[Title](id=…)` and `::vimeo[Title](id=…)`, lazy frames named by their label. Fetching oEmbed at build time is a deferred task now that plugins can wait. |
| **Media links** | rehype-video (180k), remark-images (59k) | `component` (replaced `a`, `img`) | A link to `.mp4` renders `<video>`. |
| **Definition lists** | remark-definition-list (818k), remark-deflist (61k) | `core`, or a `:::dl` component | |
| **Mark and insert** | remark-flexible-markers (143k), remark-ins (148k), remark-mark-highlight (61k) | `core` | `==mark==`, `++ins++`. Issue #721 is the component gap for plugin-made `mark`. |

### 3.5 Code

Showing code, and running it. **Shared state:** the fence meta conventions and snippet modules (`design/code-modules.md`).

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Code from a file** | remark-code-import (156k), remark-sources | `vite`, exists (`src=`) | `src=./x.ts#L5-L20`. The file is tracked for HMR. The migrator renames `file=`. |
| **Runnable blocks** | no remark equivalent; #832, #52, #432, #608 | `vite`, exists (`run`, `run=client`) | The flag turns the fence into a module of the Vite graph, which the replaced `pre` gets as `module`, or as `load` for `run=client`. |
| **Copy button, frames, terminal chrome** | expressive-code (5.4M) | `component`; the copy button exists (`code_blocks()` in `@mdsvex/plugin-kit`), frames and terminal chrome do not | A replaced `pre` with an announced copy button, the title and the caption, exported as `Pre.svelte` to build on. |
| **Code tabs** | rehype-code-group (30k), expressive-code tabs | `plugin+API` + `component`, exists (`@mdsvex/plugin-tabs`) | `:::tabs` around fences. One of the structured containers under Presentation. |
| **Doc tests** | remark-code-blocks (5.5k) | `vite` + `tooling`, not built | Snippet modules are real modules, so a test runner could import every `run` block. `compile()` already lists them as `snippets`. |
| **Color chips** | rehype-color-chips (19k) | `plugin` | Appends a swatch to `` `#e2551b` ``. |
| **TS → JS view** | remark-typescript | `vite` | Niche. With snippet modules, the compiled output is already available. |

### 3.6 Diagrams

A fence that renders as a picture. **Shared state:** the language-to-renderer table.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Mermaid** | rehype-mermaid (2.3M), remark-mermaidjs (20k), rehype-mermaidjs | `plugin` + `component`, exists on the client (`mermaid()` in `@mdsvex/plugin-kit`); at build time not built | Each `mermaid` fence is wrapped in a `mermaid` directive rather than a replaced `pre`, so it renders through any `pre` as the fallback. The library loads lazily on the client and is an optional peer dependency. Rendering at build time could be a deferred task, but needs a headless browser. |
| **Other engines** | remark-kroki (4k), remark-simple-plantuml, remark-refer-plantuml, rehype-graphviz-diagram | `component` | Same pattern. Low priority. |

### 3.7 Typography

How text reads. **Shared state:** one text-rewriting pass with conflict rules (smartypants and arrows both touch `--` and `->`), plus the document's language.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Smart punctuation** | remark-smartypants (17.7M) | `core` option, exists (`smart_punctuation`) | Off by default, 0.x had it on, and the migrator turns it on. Issue #825. |
| **Emoji shortcodes** | remark-emoji (8.8M), remark-gemoji (861k), remark-twemoji, rehype-twemojify, rehype-accessible-emojis (8k), remark-a11y-emoji | `plugin`, exists (`@mdsvex/plugin-emoji`) | `:tada:` doesn't clash with directives, because directives need `[`. The `label` option wraps each emoji in `role="img"` with a label, typed emoji included. The table is gemoji's, built into the package, and the descriptions are only read when `label` is on. No emoticons and no image sets. |
| **Typographic details** | remark-textr (193k), remark-typograf, remark-arrow (14k), remark-fix-guillemets (5k), rehype-widont, remark-plugin-autonbsp | `plugin+API` (text rewrite) | Arrows, guillemets, non-breaking spaces, widows. Locale-aware, so it needs the document's `lang` from frontmatter. |
| **CJK text** | remark-cjk-friendly (12.8M), …-gfm-strikethrough (10.5M), remark-join-cjk-lines, rehype-join-line | `core`, the delimiter half exists | PFM's delimiter rules take Unicode punctuation, and Han, kana and hangul as a boundary. A soft break between two CJK characters still renders as a space. |

### 3.8 Cross-references

Text that becomes a link to something else. **Shared state:** a table of patterns and a resolver per target.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **GitHub references** | remark-github (3.2M) | `plugin`, exists (`@mdsvex/plugin-references`) | `#123`, `owner/repo#123`, `@user`, commit SHAs. The urls are templates, GitHub's by default. No `GH-123`, no `user@sha`, and nothing is checked against the host. |
| **Mentions and regex linkify** | remark-mentions, remark-ping, remark-linkify-regex (9k), remark-truncate-links | `plugin`, exists (`@mdsvex/plugin-references`) for mentions and bare urls | The `mention` template covers remark-mentions and remark-ping. `linkify` makes links of bare `https://` and `www.` urls, which the parser never does. A pattern table of the user's own (remark-linkify-regex) and truncated link text are not built. |
| **Wiki links** | remark-wiki-link (108k), remark-obsidian | `core` + resolver option | `[[Page]]`. The resolver is shared with Resolution's route rewriting. Decided: last, with transclusion. |

### 3.9 Reference apparatus

What technical and academic writing needs. **Shared state:** counters and labels: footnote numbers, figure, table, equation and section numbers, and citation keys.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Footnotes** | part of remark-gfm (181M), remark-numbered-footnote-labels, remark-footnotes-extra | `core`, exists | GFM parity, with blocks in a definition and `footnote` and `footnotes` components. A reference with no definition fails the build. The migrator writes GFM footnotes as PFM ones. |
| **Math** | remark-math (36M), rehype-katex (32M), rehype-mathjax (531k), @daiji256/rehype-mathml (4k), rehype-katex-notranslate (14k) | `core` + render option, exists (`math`) | Issue #302. Temml (MathML, no runtime JS) by default; KaTeX as an option, an optional peer dependency the user installs. `translate="no"` is set. Syntax: a `math` fence for display, `` $`…`$ `` inline. The migrator rewrites `$…$` with `math: true`. |
| **Numbering and cross-references** | not on the lists (pandoc-crossref is the reference) | `plugin+API` (metadata, text) | "Figure 3", numbered equations and sections, with `@fig:chart` style references that resolve to the number. |
| **Citations and bibliography** | rehype-citation (170k), @benrbray/remark-cite | `plugin`, exists (`@mdsvex/plugin-citations`) | Loads BibTeX or CSL and renders a bibliography. Here `:cite[key]` (an inline directive, no new syntax) and `::bibliography`, from a CSL JSON file read in a deferred task and shared with `ctx.cached`, numeric or author-date. BibTeX is not read. |
| **Abbreviations and glossary** | remark-abbr (9k), @richardtowers/remark-abbr, remark-terms (3k) | `component` | `:abbr[HTML](title=…)`. A glossary could auto-link defined terms, which is Cross-references' pattern table again. |

### 3.10 Document data

Facts about a page, for templates, listings and `<svelte:head>`. **Shared state:** `metadata`, which frontmatter starts and plugins add to.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Reading time and word count** | remark-reading-time (1M), rehype-infer-reading-time-meta (3k) | `plugin`, exists (`@mdsvex/plugin-page-data`) | `plugin_data.page.words` and `minutes`. Prose only, counted as `reading-time` counts. |
| **Excerpt and description** | rehype-infer-description-meta (64k), rehype-truncate (7k) | `plugin`, exists (`@mdsvex/plugin-page-data`) | First paragraph, or text up to `<!-- more -->`. Plain text only, a parse plugin has no rendered HTML. |
| **Inferred title** | rehype-infer-title-meta, remark-title | `plugin`, exists (`@mdsvex/plugin-page-data`) | The first `h1` when frontmatter has no `title`. It goes in `plugin_data`, never in `metadata`. |
| **Source info** | not on the lists (Astro's last-modified recipe is the reference) | `plugin`, exists (`@mdsvex/plugin-page-data`, `edit_url` and `last_modified`) | Last modified from git, and the source path for an "Edit this page" link. Last modified is read in an async document hook, from one `git log` for the repository, the file system, or a function. |
| **Frontmatter transforms** | issue #831 | `core` hook, not built | Defaults and derived fields. The features above went to `plugin_data` in its place, so `metadata` is always exactly the frontmatter. |
| **Head tags** | rehype-meta (7k) | `component` (template) | The template renders `<svelte:head>` from `metadata`. |

### 3.11 Collections

Working with many documents at once: listing pages, feeds, search. remark has nothing here, because frameworks own it, but mdsvex users hit it constantly. The docs suggest `import.meta.glob(..., { eager: true })`, which pulls in every page's component code just to read its frontmatter.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Metadata-only imports** | none | `vite`, exists (`?metadata`, and `?data` for plugin data) | `import.meta.glob('./*.md', { query: '?metadata', eager: true })` returns `metadata` without the component. Underlies every listing, feed and sitemap. |
| **Plain text for search and feeds** | remark-strip-html (4k), remark-unlink | `vite`, not built | `?text`, or a field on `?metadata`: the page as plain text by section, for search indexes (FlexSearch), RSS bodies and `llms.txt`. Pagefind indexes built HTML, so it doesn't need this. |
| **Tags, series, previous and next** | none | userland recipe | Built on `?metadata`. Document it rather than ship it. |

### 3.12 Quality

Catching mistakes before readers do. **Shared state:** a diagnostics channel with source positions, plus a cross-document index of files and anchors.

| Feature | Plugins | Delivery | Notes |
| --- | --- | --- | --- |
| **Link validation** | remark-validate-links (639k) | `plugin` (`ctx.warn` exists) + Navigation's slugs and Resolution's resolver, not built | Broken `#anchors` and file links at build time. |
| **PFM lint** | remark-lint (1.5M), remark-message-control (1.7M), remark-normalize-headings (119k), remark-first-heading | `tooling` | One `h1`, heading order, missing alt text, empty links. Lives in language-tools, so it shows in the editor. |
| **Prose lint** | remark-retext (652k), rehype-retext (209k) | `tooling` | Spelling, readability, inclusive language (retext-spell, retext-readability, alex). Could run retext plugins on the PFM text directly. |

---

## 4. Plugin API capabilities

Resolution, Composition, Code and Collections moved to the Vite plugin, so they no longer depend on the parse-plugin API. `design/plugin-directives.md` covers the two directive rows.

| Capability | Status | Unblocks |
| --- | --- | --- |
| **Rewrite or split text** (replace a range with new text or nodes) | exists (the `text` handler of a sequential plugin and `run.replace`, see `design/plugin-text.md`) | Typography (emoji, typographic details), Cross-references (GitHub refs, mentions, linkify), numbering |
| **Group siblings** (`wrap_from`: wrap a node and the siblings after it in a new parent) | exists | sectionize, and the rewrites behind steps, tabs, accordions and code groups |
| **Plugin-owned directives** (a plugin supplies components, and handlers bound to a directive run only for the nodes inside it) | exists (the `plugins` option) | structured containers, and any kit that ships as one plugin |
| **Remove or replace nodes** | exists (`node.remove()`, and writing `node.type`) | GitHub alerts if done as a plugin |
| **Read frontmatter**, plus the file path | exists (`ctx.frontmatter`, `ctx.filename`) | per-page options such as `toc: false` or `lang: ja` |
| **Hand data back** | exists (`ctx.data`, exported as `plugin_data`). Nothing writes to `metadata` | TOC data, Document data, numbering |
| **Diagnostics** (warnings with positions) | exists (`ctx.warn`) | link validation, plus any plugin that wants to report errors |
| **A document hook** (run once with the whole tree) | exists (`document(root, ctx)`, which may be async). The page data plugin reads the document there | anything that reads the whole document |
| **Async hooks**, or a pre-pass | exists (`ctx.defer` for work on a node, an async `document` hook, `ctx.read` and `ctx.cached` for files, `compile_async`) | bibliographies and citations (exist), oEmbed, build-time mermaid, last modified dates (exists) |

---

## 5. Priority list

Ranked on usefulness to mdsvex users × popularity × cost. Items tagged `core` or `plugin+API` also depend on that work. A row without "exists" or "in progress" is not built.

| # | Item | Concern | Delivery | Signal |
| --- | --- | --- | --- | --- |
| 1 | Heading ids | Navigation | core option, exists | 17.6M |
| 2 | Heading anchors | Navigation | plugin, exists | 9.9M |
| 3 | External link policy | Resolution | plugin, exists | 10M |
| 4 | Footnotes | Reference apparatus | core, exists | remark-gfm 181M; migration blocker |
| 5 | Task lists | Presentation | core, exists | remark-gfm 181M |
| 6 | Math | Reference apparatus | core, exists | 36M + 32M; issue #302 |
| 7 | TOC as data | Navigation | plugin, exists | ~1.9M combined |
| 8 | Relative images as imports, with size and loading | Resolution | vite, imports exist, size and loading do not | Svelte-specific; #611 |
| 9 | Smart punctuation | Typography | core option, exists | 17.7M; issue #825 |
| 10 | Callouts and GitHub alerts | Presentation | component + core | ~4.2M combined |
| 11 | Emoji shortcodes | Typography | plugin, exists | 9.7M |
| 12 | Styling hooks | Presentation | plugin, a recipe in the docs | 1.4M |
| 13 | Reading time | Document data | plugin, exists | 1M |
| 14 | Links to routes and the base path | Resolution | vite, exists | ~150k combined; issue #389 |
| 15 | Metadata-only imports | Collections | vite, exists | every blog and docs listing |
| 16 | Component starter kit (details, kbd, ruby, badges, embeds, accordions; steps and tabs are plugins of their own) | Presentation | component + plugin+API, exists (`@mdsvex/plugin-kit`) | replaces ~10 plugins |
| 17 | Mermaid | Diagrams | plugin + component, exists on the client | 2.3M |
| 18 | Unwrap lone images, then figure and caption | Presentation | core + component, both exist | 540k + 90k |
| 19 | Code from a file (`src=`) | Code | vite, exists | 156k |
| 20 | Runnable blocks (`run`) | Code | vite, exists | issue #832 |
| 21 | Excerpt, inferred title, source info | Document data | plugin, exists | 64k+ |
| 22 | Copy button and code tabs | Code | component + plugin+API, both exist (`@mdsvex/plugin-kit`, `@mdsvex/plugin-tabs`) | expressive-code 5.4M |
| 23 | Definition lists | Presentation | core / component | 818k |
| 24 | Link validation | Quality | plugin+API | 639k |
| 25 | GitHub refs, mentions, linkify | Cross-references | plugin, exists | 3.2M |
| 26 | CJK check | Typography | core, delimiters done, line joining not | 12.8M + 10.5M (inflated) |
| 27 | Transclusion with heading shift (last) | Composition | vite + core | low downloads, structural gap |
| 28 | PFM lint | Quality | tooling | remark-lint 1.5M |
| 29 | Mark and insert | Presentation | core | ~350k combined |
| 30 | Sectionize | Navigation | plugin, a recipe in the docs | 184k |
| 31 | Custom heading id syntax (deferred) | Navigation | core | ~300k combined |
| 32 | Wiki links (last) | Cross-references | core | 108k |
| 33 | Plain text for search and feeds | Collections | vite | — |
| 34 | Citations and bibliography | Reference apparatus | plugin, exists | 170k |
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

- **Core defaults.** Heading ids and unwrapping lone images go into core, each behind an option. Both are built, and off by default.
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

Decided 2026-10-24:

- **The component kit is one package.** `@mdsvex/plugin-kit` holds the starter kit, figures, the copy button and Mermaid, one plugin function each (`kit()`, `figures()`, `code_blocks()`, `mermaid()`). Each new package needs a trusted publishing setup before its first release, and these components are small. A function per concern keeps a site's `pre` its own until it asks, and only `mermaid()` reaches the Mermaid library.
- **Mermaid wraps the fence instead of replacing `pre`.** A site has one `pre`, so a Mermaid `pre` would fight the site's own and the copy button.
- **A figure is the `:::figure[Caption](id=…)` directive of the kit, and only that.** It holds an image or anything else, the id is optional, and a lone image with a title is not a figure. A numbering plugin numbers a figure whose id it knows by writing the number to its plugin data, and the kit's component puts it in front of the caption.

Nothing is open.
