# The 1.0 docs: audit and plan

Status: decided, 2026-11-01. pngwn answered every open question the same day, see [Decisions](#decisions-2026-11-01). Research and planning only, nothing in the docs or the library was changed. Written against `next` at `09100bf0`, with the deployed preview at https://859965ee.mdsvex.pages.dev/docs read alongside it.

## Summary

- **The docs today are one page.** `/docs` is a single 4,487 line file, [`packages/site/src/routes/_docs.svtext`](../../packages/site/src/routes/_docs.svtext), about 189k characters rendered, with a hand-kept sidebar in [`routes/docs/+page.svelte`](../../packages/site/src/routes/docs/+page.svelte). Its prose is accurate, current and precise, close to reference grade. The problem is shape, not quality.
- **It is almost all reference.** There is no tutorial, the how-to guides are hidden inside reference sections, the plugin authoring guide sits under "Options", and the reasons behind the design live in `design/*.md`, which no reader of the site will find.
- **The site does not use mdsvex.** It compiles the `.svtext` with `compile()` and injects it with `{@html}` ([`vite.config.js`](../../packages/site/vite.config.js)). So the docs can't use a component, a directive, a plugin or a live example, and every "you get" block is hand-written HTML that can drift from what the compiler gives.
- **The biggest gaps:** streaming and incremental parsing (mentioned seven times, explained nowhere), the editor tooling (VS Code and the language server have no docs at all), the tree builder and renderers below `compile`, the playground (linked, never described), and a first-hour path for someone new to PFM.
- **Recommendation:** five sections that follow pngwn's reader goals, *Learn*, *Guides*, *Plugins*, *Reference* and *Internals*, with the playground as a sixth that every page can open into. Details in [Recommendation](#5-recommendation).

## Decisions, 2026-11-01

pngwn's answers to the [open questions](#6-open-questions-for-pngwn), and to the wire format question the first answers raised. The recommendation and the order of work below already include them.

| # | question | decision | what it changes in the plan |
| --- | --- | --- | --- |
| 1 | Is streaming public? | **Yes, public and documented at 1.0, as one use case, not the headline.** | Guides gets "Render markdown as it arrives". Internals gets the API pages. "What mdsvex is" mentions streaming in a line, it does not lead with it. |
| 2 | Which lower layers are public? | **A small named surface:** batch parse, `PFMParser` (`init`, `feed`, `finish`), `Cursor`, `CursorHTMLRenderer`, `ComponentRenderer`, `PluginStream`. READMEs for `@mdsvex/parse` and `@mdsvex/render`, and the exports maps stop exposing internals. | The proposed surface is [below](#the-public-surface-of-mdsvexparse-and-mdsvexrender). Making it real is a code task for later, and the Internals API pages wait for it. |
| 3 | Editor tooling at 1.0? | **Follow the ship plan:** a full VS Code page, Prettier in the sidebar, a short "Other editors" page for the language server and tree-sitter. | Guides → Editor is three pages of unequal depth. |
| 4 | Dogfood the docs? | **Yes, as step one,** `.svx` routes through the Vite plugin, in the same pass as the split and before any new writing. | Step 1 of the [order of work](#order-of-work) is split and dogfood together. |
| 5 | One home for plugin docs? | **The site is canonical.** Each README keeps install, a one-line example and a link to the site. | Step 1 also trims the 16 plugin READMEs once their site pages exist. |
| 6 | 0.x docs? | **pngwn sets up a v0 subdomain.** The migration guide links to it. | One link in the migration guide; nothing else in 1.0 mentions 0.x docs. |
| 7 | Embeds and weight? | **Embeds render statically and start the worker on first interaction.** | Level 2 of [the interactive parts](#how-the-interactive-parts-join-the-prose) costs nothing until a reader edits. |
| 8 | Plugins in the playground? | **The worker loads first-party plugins on demand** when the config names them. | Every plugin page can open its example in the playground. |
| 9 | PFM as its own language? | **PFM is mdsvex's markdown.** Learn teaches it, the full spec is a Reference page, not a top-level entry. | As recommended. |
| 10 | Design notes? | **Edit the chosen ones into Internals explanation pages, keep the decision records private.** | The picks are [below](#design-notes-to-publish). |
| 11 | The small things | **Document `wrap_static`, `default_template` and `BundleDirective.static`** (`static` will exist at launch). **`@mdsvex/migrate` gets a small CLI**, `npx @mdsvex/migrate`, and the migration guide becomes one command and a checklist. | Reference covers the three. The migration guide waits for the CLI. |
| 12 | Is the wire format public? (asked after the first eleven) | **Internal at 1.0, review later.** `WireEmitter`, `WireTreeBuilder` and `WIRE_FORMAT.md` stay internal. | They go to `./internal`; `WIRE_FORMAT.md` stays a contributor document and Internals has no wire format page. Listed under [open items](#open-items). |

### The public surface of `@mdsvex/parse` and `@mdsvex/render`

What I'd propose for decision 2. The six names pngwn listed, plus the few things each one can't be used without, which are marked **needed**.

**`@mdsvex/parse`, root entry:**

| export | kind | why |
| --- | --- | --- |
| `parse_markdown_svelte(source, options)` | function | batch parse, returns `{ nodes, errors, source, warnings, data }` |
| `PFMParser` | class | incremental parse. Public methods: `parse`, `init`, `feed`, `finish`, `release`. `bind`, `skip_ids` and `parse_normalized` stay internal (they are today, by comment only) |
| `TreeBuilder` | class, **needed** | the emitter that builds a `NodeBuffer`. Without it `PFMParser` produces nothing a reader can use, and `Cursor` has nothing to read. Today it is only at `./tree-builder` |
| `Cursor` | class | walks a buffer. Today only at `./cursor`. Its header comment uses the old lowercase names and needs fixing with the README |
| `NodeKind` | **needed** | what `Cursor.kind` is compared with. It is a `const enum` today, which a consumer with `isolatedModules` can't read across a package boundary; a plain frozen object or a `kind_name()` helper would fix that |
| `ParseStallError` | error class | a parse that stops moving, documented already |
| types: `ParseOptions`, `ParseResult`, `NodeBuffer`, `Emitter` | types | `Emitter` lets someone write their own consumer of the opcodes, which is how streaming over a wire works |

**`@mdsvex/render`, entries:**

| entry | export | why |
| --- | --- | --- |
| `.` | `CursorHTMLRenderer`, with the option types it takes (`CodeHighlighter`, `SmartPunctuationOptions`, `TemplateWrapper`) | the string renderer `compile` uses |
| `.` | `ComponentRenderer`, `ComponentBlock` | live render of a buffer |
| `./Node.svelte` | the component, **needed** | `ComponentRenderer` gives block indices, `Node.svelte` renders them; one is no use without the other |
| `./stream` | `PluginStream`, `PluginStreamOptions`, `PLUGIN_DATA`, `LiveData`, `PluginDataContext` | plugins over a stream; components read live plugin data through `PLUGIN_DATA` |
| `./sourcemap` | `mappings_to_v3` and the `SourceMapV3` type | the docs already point hosts at it ("Without Vite") |

**What stops being exported:**

- From the `@mdsvex/parse` root: `StateKind`, `take_src`, `take_collapsed`, `normalize_newlines`, `raw_offsets`, `RawOffsets`, `PluginDispatcher`, `has_directive_handlers`, `PluginCache`, `SourceTextSource`, `WireTextSource`, `HeadingIds`, `WireEmitter`, `WireOp`, and the plugin error classes and plugin types (plugin authors get those from `mdsvex`, as the plugin convention already says).
- The `@mdsvex/parse` subpaths `./opcodes`, `./utils`, `./buf-utils`, `./tree-builder` (moves to the root), `./cursor` (moves to the root) and `./wire-tree-builder`.
- From the `@mdsvex/render` root: `_emit`, `_node`, `_children`, `_resolve_mappings`, `_out_offsets`, `MapSink`, `escape`, `NONE`, the `K_*` constants, the `CI_*` constants and mapping types, `build_line_starts`, `offset_to_position`, `records_to_v3`, `trace_to_v3`, `trace_to_decoded`, `mapped_source_lines`.
- The `@mdsvex/render` subpaths `./html-cursor`, `./component` (moves to the root) and `./mappings`.

**The catch: the workspace imports these.** `mdsvex`, the language tools and the REPL import from `@mdsvex/parse/tree-builder`, `/utils`, `/wire-tree-builder`, `/buf-utils`, `@mdsvex/render/html-cursor` and `/mappings` about 150 times. They need a way in that users don't get. The least churn is one `./internal` subpath on each package, carrying everything above, unlisted in the READMEs and with no semver promise. The code task should check whether `mdsvex`'s own build bundles `@mdsvex/parse` (it did when last measured), since then only the language tools and the REPL need it.

**The wire format stays internal (decision 12).** `WireEmitter`, `WireTreeBuilder` and `WireOp` go to `./internal` with everything else above, and `WIRE_FORMAT.md` stays a contributor document. It is the way to stream a parse to another process, such as a server sending a model's output to a client, so pngwn will review it later.

### Open items

| item | state |
| --- | --- |
| the wire format as a public `./wire` entry, with an Internals page from `WIRE_FORMAT.md` | **review later** (decision 12). Internal at 1.0 |

### Design notes to publish

For decision 10, the notes worth editing into Internals pages, and the ones to leave private.

| page in Internals | from | why a reader wants it |
| --- | --- | --- |
| Architecture: from source to component | [`design/vite-coupling.md`](../vite-coupling.md), [`language-tools/ARCHITECTURE.md`](../../language-tools/ARCHITECTURE.md) | what `compile` does, what the Vite plugin adds, where the editor sits |
| One grammar for every container | [`design/parser-structure.md`](../parser-structure.md) | why a table or an `{#if}` is the same thing in a list item as at the top; the rule a reader relies on most |
| How plugins run | [`design/plugin-directives.md`](../plugin-directives.md), [`design/plugin-async.md`](../plugin-async.md), [`design/plugin-text.md`](../plugin-text.md) | open and close, pending and revoke, one owner per directive, why tasks only change their own node. The explanation behind the plugin API |
| How a document becomes a component | [`design/templates-and-components.md`](../templates-and-components.md) | hoisting, precedence, why export names are read without running a module |
| Code blocks as modules | [`design/code-modules.md`](../code-modules.md) | why a `run` block is a real module and what that means for HMR and CSP |
| Highlighting and braces | [`design/syntax-highlighting.md`](../syntax-highlighting.md) | why mdsvex escapes braces itself and a highlighter returns plain HTML; the most common question from 0.x users |

Left private: `footnotes.md`, `smart-punctuation.md` and `numbering.md` (feature choices that Reference already states as behaviour, with nothing a reader needs beyond it) and `customisation-surfaces.html`.

Contents:

1. [Page-by-page audit](#1-page-by-page-audit)
2. [Capability inventory](#2-capability-inventory)
3. [Goal map](#3-goal-map)
4. [Proposed structures](#4-proposed-structures)
5. [Recommendation](#5-recommendation)
6. [Open questions for pngwn](#6-open-questions-for-pngwn), all answered

---

## 1. Page-by-page audit

### What was read

| surface | source | notes |
| --- | --- | --- |
| `/` | [`routes/+page.svelte`](../../packages/site/src/routes/+page.svelte) | the typewriter penguin animation, no copy beyond the nav |
| `/docs` cheatsheet | [`components/_cheatsheet.svtext`](../../packages/site/src/components/_cheatsheet.svtext) via `Cheatsheet.svx` | a fixed 850px grid of boxes above the docs |
| `/docs` | [`routes/_docs.svtext`](../../packages/site/src/routes/_docs.svtext) | everything else, 24 top-level sections |
| `/playground/[[example]]` | [`routes/playground`](../../packages/site/src/routes/playground), [`lib/playground/examples`](../../packages/site/src/lib/playground/examples) | the REPL, 9 examples |

**The preview is not `next`.** `859965ee` was built from PR #1246 (`p/hungry-banach-6549d6`, "plain text of a document for search and feeds"). It has a "Search, feeds and llms.txt" section that `next` does not, and it lacks the fence claiming that #1245 added to `next`. The audit below cites `next` and marks the difference.

### Section by section

Line numbers are in `_docs.svtext` on `next`. "Reader" is who the section is written for, not who it should be for.

| # | section | lines | covers | reader | quality | assumes |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Cheatsheet | own file | install, use, 7 options, templates, frontmatter, directives as link boxes | someone scanning | **stale shape.** 0.x layout and styling, a fixed 850px grid, lists 7 of the 20 options, says nothing about plugins, highlighting or math | nothing |
| 1 | mdsvex (intro) | 20–44 | what mdsvex is, one example, "MDX for Svelte" | newcomer | accurate, **thin**. Does not say why PFM exists or what streaming is, the two things that make 1.0 different | knows Svelte and MDX |
| 2 | Install it | 46–62 | npm and pnpm, Svelte 5 and Vite 6 | newcomer | accurate | |
| 3 | Use it | 64–257 | SvelteKit, Vite alone, a theme for highlighting, then `compile`, `compile_async`, `CompilerSession`, compiling in steps | newcomer, then host author | accurate. **Two audiences in one section**: the first 80 lines are setup, the last 110 are an integration API most readers never need | SvelteKit 3, `#lib` subpath imports |
| 4 | Markdown | 258–423 | how PFM differs from CommonMark (a table), additions, task lists, tables, Svelte in markdown | someone who knows CommonMark | accurate and tight. **Not a way to learn the language**: it explains PFM as a diff, and the full rules live in [`PFM.md`](../../PFM.md) on GitHub | CommonMark and GFM |
| 5 | Options | 424–1384 | the `MdsvexOptions` interface, then each option | configurer | accurate, deep. **Carries the plugin authoring API** (`plugins`, `parse_plugins`, plugin handlers, deferred work, loading files, plugin data: lines 526–985, about 460 lines) between `component_mode` and `highlight` | |
| 5a | `import_images`, optimised images | 1059–1155 | images as imports, enhanced-img | configurer | excellent, every case in a table | Vite asset handling |
| 5b | `links`, `rewrite` | 1156–1257 | routes from file links, base, custom rewrites | configurer | excellent | SvelteKit routing |
| 5c | `heading_ids`, `smart_punctuation` | 1258–1384 | ids, typography | configurer | excellent. Mentions `make_heading_ids()` and "a streaming render" with no link, since nothing explains either | |
| 6 | Frontmatter | 1385–1527 | `metadata`, `?metadata`, a blog index, a layout reading page metadata, supported YAML, custom parsers | author, site builder | good. **Holds a hidden how-to** (listing posts, titles in a layout) | SvelteKit `load` |
| 6b | Search, feeds and llms.txt | preview only | `?text` imports, what counts as text, FlexSearch, RSS, `llms.txt` | site builder | good, recipe-shaped. **Only on PR #1246** | |
| 7 | Templates | 1528–1664 | defining, documents as templates, choosing, opting out, props, hoisting | site builder | good | Svelte 5 snippets |
| 8 | Custom components | 1665–1840 | replacing elements, precedence, element props, `component_mode: 'all'`, lowercase tags, nested scopes | site builder | good. "Nested scopes" is a known limitation written as a workaround | |
| 9 | Directives | 1841–1924 | declaring, the three forms, props, unknown directives, from a plugin | author, site builder | good | |
| 10 | Plugins | 1925–2890 | all 16 first-party plugins: install, syntax, options, components, CSS properties | site builder | good and current, each plugin a reference card. **The sidebar lists 8 of the 16** (no elements, embeds, figures, code blocks, diagrams, citations, link check, numbering) | |
| 11 | Syntax highlighting | 2891–3339 | themes, options, languages, fence meta, `src=`, code directives, inline code, `pre` components, custom highlighters, twoslash, with `compile` | author, site builder | excellent | |
| 12 | Math | 3340–3532 | fences and inline math, Temml, KaTeX, options, errors, components, custom renderers | author | excellent | LaTeX |
| 13 | Footnotes | 3533–3666 | syntax, errors, options, components, "while streaming" | author | good. "While streaming" is two sentences about a renderer the docs never introduce | |
| 14 | Live code | 3667–3744 | `[!eval]`, marker forms, the `eval` flag | docs writer | good | code directives |
| 15 | Code that runs | 3745–3881 | `run`, a `pre` that runs it, `run=client`, running a file, with `compile` | docs writer | good. Nothing in the docs uses it, so a reader never sees it run | |
| 16 | Formatting with Prettier | 3882–3934 | the prettier plugin, options, ignores | author | good. **The only tooling documented**, and missing from the sidebar | Prettier |
| 17 | Without Vite | 3935–4006 | what a host supplies, `read_exports`, virtual ids, the editor manifest, what is Vite only | host or tool author | good, dense. **Missing from the sidebar** | the compile pipeline |
| 18 | Migrating from 0.x | 4007–4194 | the migrator script, what changes, layouts, highlighting, smart punctuation | 0.x user | good. The migrator is a library you script yourself, so this is a how-to with code | 0.x config |
| 19 | Coming from remark and rehype | 4195–4274 | every common remark/rehype plugin and what replaces it | 0.x user, MDX user | excellent, a lookup table | |
| 20 | Parser changes on `next` | 4275–4457 | what `1.0.0-next.2` reads differently from `next.1` | `next` early adopter | accurate, **temporary**. Belongs in release notes once 1.0 ships, it means nothing to a 1.0 reader | `next.1` |
| 21 | Limitations | 4458–4487 | no indented code, not read yet, not possible yet | everyone | **partly stale.** "A plugin that waits ... can't fetch an embed or read a bibliography" (4486) has been false since deferred work landed, and `@mdsvex/plugin-citations` reads a bibliography | |
| 22 | Playground | `/playground` | 9 examples (basics, directives, all mode, code, math, components, footnotes, templates, run), panes for the result, the PFM AST, Svelte, JS and CSS output, a console, share links | experimenter | works well. **Never described in the docs**, only linked from six sections. No streaming view, no plugin picker, no opcode view | |

### What the audit shows

- **Accuracy is not the problem.** I found one stale passage (Limitations, "not possible yet") and one nav drift (8 of 16 plugins, no Prettier, no "Without Vite"). The prose is consistent: short declarative sentences, a table where cases multiply, the error a reader will see, quoted. Keep that voice; the plan is about where text lives, not rewriting it.
- **Hidden how-tos.** Recipes a site builder wants are inside reference sections: list blog posts (Frontmatter, `?metadata`; Plugin data, `?data`; Page data), read page metadata in a layout (Frontmatter), a copy button (Code block components), side notes from footnotes (Footnote components), Shiki (Custom highlighters), search and RSS (preview only). Each can be lifted into a guide and the reference can link to it.
- **Audience mixing.** "Use it" goes from `npm i` to `CompilerSession.settle` in one section. "Options" holds the authoring API. Someone writing a plugin has to know that "Options → `plugins`" is where the guide starts.
- **One page has hit its limit.** 189k characters in one document, a hand-written sidebar that already drifts, anchors such as `#templates-1` and `#math-1` because option names and section names collide, and no search.
- **No dogfooding.** Because the site injects compiled HTML, the docs can't show tabs, steps, a live value, a block that runs, a toc or a diagram in its own pages. The examples on the page are pictures of output, not output.

### Docs outside the site

These exist in the repository and are read by nobody who only visits the site.

| file | what it is | state |
| --- | --- | --- |
| [`PFM.md`](../../PFM.md) | the language spec, 420 lines, principles and every rule | current, linked from the docs as a GitHub url |
| [`packages/parse/PLUGINS.md`](../../packages/parse/PLUGINS.md) | the full parse plugin API, 1,146 lines: node views, revocation, lifecycle, composition, text handlers, bound handlers, ids | current, the docs link to it for "the whole API" |
| [`packages/parse/WIRE_FORMAT.md`](../../packages/parse/WIRE_FORMAT.md) | opcodes, incremental rendering, an SSE server and client, a Swift client sketch | current, never linked |
| [`language-tools/ARCHITECTURE.md`](../../language-tools/ARCHITECTURE.md) | how the editor pipeline works, for contributors | current, no user setup |
| [`design/*.md`](../../design) | eleven design notes with the reasons: parser structure, templates, highlighting, footnotes, code modules, plugin async, plugin text, smart punctuation, numbering, Vite coupling | dated and decided, written as decision records |
| `plugins/*/README.md` | one per plugin, 58 to 250 lines | current, and duplicates the site's Plugins section |
| [`plugins/README.md`](../../plugins/README.md) | the package convention for a plugin | its "Releasing" part is stale, all 16 are on npm |
| [`packages/migrate/README.md`](../../packages/migrate/README.md), [`packages/repl/README.md`](../../packages/repl/README.md), [`packages/prettier-plugin/README.md`](../../packages/prettier-plugin/README.md) | package docs | good |
| `packages/parse`, `packages/render`, every `language-tools/*` | | **no README** |
| [`packages/mdsvex/README.md`](../../packages/mdsvex/README.md) | install, and a link to the docs **as the raw `.svtext` on GitHub**; says mdsvex.com documents 0.x | accurate for today |

---

## 2. Capability inventory

What the library can do, whether the site documents it, and where the code is. **yes** means a reader of the site can find and use it, **part** means it is mentioned or covered only in a README or a repo file, **no** means nowhere a user would look. Paths are from the repository root.

### The language (PFM)

| capability | docs | where |
| --- | --- | --- |
| CommonMark baseline with the changes (`*` strong, `_` emphasis, ATX only, no indented code, backslash breaks, no lazy quotes, defs before use, explicit autolinks) | yes, as a diff table | `PFM.md`, docs Markdown |
| intraword `\|` marker, CJK emphasis | yes | `PFM.md` §Emphasis |
| lists: non-sequential numbers, local tight/loose rules | **part**, only in `PFM.md` | `PFM.md` §Lists |
| containers hold the same blocks | yes | `design/parser-structure.md` |
| paragraphs of only tags get no `<p>`, block elements at line start, tags over lines, repeated attributes | yes / part | `PFM.md` §Paragraphs, §Tags over lines |
| sub, super, strikethrough, task lists | yes | |
| tables with `\|\|` header columns, `>` and `^` merged cells | yes | `PFM.md` §Tables |
| directives, three forms, args | yes | `PFM.md` §Generic directives |
| math fences and `` $`x`$ `` | yes | |
| footnotes | yes | `design/footnotes.md` |
| Svelte in markdown, top-level imports, braces as expressions | yes | |
| the design principles (why strict, why streaming) | **no**, only `PFM.md`'s opening | `PFM.md` lines 5–16 |

### Building a site with the Vite plugin

| capability | docs | where |
| --- | --- | --- |
| SvelteKit 3 and plain Vite setup, extension registration | yes | `packages/mdsvex/src/main.ts:961` |
| every option in `MdsvexOptions` | yes, except `wrap_static` | `packages/mdsvex/src/main.ts:96` |
| `wrap_static` (wrap static runs in `display: contents` for hydration) | **no** | `packages/mdsvex/src/main.ts:204` |
| frontmatter, built-in YAML, custom parsers | yes | `packages/mdsvex/src/frontmatter.ts` |
| `?metadata`, `?data`, `?template=` imports | yes | `metadata_query.ts`, `template_registry.ts:385` |
| `?text` imports for search, RSS, `llms.txt` | preview only (PR #1246) | branch `p/hungry-banach-6549d6` |
| templates, documents as templates, template props, hoisting | yes | `design/templates-and-components.md` |
| element replacement, precedence, element props, `component_mode: 'all'` | yes | |
| directives from `components` modules | yes | |
| images as imports, enhanced-img | yes | |
| `links.routes`, `links.base`, `rewrite` | yes | |
| heading ids, smart punctuation | yes | |
| highlighting: twinkleplop, themes, fence meta, `src=`, code directives, inline code, twoslash, custom highlighters | yes | `design/syntax-highlighting.md` |
| math: Temml, KaTeX, components, custom renderers | yes | |
| footnotes: errors, options, components | yes | |
| live code `[!eval]` | yes | `packages/mdsvex/src/live_code.ts` |
| code that runs (`run`, `run=client`) | yes | `design/code-modules.md` |
| TypeScript: `mdsvex/globals`, `PluginData` augmentation | yes, briefly | `packages/mdsvex/globals.d.ts` |
| source maps back to markdown | **part**, one line under "Vite only" | `main.ts:1223` |
| HMR of documents, `src=` files, plugin-read files | **part** | `main.ts:1153` |
| errors and warnings, with codes | **part**, scattered over a dozen sections | `packages/mdsvex/src/compile.ts:101–137` |

### First-party plugins

All 16 are published under `@mdsvex/plugin-*` at `0.1.0-next.0` (the `latest` tag is a `0.0.0` placeholder). Every one has a site section, a README and tests.

| plugin | docs | sidebar | notes |
| --- | --- | --- | --- |
| steps, tabs, anchors, external-links, toc, page-data, emoji, references | yes | yes | |
| elements, embeds, figures, code-blocks, diagram, citations, link-check, numbering | yes | **no** | reachable only by scrolling |
| how plugins depend on each other (`heading_ids` for anchors and toc, figures for `fig:`, ordering of references, emoji, external-links) | **part**, one sentence per plugin | | no page says it once |
| "find a plugin for X" | **part**, the remark/rehype table does this for 0.x users only | | |
| what is not built (callouts, `> [!NOTE]`, definition lists, other diagram engines, oEmbed) | yes, "Nothing yet" | | `plugins/PLUGIN_AUDIT.md` |

### Writing plugins

| capability | docs | where |
| --- | --- | --- |
| `Bundle`: `name`, `module`, `directives`, `parse`, `components`, `fences` | yes, under Options | `packages/mdsvex/src/compile.ts:214` |
| bound handlers: `children`, `descendants`, `'*'`, the directive's own `parse` | yes | `packages/parse/src/plugin_types.ts:206` |
| `observe` a directive another plugin owns | yes | |
| claiming fence languages | yes on `next`, not in the preview | `fence_claims.ts` |
| `parse_plugins`, open and close handlers, `sequential` | yes | |
| text handlers and `run.replace` | yes | `packages/parse/src/text_run.ts` |
| `all_text` (code, math, urls in text runs) | **part**, `PLUGINS.md` only | `PLUGINS.md:792` |
| node view members and methods | yes, a table | `packages/parse/src/node_view.ts` |
| pending nodes and revocation | yes, briefly; `PLUGINS.md` in full | |
| `ctx.warn`, `ctx.set`, `ctx.add`, `ctx.data`, `ctx.scratch` | yes | |
| `ctx.id(base)`, ids no element has | **part**, `PLUGINS.md` only | `plugin_types.ts:98` |
| `ctx.defer`, `document` hook, `ctx.depend`, `ctx.read`, `ctx.resolve`, `ctx.cached` | yes | `design/plugin-async.md` |
| plugin data, `?data`, `PluginData` types | yes | |
| `BundleDirective.static` | **no**, reserved, nothing reads it | `compile.ts:195` |
| directive `text` for `?text` | preview only | |
| packaging a plugin (peer range, `dist`, `/directives` with a `svelte` condition, optional CSS) | **part**, `plugins/README.md`, written for this repo | |
| testing a plugin | **no**. `plugins/test` and `expect_parity` are internal | `plugins/test/app.ts`, `packages/parse/test/plugin_harness.ts` |
| how handlers behave over a stream | **part**, `PLUGINS.md` "Streaming vs Batch" | `PLUGINS.md:671` |

### Compiling without Vite

| capability | docs | where |
| --- | --- | --- |
| `compile`, `mdsvex/compile` entry | yes | `compile.ts:2988` |
| `compile_async`, `read`, `resolve`, `dependencies` | yes | `compile.ts:2899` |
| `CompilerSession`, `compile_inputs`, parse, settle, needs, render, invalidate | yes | `compile.ts:1986` |
| compile-only options: `directives`, `strict_directives`, `sources`, `snippets`, `template`, `sourcemap` | yes, spread over sections | `compile.ts:238` |
| `default_template` | **no** | `compile.ts:389` |
| `mdsvex/highlight`, `mdsvex/math` | yes | |
| `mdsvex/host`: `read_exports`, virtual id prefixes, `metadata_module`, `data_module`, manifest helpers | yes | `packages/mdsvex/src/host.ts` |
| `mdsvex.config.json` as a file format | **part**, mentioned six times, never specified | `json_config.ts:25` |
| internals exported through `export *` (`compile_v3`, `compile_trace*`, `_shared_session`, ...) | n/a, should not be documented | `compile.ts:2293–2380` |

### The parser, streaming and rendering

| capability | docs | where |
| --- | --- | --- |
| batch parse, `parse_markdown_svelte` | **no** | `packages/parse/src/main.ts:12951` |
| incremental parse, `PFMParser` `init`, `feed`, `finish` | **no** on the site, yes in `WIRE_FORMAT.md` | `main.ts:1026` |
| the `Emitter` interface, opcodes, pending, commit, revoke | **no** on the site | `packages/parse/src/opcodes.ts:17` |
| `TreeBuilder`, `NodeBuffer`, `Cursor`, `NodeKind` | **no** | `tree_builder.ts:27`, `cursor.ts:30` |
| wire format, `WireEmitter`, `WireTreeBuilder`, SSE examples | **part**, `WIRE_FORMAT.md` | `wire_emitter.ts:140` |
| stalling, eager text, `ParseStallError` | **part**, one mention in Parser changes | `WIRE_FORMAT.md` §How stalling works |
| `@mdsvex/render`: `CursorHTMLRenderer` (the string renderer `compile` uses) | **no** | `packages/render/src/html_cursor.ts:5599` |
| `ComponentRenderer` and `Node.svelte`, a live Svelte render of a buffer | **no** | `render/src/component.ts:47` |
| `PluginStream` from `@mdsvex/render/stream`, plugins over a stream with live plugin data | **no**, the docs say "a streaming render" seven times and never show one | `render/src/stream.ts:30` |
| how each feature behaves while streaming (footnotes, toc, numbering, heading ids, smart punctuation) | **part**, a sentence in each section | |
| source map helpers, `@mdsvex/render/sourcemap` | **part**, one line | `render/src/sourcemap.ts` |

Neither `@mdsvex/parse` nor `@mdsvex/render` has a README, and both export internals from their root (`StateKind`, `take_src`, `PluginDispatcher`, underscore functions in render). Decision 2 settles what is public, see [the proposed surface](#the-public-surface-of-mdsvexparse-and-mdsvexrender).

### Editor tooling

| capability | docs | where |
| --- | --- | --- |
| Prettier plugin, options, ignores, pragmas | yes, not in the sidebar | `packages/prettier-plugin` |
| VS Code extension: grammar, intellisense, typed frontmatter, template prop checks, go to definition on replaced elements and directives, directive arg completion, compile diagnostics | **no**. The extension is `private` and not on the Marketplace or Open VSX | `language-tools/vscode-pfm` |
| language server for other editors, `pfm-language-server --stdio` | **no** | `language-tools/language-server` |
| TypeScript plugin, importing `.svx` from `.ts` with types | **no** | `language-tools/typescript-plugin` |
| how the editor reads config: `node_modules/.mdsvex/manifest.json`, else `mdsvex.config.json` | **part**, under "Without Vite" | `language-tools/language-core/src/config.ts` |
| tree-sitter grammar for Neovim, Helix, Zed | **no**, it is on PR #1248 (`p/treesitter-mdsvex-grammar-7fc746`), private | |

### Places to experiment

| surface | docs | where |
| --- | --- | --- |
| the playground: multi-file, `mdsvex.config.json`, result, PFM AST, Svelte, JS and CSS output with source mapping, console, share links | **part**, linked from six sections, never described | `packages/repl`, `packages/site/src/routes/playground` |
| 9 playground examples | `basics` and `components` are never linked | `packages/site/src/lib/playground/examples` |
| plugins in the playground | **no**. The worker reads plugin directive modules from a manifest but, as far as I can see, passes no `plugins` to the compile, so a plugin's handlers don't run there | `packages/repl/src/workers/mdsvex.ts:261` |
| incremental parse viewer: feed a source by chunks, step, play, the opcode panel | **no**, private dev app | `packages/_incremental-parse-test/src/lib/Viewer.svelte` |
| streaming plugin demos: a growing toc, deferred lookups, a growing bibliography | **no**, private dev app | `_incremental-parse-test/src/routes/stream/[demo]` |
| `test-app`, 25 routes, one per feature and plugin, including the editor tour | **no**, private | `packages/test-app/src/routes` |
| the score notation (design branches) | n/a | shared notes, `lib/experiments/05-surprise`, `02-atlas` |

### Migration

| capability | docs | where |
| --- | --- | --- |
| `@mdsvex/migrate`: `migrate`, `migrate_config`, `check_template`, `migrate_frontmatter`, `serialize` | yes. It is a library, there is no CLI | `packages/migrate/src` |
| what changes from 0.x, layouts, highlighting, smart punctuation | yes | |
| remark and rehype plugin replacements | yes | `plugins/PLUGIN_AUDIT.md` |
| `next.1` to `next.2` parser changes | yes, temporary | |

---

## 3. Goal map

pngwn's five reader goals, with the [Diátaxis](https://diataxis.fr) mode each one mostly needs. What exists today, what is missing.

| goal | mode | what exists | what is missing |
| --- | --- | --- | --- |
| **1. Learn the language** | tutorial, then reference | Markdown (the CommonMark diff), Svelte in markdown, Directives, Math, Footnotes, Tables; `PFM.md` on GitHub; the `basics` playground example | **a path for someone who has never written PFM**: what it looks like, in order, each construct with its output. Today PFM is explained only as differences from CommonMark, which assumes CommonMark. No page says why the language is strict (streaming, no ambiguity). `PFM.md` is not on the site. |
| **2. Do a specific task** | how-to | recipes hidden inside reference: blog index (Frontmatter, Plugin data, Page data), titles in a layout, a copy button, side notes, Shiki, search and RSS (preview). The 16 plugin sections. Migration. | **guides with a goal in the title**: set up a blog, a docs site, a technical or academic writing setup, search, editor setup, stream an LLM's output. **"Find a plugin"** by what you want to do, for readers not coming from remark. The plugin dependencies in one place. |
| **3. Write your own plugins** | tutorial, explanation, reference | about 460 lines under Options (`plugins` to Plugin data), `PLUGINS.md` (1,146 lines) on GitHub, 16 first-party plugins to read | **a first plugin tutorial**, a page on the mental model (open and close, pending and revoke, sequential, scratch versus data), **testing**, **packaging and publishing** a third-party plugin, the API reference on the site, `ctx.id` and `all_text` |
| **4. Understand the technical details** | explanation, reference | Without Vite, Parser changes, Limitations; `design/*.md`, `WIRE_FORMAT.md`, `ARCHITECTURE.md` in the repo | **an architecture page** (source → parser → plugins → tree → renderer → Svelte, and where Vite sits), **streaming and incremental parsing**, the parser and renderer APIs, the editor pipeline, the design reasons published |
| **5. Experiment and test** | interactive | the playground, with AST and output panes | **plugins in the playground**, a **streaming view** (the private viewer and stream demos already exist), live examples inside the docs, runnable spec examples, a playground page that says what it can do |

### Where each existing section goes

| current section | goal | lands in (recommended structure) |
| --- | --- | --- |
| intro, Install, Use it (setup part) | 1, 2 | Learn: Quick start; Guides: SvelteKit, Vite |
| Use it (`compile` to compiling in steps) | 4 | Reference: Compile API; Guides: Without Vite |
| Markdown | 1 | Learn: the PFM tour; Reference: PFM |
| Options (each option) | 2, lookup | Reference: Options |
| Options → `plugins` to Plugin data | 3 | Plugins: Writing plugins |
| Frontmatter, Templates, Custom components, Directives | 1, 2 | Learn (the concepts); Reference (the rules); Guides (the recipes lifted out) |
| Plugins (16) | 2 | Plugins: one page each, and the catalogue |
| Syntax highlighting, Math, Footnotes, Live code, Code that runs | 2, lookup | Reference: one page each; Guides: code-heavy docs, technical writing |
| Formatting with Prettier | 2 | Guides: Editor setup; Reference: Prettier options |
| Without Vite | 4 | Guides: Other bundlers and hosts; Reference: `mdsvex/host` |
| Migrating, Coming from remark and rehype | 2 | Guides: Migrate from 0.x (a section of its own) |
| Parser changes on `next` | none at 1.0 | release notes |
| Limitations | 1, 4 | Reference: Limitations, kept current |
| Playground | 5 | Playground, described, and embedded everywhere |

---

## 4. Proposed structures

Three ways to organise it. All three assume the docs become many pages, one per route, compiled by mdsvex itself (see [Mechanics](#mechanics-that-apply-to-any-structure)). None adds syntax or formats; the work is making what exists learnable.

### A. Diátaxis, strictly

```
Tutorials     Your first page · Build a blog · Your first plugin
How-to        Set up (SvelteKit, Vite, other hosts) · Blog recipes · Docs site · Code · Math and citations · Editor · Migrate
Reference     PFM · Options · Query imports · Compile API · Plugin API · Each plugin · Errors · Prettier
Explanation   Why PFM · Architecture · Streaming · Templates and components · Design notes
Playground
```

- **For:** a known framework with clear rules for what goes where. Easy to say no to a page in the wrong place.
- **Against:** a plugin author's material lands in all four quadrants, and so does the language. Readers do not arrive thinking "I want explanation". The 16 plugins have to be split into a reference card and a how-to each, or forced into one quadrant. pngwn's fifth goal has no place in the framework and sits beside it.

### B. pngwn's five goals as the five sections

```
Learn the language   PFM tour · Svelte in markdown · Directives · Math, code, footnotes
Build something      Quick start · Blog · Docs site · Search and feeds · Images · Links · Templates · Plugins to use · Migrate
Extend               Writing plugins · API · Testing · Packaging
Understand           Architecture · Streaming · Parser · Renderers · Editor tooling · Design notes
Experiment           Playground · Stream lab · Spec examples
```

- **For:** maps one to one onto the goals, so every page has an obvious owner and every goal is visibly covered. Strong first impression of what mdsvex is for.
- **Against:** **reference has no home.** Options, the compile API, the error list and the plugin API get split between Build, Extend and Understand, and someone looking up `links.base` has to know which. "Build something" grows to hold most of the site. "Experiment" as a peer section suggests the playground is somewhere you go, not something every page uses.

### C. By layer of the stack

```
Language   learn · guides · reference (PFM)
Sites      learn · guides · reference (Vite plugin, options, templates, components)
Plugins    use (catalogue) · write (tutorial, concepts, API)
Engine     compile · parse · stream · render · editor tooling
Playground
```

- **For:** matches the package boundaries, so each section has one owner and one set of tests. Scales well, and suits depth over breadth: each layer can be taken as deep as it goes. A plugin author lives in one section.
- **Against:** a task that crosses layers, such as a blog (language, site, plugins), has no single home. A newcomer must already know which layer their question is about. The first page a newcomer sees is the language spec or a config page, not a working site.

### Mechanics that apply to any structure

- **The docs are mdsvex documents.** Move from one `.svtext` injected with `{@html}` to `+page.svx` routes through the real Vite plugin, with the first-party plugins on: `toc` and `anchors` for each page, `steps` and `tabs` in guides, `code-blocks`, `link-check` with `strict` in the build, `page-data` for edit links. The docs then exercise every feature they describe, and a broken one breaks the build.
- **Generated, not written, output.** Each "you write / you get" pair renders the "you get" from the "you write" at build time, so it cannot drift. Today every output block is typed by hand.
- **Navigation from the files.** A `?metadata` glob builds the sidebar, so the drift found above (8 of 16 plugins, no Prettier, no "Without Vite") cannot happen.
- **Search from `?text`.** If #1246 lands, the docs' own search is the recipe it documents.
- **One home per fact.** The plugin sections and the plugin READMEs say the same things today. The site is canonical (decision 5): each README keeps install, a one-line example and a link to the site.
- **Examples are tested.** Every example compiles in CI, through the same path the page uses.

---

## 5. Recommendation

**B's goal-led sections, with A's reference pulled out as a shared spine, and the playground running through every page rather than sitting beside them.** Six entries in the top nav:

```
Learn · Guides · Plugins · Reference · Internals · Playground
```

| section | goal | mode | holds |
| --- | --- | --- | --- |
| **Learn** | 1 | tutorial | the first hour: what mdsvex is, a quick start, the PFM tour, one end-to-end tutorial |
| **Guides** | 2 | how-to | one task per page, titled by the task |
| **Plugins** | 2, 3 | catalogue, tutorial, reference | using plugins and writing them, in one place |
| **Reference** | lookup for all | reference | every option, query, API, error and rule, complete and dry |
| **Internals** | 4 | explanation, low-level reference | how it works and why, and the APIs below `compile` |
| **Playground** | 5 | interactive | the full playground, plus the embeds every other page uses |

Why this one: it keeps B's strength, a section per goal that a reader recognises, and fixes B's weakness by giving reference its own spine that every other section links into. Plugins gets a top-level section because both a site builder ("find me something for citations") and a plugin author start there, and the plugin ecosystem is 16 packages deep. Internals is named for the reader who wants to know how it works, and is where streaming finally gets its pages.

### The pages

**Learn** (read in order)

1. **What mdsvex is.** Svelte in markdown, markdown in Svelte, and what is new in 1.0: its own markdown and plugins with components. Streaming gets one line and a link to its guide, it is a use case, not the headline (decision 1). One live example.
2. **Quick start.** A SvelteKit project with a `+page.svx`, in five minutes. Lifted from "Install it" and "Use it".
3. **The PFM tour.** The language, construct by construct, each with an editable example and its output (and, once it exists, the score of its tree). Text and emphasis; headings, lists, quotes and fences; links, images and references; tables; Svelte in markdown; directives; math, footnotes and code. Written for someone who has never read CommonMark.
4. **Coming from other markdown.** The current "Different from CommonMark" table, for readers who know CommonMark, GFM or MDX.
5. **Build a blog.** The one end-to-end tutorial: routes, a template, frontmatter, a post list with `?metadata`, a highlighting theme, two plugins (`page-data`, `toc`). Each step links to the guide that goes deeper.

**Guides** (titled by the task)

- Set up: SvelteKit · Vite without SvelteKit · Other bundlers and hosts (today's "Without Vite" and "Compiling in steps")
- Sites: List posts and pages (`?metadata`, `?data`) · Page metadata in a layout · Search, RSS and `llms.txt` (#1246) · Images and optimised images · Links between documents and base paths · A docs site (toc, anchors, steps, tabs, code blocks, link check, edit links)
- Writing: Code-heavy pages (themes, Shiki, twoslash, `src=`, live code, runnable demos) · Technical and academic writing (math, footnotes, figures, numbering, citations) · Typography and other languages (smart punctuation quotes, footnote labels, emoji labels)
- Customising output: Templates · Replacing elements · Your own directives
- Streaming: Render markdown as it arrives (an LLM response, a live preview), with `PFMParser` and `PluginStream`
- Editor: VS Code (a full page: install, what it checks, how it reads config) · Other editors (short: the language server and tree-sitter) · Formatting with Prettier, in the sidebar
- Migrate: From mdsvex 0.x (`npx @mdsvex/migrate`, then a checklist of what it flags, and a link to the 0.x docs on the v0 subdomain) · From remark and rehype plugins

**Plugins**

- **Using plugins:** how to install and order them, and what depends on what (one table: `heading_ids`, figures and numbering, references before emoji, external-links last).
- **Catalogue:** grouped by what you want to do (structure: steps, tabs, elements, figures; navigation: anchors, toc, link-check; code: code-blocks, diagram; writing: emoji, references, citations, numbering; site: page-data, external-links), then one page per plugin, from today's sections. These pages are canonical, the READMEs point at them, and each page opens its example in the playground.
- **Writing plugins:** Your first plugin (a tutorial: a reading time in a dozen lines, then a directive with a component) · How plugins see a document (open and close, pending and revoke, sequential runs, text runs, scratch and data) · Directives and bundles · Waiting for files and fetches · Plugin data · Testing a plugin · Packaging and publishing · API reference (`Bundle`, `ParsePlugin`, node view, `ctx`, task context, errors, and `BundleDirective.static` once it exists), lifted from `PLUGINS.md`.

**Reference**

- PFM, the spec (`PFM.md` on the site, each rule with a runnable example)
- Options, one page per option or small group, with the type, default and a link to the guide, including `wrap_static`, which is undocumented today
- Query imports: `?metadata`, `?data`, `?text`, `?template=`
- Element and component props (today's element props table, `pre`, `code`, `math`, footnotes, directives)
- Fence meta and code directives
- Compile API: `compile`, `compile_async`, `CompilerSession`, results, and the compile-only options, including `default_template`
- `mdsvex/highlight`, `mdsvex/math`, `mdsvex/host`, `mdsvex.config.json`
- Errors and warnings: every error class and warning code, what triggers it, how to fix it
- Prettier options
- Limitations

**Internals**

Explanation, edited from the [design notes chosen above](#design-notes-to-publish):

- Architecture: from source to component, what the Vite plugin adds over `compile`, and where the editor sits
- Why PFM is strict: the principles in `PFM.md`, with examples of the ambiguity each rule removes
- One grammar for every container
- How plugins run
- How a document becomes a component
- Code blocks as modules
- Highlighting and braces
- Streaming and incremental parsing: feed, stall, pending, commit, revoke, with the stream lab embedded

API, for [the public surface](#the-public-surface-of-mdsvexparse-and-mdsvexrender) and nothing else:

- `@mdsvex/parse`: `parse_markdown_svelte`, `PFMParser`, `TreeBuilder`, `Cursor`, `NodeKind`
- `@mdsvex/render`: `CursorHTMLRenderer`, `ComponentRenderer` with `Node.svelte`, `PluginStream`
- Not the wire format: it is internal at 1.0 and `WIRE_FORMAT.md` stays a contributor document ([open item](#open-items), review later)

**Playground**

- **The playground**, as today, with a page that says what it can do.
- **Plugins in the playground:** the worker loads a first-party plugin on demand when `mdsvex.config.json` names it (decision 8), so every plugin page can open an example of itself.
- **The stream lab:** the private `_incremental-parse-test` viewer (chunks, step, play, opcodes) and its `PluginStream` demos, made public. This is where goal 5's "test streaming" is answered.
- **Embeds:** a small editable example on any page. It renders statically with the page and starts the worker only when a reader first edits it (decision 7), with "Open in playground". The PFM tour and the plugin pages are built from these.

### The order a reader takes

| reader | path |
| --- | --- |
| new to mdsvex | What mdsvex is → Quick start → PFM tour → Build a blog → Guides as needed → Reference to look things up |
| coming from 0.x | home page banner → Migrate from 0.x → Coming from other markdown → Plugins catalogue |
| wants a feature | Plugins catalogue or Guides → the plugin or guide page → Reference |
| plugin author | Quick start → Your first plugin → How plugins see a document → API reference → Internals: Streaming |
| tool or host author | Architecture → Other bundlers and hosts → Compile API → `mdsvex/host` → the editor pipeline |
| experimenter | Playground → the stream lab → the PFM spec's runnable examples |

### How the interactive parts join the prose

Three levels, each cheaper than the next:

1. **Every example is real.** Pages are `.svx`, so a tabs example on the tabs page is tabs, and every "you get" is rendered from the "you write" at build time.
2. **Some examples are editable.** The PFM tour, the plugin pages and the Writing plugins tutorial use embeds: a source pane and an output pane, with the AST or the score one click away, and "Open in playground". An embed is static HTML from the build until a reader interacts, then it starts the worker, so a page full of them costs nothing extra to load.
3. **The playground goes deep.** Multi-file, config, every output pane, plugins, and the stream lab.

The score notation from the identity work fits levels 2 and 3: the PFM tour can draw the tree over each example, and Internals → Streaming can play a parse as a score. That depends on the design branch and is not needed for the first pass.

### Order of work

1. **Split and dogfood, in one pass, before any new writing** (decision 4). Move today's sections into `.svx` routes under the new sections, compiled by the Vite plugin with the first-party plugins on, prose unchanged, nav generated from the files. In the same pass: fix the stale Limitations passage, move "Parser changes on `next`" to release notes, put Prettier, "Without Vite" and all 16 plugins in the nav, document `wrap_static` and `default_template`, and trim the plugin READMEs to install, an example and a link (decision 5).
2. **Learn.** Quick start, the PFM tour with embeds, Build a blog.
3. **Plugins.** The catalogue and dependency table; split the authoring material out of Options; write Your first plugin, Testing and Packaging.
4. **Guides that wait on code.** The migration guide as `npx @mdsvex/migrate` and a checklist, once the CLI exists. The full VS Code page, once the extension is published. "Render markdown as it arrives", once the public surface is in place.
5. **Internals.** The six explanation pages, then the API pages for the public surface.
6. **Playground.** Plugins on demand in the worker, the stream lab, embeds that start on interaction.

Steps 2, 3, 5 and 6 are independent once step 1 lands. Step 4 and the API half of step 5 wait on these code tasks, none of them docs work:

| code task | unblocks |
| --- | --- |
| the public surface of `@mdsvex/parse` and `@mdsvex/render`, with `./internal` entries and two READMEs ([proposal](#the-public-surface-of-mdsvexparse-and-mdsvexrender)) | the streaming guide, the Internals API pages |
| `npx @mdsvex/migrate` | the migration guide |
| `BundleDirective.static` | its entry in the plugin API reference |
| the VS Code extension on the Marketplace and Open VSX | the VS Code page |
| plugins loaded on demand in the REPL worker | "open in playground" on plugin pages |
| the v0 subdomain (pngwn) | the link in the migration guide |

---

## 6. Open questions for pngwn

All answered 2026-11-01, see [Decisions](#decisions-2026-11-01). The questions are kept as they were asked.

1. **Is streaming public API at 1.0?** `PFMParser` with `init`, `feed` and `finish`, the wire format and `PluginStream` are exported, demoed privately, and never documented. If they are public, Guides gets "render markdown as it arrives" and Internals gets the API pages. If not, Internals explains streaming and the API stays undocumented. **Answered:** public and documented, as one use case.
2. **Which lower layers are public?** `@mdsvex/parse` and `@mdsvex/render` have no README and export internals from their root. The docs should cover only what 1.0 commits to. `compile.ts` also leaks `@internal` names through `export *`. **Answered:** a small named surface, proposed above.
3. **Editor tooling at 1.0.** The VS Code extension is private and unpublished, and tree-sitter is on an open PR. Do the docs ship an editor setup page at 1.0, and for which editors? (The ship plan of 2026-10-31 has VS Code, the language server and Prettier shipping tight, and tree-sitter, Zed and Helix basic. That would mean a full VS Code page and a short "other editors" page.) **Answered:** follow the ship plan.
4. **Dogfood the docs?** Moving from `{@html}` of a compiled `.svtext` to `.svx` routes through the Vite plugin is the biggest mechanical change and touches the site the identity work is also changing. Agree, and when? **Answered:** yes, as step one.
5. **One home for plugin docs.** The site section and the README of each plugin overlap almost completely. Generate one from the other, or let the README be a short pointer to the site? **Answered:** the site is canonical.
6. **0.x docs.** mdsvex.com documents 0.x today. At 1.0, archive them (say `/v0`), or drop them and lean on the migration guide? **Answered:** a v0 subdomain.
7. **Embeds and weight.** An editable example needs the compiler in a worker on that page. Fine on every Learn and plugin page, or only behind a click? **Answered:** static, the worker starts on first interaction.
8. **Plugins in the playground.** The worker does not run plugin handlers today. Bundle the 16 first-party plugins into it (size), load them on demand, or leave plugins to the stream lab and test-app? **Answered:** on demand.
9. **PFM as a language of its own.** Is PFM presented as mdsvex's markdown, or as a language with its own spec page that `@mdsvex/parse` reads anywhere? This decides whether the spec lives under Reference or gets its own top-level entry. **Answered:** mdsvex's markdown, the spec under Reference.
10. **The design notes.** How much of `design/*.md` should be public? They are decision records written for pngwn; publishing them means editing them into explanations, and choosing which reasons are worth a reader's time. **Answered:** edit the chosen ones into Internals, keep the records private.
11. **Small things:** `wrap_static` and `default_template` are undocumented, `BundleDirective.static` is reserved, `@mdsvex/migrate` has no CLI (a script is the documented way). Document, hide, or build? **Answered:** document all three, give migrate a CLI.

### Things found in passing

Not part of this plan's scope, listed so they are not lost:

- Limitations, "Not possible yet: a plugin that waits" (`_docs.svtext:4486`), is false since deferred work landed.
- `plugins/README.md` "Releasing" says seven plugins are unpublished; all 16 are on npm.
- `plugins/plugin-roadmap.html` contradicts the shipped plugins (`==mark==`, `[@key]`, a private autolink plugin).
- `packages/template/README.md` describes `pfm-parse` and a `compile().then`, both gone. `svast` points `main` at a file that does not exist.
- Stale comments: "sseemitter" in `packages/parse/src/opcodes.ts`, old names in the `cursor.ts` header, `pfm-parse` in the bench README.
- The external-links README says `new_tab_label` is an attribute "because a plugin can't add text to a document yet"; text rewriting exists now.
