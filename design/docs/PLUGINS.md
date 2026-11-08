# The plugins section as a finder

2026-11-02. A prototype at `/docs-lab/plugins` on a branch cut from `p/site-1.0`. The pages at `docs/plugins/**` are unchanged. pngwn's brief: "That section should be about helping users find the thing they want/need."

## In the docs, 2026-11-09

pngwn approved the finder ("plugins look good and we can move forward with that, needs tweaks i think but that can come later"), and it moved out of the lab. The sections below record the prototype; this one says what is true now.

- **`/docs/plugins` is the finder,** replacing the "Using plugins" landing page, whose config snippet now follows the finder on the same page. `/docs-lab/plugins` is gone.
- **Every plugin page is a plate over its own prose.** `docs/plugins/+layout.svelte` puts `PluginPage.svelte` round each page whose frontmatter names a `package`. The plate is the name, install, config, what it reads and the example; after the prose come its options, read from its types, and the parts it exports. The pages lost their `#` title and their install and config blocks, which the plate draws from the package. The rest of each page's prose is unchanged.
- **The metadata lives where the proposal put it.**
  - Each plugin's `package.json` has the `mdsvex` field (`concerns`, `syntax`, `needs`, `waits`), with a changeset for the 16 packages.
  - The example is in the docs page's frontmatter (`example: { source, options, files, with }`), so the site stays canonical for it.
  - `authored.ts` is gone.
- **The plugins are `workspace:*` dependencies of `@mdsvex/site`.** The registry lists every `@mdsvex/plugin-*` in the site's `package.json` and reads each from its built package in `node_modules`: its `package.json`, its `dist` modules, and its `.d.ts` for the options. Nothing reads `plugins/*/src` by path any more.
- **A strict build fails** when a plugin the site depends on has no docs page naming it, when a syntax sample compiles the same without the plugin, or when an example doesn't compile.
- **Live in the browser:** 15 of 16, checked on the production build, diagram still static for the same reason.
- **The embeds page's example is a YouTube player,** not Vimeo. The plugin's Vimeo frame has no `encrypted-media` in its `allow` list, so Vimeo's player logs a permissions policy violation on every load. That is a one-word fix to `plugins/embeds/src/Vimeo.svelte`, left for pngwn to approve.
- **Code** is in `packages/site/src/lib/docs/plugins/`. Screenshots are in `design/screenshots/docs-plugins/`; `docs-lab-plugins/` keeps the prototype's.

## What is built

- **`/docs-lab/plugins`, the finder.**
  - Search reads a plugin's name, the syntax it reads, its directives, the nodes it acts on, its options and their doc comments, its description and keywords, and its concern. Each hit says what it matched (`matched option rel`).
  - A query of several words that appears whole in one term, such as `new tab` in `new_tab_label`, beats one that only matches word by word. A hit under a quarter of the best score is dropped.
  - A search that finds a core feature (math, footnotes, highlighting, heading ids, and so on) lists it under "built in", so `math` doesn't come up empty.
  - Browse by concern: the concerns sit above the list as phrase heads. `?q=` and `?for=` make a search linkable, and `/` focuses the search box.
  - Each plugin is a row: its name, what it does, and the syntax it reads, drawn as phrases of the score. Under that, a line of what it owns and acts on, read from the plugin itself, then what it needs. A row is a `<details>`. Opened, it shows the example: the score of the source beside the real output.
- **`/docs-lab/plugins/{tabs,toc,link-check}`, the plugin page.** One of each kind: a block syntax, a document-level plugin and a check. Each is an atlas plate with these parts:
  - the mark, the concern, the package and the name
  - install, and the one-line config
  - what it reads
  - the example
  - the options, read from its source
  - the edges
  - the components and stylesheet it exports
  - beside the plate, every plugin by concern
- **"Write your own"** is a plate at the foot of the finder, listing the four `docs/plugins/writing/` pages in order. The titles come from the docs nav's `?metadata`. Each plugin page's index also links to it.
- **Code.**
  - Shared pieces are in `packages/site/src/lib/docs-lab/plugins/`; the routes are in `routes/docs-lab/plugins/`.
  - `Score.svelte` needed no change. The finder's syntax phrases are drawn by `Syntax.svelte`, the score's vocabulary at one line, with the kind taken from the real parser.
- **Screenshots** are in `design/screenshots/docs-lab-plugins/`, taken from the production build at 1440 and 375 in light. There were no console errors and no horizontal overflow.

## The concern groups, and why

The groups are the jobs the 16 plugins actually do, not their node types. They are ordered the way a page gets written: shape it, fill it, connect it, check it.

| concern | plugins (first concern) | also listed |
| --- | --- | --- |
| Lay out a page | steps, tabs, elements | |
| Mark up text | emoji | elements, references |
| Show code | code-blocks | tabs (code groups), diagram |
| Pictures, video and diagrams | figures, embeds, diagram | |
| Help readers find their way | anchors, toc | |
| Link out and refer | external-links, references | |
| Cite and cross-reference | citations, numbering | figures |
| Know each page | page-data | toc (headings as data) |
| Catch broken things | link-check | |

- **A plugin has a first concern and may have more.** Browsing lists a plugin once, under its first concern, and its row says "also show code". Picking a concern lists every plugin that has it, so "show code" finds tabs for its code groups.
- **Nine groups for sixteen plugins.** Two groups hold a single plugin: emoji first, and link-check. Each is a real need that a reader names in those words ("emoji", "broken links"), so it stays separate rather than being folded into a vaguer group.
- **The names are needs, not nouns:** "Help readers find their way", not "Navigation". The search box asks "What do you want to do?" for the same reason.
- **No group for syntax.** Every plugin reads a directive, a fence or the nodes the parser already reads. The finder draws that, rather than suggesting a plugin adds syntax.

## Where plugin metadata should live

Most of what the finder shows is read from the plugin itself, so it can't drift. Only a few facts can't be read from code, and they need a home.

| fact | read from | how |
| --- | --- | --- |
| name, version, description, keywords | `package.json` | glob of `plugins/*/package.json` |
| optional peers (`pele`, `mermaid`) | `package.json` | `peerDependencies` and `peerDependenciesMeta` |
| components and stylesheet | `package.json` | `exports` keys ending `.svelte` or `.css` |
| directives it owns | the bundle | `Object.keys(bundle.directives)` |
| nodes it acts on, text, document hook | the bundle | the keys of `bundle.parse` |
| fences it claims | the bundle | `bundle.fences` |
| elements it replaces | the bundle | `bundle.components.names` |
| directives of another plugin it reads | the bundle | `bundle.parse.observe` |
| options, types, docs, `@default` | its source | the interface its factory takes, `export function x(options: XOptions = {}): Bundle`, parsed with its doc comments |
| the colour of a syntax | the parser | `pfm_tree` on the syntax sample |
| whether the page changes or only data or warnings do | the build | the example compiled with the plugin and without it |
| **concern** | authored | |
| **syntax samples** | authored | |
| **needs** (`heading_ids`, `unwrap_images`), **waits** (reads files) | authored | |
| **example**, **edges** | authored | |

The prototype keeps the authored facts in `lib/docs-lab/plugins/authored.ts`, keyed by package name. A plugin with no entry still shows up, under "Not sorted yet". The proposal is to move each fact to the place that owns it:

- **`concern`, `syntax` and `needs` go in a `mdsvex` field of the plugin's `package.json`:**
  ```json
  "mdsvex": {
  	"concerns": ["layout", "code"],
  	"syntax": [":::tabs", ":::tabs(group=pm)"],
  	"needs": { "heading_ids": true }
  }
  ```
  - They describe the package, so they travel with it to npm. A third-party plugin can set the same field.
  - A later finder could list third-party plugins from the npm search for the `mdsvex-plugin` keyword, which every first-party package already has.
  - The catalog already reads this field if it is present (`declared()` in `catalog.server.ts`), over `authored.ts`, which is the stand-in until the packages have it.
- **The example and the edges stay on the docs page.** The site is canonical (decision 5).
  - The example is a fence the page flags, as `svx result` is flagged today. A flag such as `svx plugin` would mean "compile this with this page's plugin on".
  - The edges are the page's prose. The plugin page then becomes the docs page's own layout, not a second copy.
- **Nothing is hand-listed.** A new folder under `plugins/` appears on the next build, and its row is filled in from whatever it declares.
- **The build checks the authored facts.** Every syntax sample is compiled with the plugin and without it, and must differ, so a row can't claim syntax the plugin doesn't read. The example must compile, or a strict build fails.

## Which plugins run live in the browser

An example is static until a reader presses Edit. That one press loads mdsvex, Svelte's compiler and the plugin, about 366 KB gzipped (the Svelte compiler is 230 KB of it). The page's own JavaScript is about 121 KB. From then on, every change compiles in the browser with the plugin on and is mounted where the built output was.

**15 of 16 run live.** I tested each one by opening it, pressing Edit and waiting for "Compiled in your browser"; an edited tabs example then had a working third tab.

| plugin | live | note |
| --- | --- | --- |
| steps, tabs, elements, embeds, figures, code-blocks, anchors, external-links, toc, emoji, references, numbering | yes | pure handlers and Svelte components |
| page-data | yes | `last_modified: 'git' \| 'fs'` imports `node:child_process` lazily, only when asked, so the defaults run. That option can't run in a browser |
| citations | yes | it reads the bibliography through `ctx.read`. The page supplies a `read` over the example's own files, so `./refs.json` is read from memory |
| link-check | yes | it checks the other document the same way, `./guide.svx` from memory. `routes` points at a directory on disk, so it would need a host that has one |
| **diagram** | **no** | `engine.ts` imports `createRequire` from `node:module` at the top, to find whether pele or mermaid is installed when `diagram()` runs. A browser bundle can't take that import, so `live.ts` leaves the folder out and the row says why. Its built output, the pele SVG, is real |

What would unblock diagram is a change to the plugin, which I have not made. One option: `engine: 'pele'` plus the pele module passed in, so the plugin never resolves anything. Another: a `browser` export condition whose `installed()` doesn't use `createRequire`. pele itself is plain ESM and may well run in a browser; I haven't tested it.

**How it runs.**
- mdsvex's `compile_async` runs with the plugin, then Svelte's `compile`.
- The compiled module's imports come from a map, in `link.ts`: Svelte's runtime, plus the plugin's own directive components, which Vite compiled as part of the site.
- The same linker renders every example on the server when the site builds. That is why the `result` fences of `build/examples.js` can't take a plugin today: their map holds only Svelte's runtime.
- An edit runs in the page, not in a sandboxed iframe, so it only runs what the reader typed on this page. A shareable link to an edited example would need the playground's sandbox.

**The playground (`@mdsvex/repl`) doesn't do this yet.**
- Its worker reads the directive modules a manifest names, but passes no `plugins` to `compile` (`packages/repl/src/workers/mdsvex.ts`, in `prepare`), so a plugin's handlers never run there.
- It fetches packages from jsdelivr, so it would get the published `0.1.0-next.0`, not the workspace source.
- The pending code task, plugins on demand in the worker (decision 8), could reuse this approach: put the plugin's handlers in the worker's `compile_async`, with a `read` over the playground's files, and resolve its directive module like any other package.

## What applying this to all plugin pages would take

1. **The packages.**
   - Add the `mdsvex` field to the 16 `package.json` files.
   - Add the site's dependency on the plugins as `workspace:*`, so it imports them by name rather than reading `plugins/*/src` by path as the prototype does (`registry.ts` says so).
   - Both need pngwn's go-ahead: the first touches every plugin package, and the second touches the site's `package.json` and the lockfile.
2. **The example on the docs page.** Each `docs/plugins/<name>/+page.svx` gets a flagged example fence. `build/examples.js` gets the module map from `link.ts`, so `result` can render a plugin's output. The plugin pages are then those `.svx` pages with the plate around them, from a plugins template or a layout under `docs/plugins/`.
3. **Thirteen more pages.** The shape fits each plugin without change. Edges are written for tabs, toc and link-check only; the other thirteen get theirs from their docs pages' prose. Elements, with eight directives, may want its example split so each directive shows.
4. **Diagram live**, if wanted: the plugin change above.
5. **The current `docs/plugins/+page.svx`** ("Using plugins", with its list of 16) becomes the finder.
6. **What I'd check before shipping:**
   - Every plugin's stylesheet is loaded on the finder, since a closed row's example is in the page. They share class names with the site: `.mark` from elements styled the plugin page's own mark until I renamed it. The selectors have no specificity, but they still apply.
   - The example output's links get `rel="external"` in the page view (the HTML view shows them as the plugin made them). Without it, the prerender crawler follows `/guide` and link-check's broken `#setup` and fails the build.
   - Opening the embeds row loads a Vimeo frame (`dnt=1`, `loading="lazy"`).

## Not done

- No dark mode check: the brief asked for light only.
- The `/docs-lab` index and its layout belong to the docs design round. These routes sit under whatever layout that session gives `/docs-lab`.
- No change to any plugin package, `Score.svelte`, the site config or `/atlas`.
