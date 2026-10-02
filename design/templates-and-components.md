# Templates and custom components: design

Status: draft for discussion, 2026-10-01. Targets `next`.

Sources:
- Trackers #829 (custom components), #830 (layouts) and #831 (frontmatter).
- Design threads #584, #230, #21, #77, #293, #455 and #242.
- About 120 related issues and PRs, linked inline below.

## 0. Where we are

`next` has none of this yet:

- **No layout support.** There is no `layout` option and nothing selects or wraps a layout.
- **No compile-time component substitution.** Tag names are literals in each renderer `case`, so there is no single place where an element could be swapped for a component.
- **Frontmatter isn't metadata yet.** It is parsed as a raw span and then dropped from the output. There is no YAML parsing and no `metadata` export.
- **Raw HTML already parses into element nodes.** `NodeKind.html` carries `tag`, `attributes` and `self_closing`, and component tags and lowercase tags share that one node kind. This makes it possible to substitute raw `<h1>` as well as `# h1`.
- **Directives are parsed, not rendered.** The parser records `name` and `args` for all three directive forms. The renderer has no case for them and just emits their children. *(Since 2026-10-02 they render as components; see §6.)*
- **Integration is a Vite plugin only.** `mdsvex()` registers a `transform` hook and a sourcemap post hook. There is no `resolveId`, no `load` and no Svelte preprocessor.
- **The core is already pure.** `packages/{parse,render}` use no `fs`, `path`, `process` or `require`. The only Node API in the package is `Buffer` in the sourcemap hook.

So this is a clean slate. We don't need to keep legacy behaviour, but it's worth stating which legacy behaviours survive (see §8).

## 1. Principles

Convention: every option key and frontmatter key we own is snake_case (`select_template`, `component_mode`, `parse_plugins`). Vite and Rollup hook names and upstream APIs keep their own casing.


1. **`compile()` stays pure.** It takes a string plus plain data and returns a string. It does no filesystem access, no path maths and no module resolution, so it can run in a browser (#230, #416). The core never resolves a template or component reference; it only *emits* references.
2. **Resolution, discovery, watching and conventions belong to the Vite plugin.** Vite already owns the resolver (aliases, and package.json `imports` such as kit 3's `#lib`), the module graph and HMR. We should use them, not imitate them.
3. **Everything is decided at compile time.** There is no runtime provider and no `<svelte:element>` fallback per tag. The compiler needs to know the *set of names* statically. It never needs the component values.
4. **Explicit, not magic.** Every substituted element traces back to something the user wrote down: a config entry, a module export or a frontmatter key. Conventions such as directory templates are opt-in plugin sugar.
5. **Svelte 5 only.** Output uses `<script module>`, `$props()` and snippets (`children`), never slots. This closes #649, #738 and #485 by construction.
6. **Replacements are scoped per template, and never only global.** Legacy lets each template swap elements for its own components, because templates are often styled completely differently. v1 keeps exactly that, plus an optional root fallback. The model underneath is a lexical scope chain. That keeps open the option of nested scopes (#601: markdown inside a component using *that component's* replacements) without committing to their cost now (§5.4).

## 2. Can we "just import the module and pass it in"?

Not literally. There are two reasons.

- **The config can't import `.svelte` files.** `vite.config.ts` is bundled by esbuild/rolldown with no Svelte loader, so importing a `.svelte` file there fails. SvelteKit 3 has dropped `svelte.config.js`, so `vite.config` is the only config there is. Legacy `svelte.config.js` setups ran under plain Node and had the same problem.
- **A component value would be useless anyway.** The compiled document is source code, and it needs an `import X from '<specifier>'` that the bundler can resolve. A live component object can't be serialised into that import. What the compiler needs is a *specifier* plus the *names* it exports.

The path friction in the issues (#720, #635, #556, #290, #73, #59, #39) comes from three things:

- Specifiers were resolved against `process.cwd()`, which changes with monorepos, CI hosts and the language server.
- The result was emitted as an absolute filesystem path, which broke on Windows escaping and in Parcel.
- Nobody used the bundler's resolver, so aliases (kit's `$lib` back then) never worked.

So the ergonomic goal is: *write the reference the way you'd write an import, and have it resolve the way an import would.* Three mechanisms get there.

**(a) The plugin resolves specifiers with Vite's resolver, relative to the Vite root.**

```ts
mdsvex({
  templates: {
    default: '#lib/templates/Post.svelte',        // package.json subpath import, kit 3's #lib
    docs: './src/lib/templates/Docs.svelte',      // relative to the vite root, not cwd
    blog: new URL('./src/Blog.svelte', import.meta.url), // relative to this config file
  },
})
```

The plugin resolves each one with `this.resolve(spec, <root>/vite.config)`. That covers:

- aliases;
- package.json subpath imports (`#lib/…`), which are resolved against the `package.json` nearest the importer;
- package exports (`@my/theme/Layout.svelte`);
- relative paths;
- `URL` objects.

The importer is the Vite root, so `#` imports resolve against the app's own `package.json`. In a monorepo, that's the app package, not the workspace root (#556). A failed resolution raises one error that names the template key, the specifier and the root (#39).

`new URL(…, import.meta.url)` is the closest thing to "pass the module in": it is anchored to the config file, so cwd doesn't matter. `import.meta.resolve('./Post.svelte')` returns the same kind of value and works too.

**(b) Compiled output imports virtual ids, never filesystem paths.**

```js
import Template from 'mdsvex:template/docs';
```

The plugin's `resolveId` maps `mdsvex:template/docs` straight to the real resolved file id. The module graph edge therefore points at the real `.svelte` file, so Vite's HMR and dependency tracking work with no extra code (#303, #474, #285). Output stays portable and cache-stable: it contains no absolute paths, no backslashes and no cwd.

The core is unaware of any of this. It emits whatever specifier string it is handed.

**(c) Replacements are declared by importing components into real modules, not by writing paths in config.**

The main place for replacements is the template's own `<script module>`. This is the legacy mechanism, and it keeps each template's components alongside it:

```svelte
<!-- src/lib/templates/Docs.svelte -->
<script module>
  export { default as h2 } from './docs/Heading.svelte';
  export { default as pre } from './docs/CodeBlock.svelte';
</script>
```

The user *does* import the Svelte files and pass them along; they just do it in a module Vite understands, not in config. Users get type checking, go-to-definition, aliases and refactoring, and they never write a path string for an individual component.

The compiler needs only the **export names**. The plugin gets them by statically scanning the `<script module>` block: extract that block only, strip TS, then run `es-module-lexer`. It never evaluates the module, and never runs the Svelte parser over styles or markup (#116, #485). The scanner is a standalone `(code) → names` function. v1 only runs it on template files, and deferred nested scopes (§5.4) would reuse it unchanged.

## 3. Architecture

```
            vite.config.ts                          (Node: plugin)
  ┌────────────────────────────────────────────────────────────────┐
  │ mdsvex({ templates, select_template?, components?,             │
  │          component_mode })                                     │
  │   configResolved:  resolve template + root specifiers (Vite)   │
  │                    scan template <script module> exports       │
  │                    (cached per resolved file)                  │
  │   transform(.svx): compile(src, plain_data)  ── pure, one shot │
  │   resolveId:       mdsvex:template/<name> → real file id       │
  │                    mdsvex:components    → real file id         │
  │   hotUpdate:       a template's export set changed →           │
  │                    invalidate the .svx files using it          │
  └───────────────────────────┬────────────────────────────────────┘
                              │ strings + string[] only
  ┌───────────────────────────▼────────────────────────────────────┐
  │ compile(source, CompileOptions)      (pure: parse + render)    │
  │   parse frontmatter → metadata                                 │
  │   select template                                              │
  │   scope chain = [selected template, root fallback]             │
  │   substitute each element from the first scope that has it     │
  │   emit <script module>, <script>, wrapper, body                │
  └────────────────────────────────────────────────────────────────┘
```

v1 knows every template up front from config, so the plugin can do all resolution and scanning at config time. Each transform is then a single pure `compile` call, with no per-document resolution, no fetching and no lexing. Nested scopes would need per-document work. §5.4 describes how they would slot in as an additive parse → render split.

### 3.1 Core `compile()` options (pure data)

```ts
interface CompileOptions {
  // existing
  parse_plugins?: ParsePlugin[];
  sourcemap?: boolean;
  /** Replaces the built-in YAML subset parser; see Q7. */
  frontmatter?: { parse?: (raw: string) => Record<string, unknown> };

  /** Named templates; see §4. */
  templates?: Record<string, TemplateEntry>;
  /** Template used when neither frontmatter nor select_template picks one. */
  default_template?: string;
  /**
   * Called when frontmatter has no `template` key. Return a name, `false` for none,
   * or `undefined` to fall through to default_template. The plugin binds the file id.
   */
  select_template?: (metadata: Record<string, unknown>) => string | false | undefined;

  /** Optional root fallback scope(s), lowest precedence, applies even with template: false. */
  components?: ComponentSource[];
  /** Root fallback directive replacements, a namespace apart from components; see §6. */
  directives?: ComponentSource[];
  /** Which elements are eligible for substitution; see §5. */
  component_mode?: 'markdown' | 'all';
}

interface TemplateEntry {
  /** Emitted verbatim as an import specifier. */
  specifier: string;
  /** Names the template's <script module> exports (its replacements). */
  components?: string[];
  /** The module its `directives` namespace export re-exports, and that module's names; see §6. */
  directives?: ComponentSource;
}

interface ComponentSource {
  specifier: string; // emitted verbatim
  names: string[];   // the module's export names
}
```

With these options, a browser REPL or a non-Vite user can call `compile(src, { templates: { default: { specifier: 'https://esm.sh/…' } } })` with no plugin involved.

### 3.2 Generated output (sketch)

In this example:

- **The `project` template** exports `h2`, `h3` and `p`.
- **A root fallback module** exports `img`.

In v1, `<Aside>` is just a component. Markdown inside it uses the template's replacements, because substitution follows where the markdown is written. §5.4 shows the same document with nested scopes.

Input:

```md
---
title: Hello
template: project
---

<script>
  import Aside from '#lib/Aside.svelte';
</script>

## Header 2

A first paragraph ![cat](./cat.png)

<Aside>

### Header 3

A second paragraph

</Aside>
```

Output:

```svelte
<script module>
  export const metadata = { "title": "Hello", "template": "project" };
</script>

<script>
  import Aside from '#lib/Aside.svelte';
  import Template_MDSVEX, { h2 as H2_T, h3 as H3_T, p as P_T } from 'mdsvex:template/project';
  import { img as Img_G } from 'mdsvex:components';     // root fallback
  let __mdsvex_props = $props();
</script>

<Template_MDSVEX {...metadata} {...__mdsvex_props}>
  <H2_T id="header-2" level={2}>Header 2</H2_T>
  <P_T>A first paragraph <Img_G src="./cat.png" alt="cat" /></P_T>
  <Aside>
    <H3_T id="header-3" level={3}>Header 3</H3_T>
    <P_T>A second paragraph</P_T>                     <!-- still the template's p in v1 -->
  </Aside>
</Template_MDSVEX>
```

The output follows these rules:

- **Imports are per name.** Each substituted name gets its own named import, never `import * as Components`, so Rollup tree-shakes unused components.
- **These elements are hoisted out of the wrapper**, matching legacy #10 and #33:
  - the user's `<script>` and `<script module>`;
  - `<style>`;
  - `<svelte:head>`, `<svelte:window>`, `<svelte:body>`, `<svelte:document>` and `<svelte:options>`.
- **The core already hoists bare imports into the instance script** (`60da6831`). Generated imports join them there.

## 4. Templates

### 4.0 Naming

The concept is called a **template**. In legacy it was called a layout.

- **Config:** `templates`.
- **Frontmatter:** `template:`.
- **Hook:** `select_template`.

**Why not "layout".** "Layout" is the most common name for this in static-site generators: Jekyll, Eleventy, Astro and VitePress all use `layout:`. But in Svelte land it collides with SvelteKit's `+layout`, which is route-based, nested and chosen by the filesystem (#584, #691). Ours is chosen per document, and it carries element replacements as well as a wrapper.

**Prior art for "template".** Gatsby, Pandoc and Hugo all call their equivalents templates, and danferns suggested the name in #584. The cost is a mild overlap with Svelte's own use of "template" to mean a component's markup.

Alternatives we considered:
- **`kind`/`type`.** Prior art: Hugo and Contentlayer. It clashes with common user frontmatter keys.
- **`theme`.** Prior art: Docusaurus and VitePress. It implies a single site-wide choice.
- **`frame`.** It has no prior art.


### 4.1 Contract

A template is a Svelte 5 component that receives:

- **Every frontmatter key as a prop**, spread from `metadata` as in legacy, so `let { title, children } = $props()` just works.
- **`children`**: a snippet containing the document body.
- **Any props passed to the document itself**, forwarded as in #244 and PR #810, so `<Post foo={1} />` reaches the template.

Collision rule: frontmatter can't define `children`. Doing so is a compile error that points at the frontmatter line.

### 4.2 Selection, in order

1. Frontmatter `template: false` means no template.
2. Frontmatter `template: <name>` selects that template. If the name is unknown, it is a compile error that lists the known names. (Legacy silently fell back.)
3. `select_template(id, metadata)`, if configured. It returns a name, `false` or `undefined`. This replaces legacy's "folder name matches layout key" heuristic, covers per-directory templates (#230) and handles exclusions (#241):
   ```ts
   select_template: (id, metadata) =>
     id.includes('/changelog/') ? false : id.includes('/blog/') ? 'blog' : undefined
   ```
4. The `default` entry in `templates`, if there is one. It replaces legacy's magic `_` key.
5. Otherwise, no template.

**All of this runs in the core.** The selector needs `metadata`, and the core is what parses the frontmatter. So the plugin passes the core a selector with the file id already bound: `select_template: (m) => user.select_template(id, m)`. It is still pure: just a function, with no Node APIs involved.

**Per-import override (#312):** the plugin accepts `import Post from './post.svx?template=false'` or `?template=bare`. It is cheap to add, since the query is already in the id.

### 4.3 What disappears by construction

- **Templates processed by themselves** (#277, #241). `next` only transforms configured extensions (`.svx`), never `.svelte`.
- **mdsvex parsing the whole template file** (#116 SCSS, #485 TS). We only extract the `<script module>` block, strip TS from it, then lex its exports. Styles and markup are never touched. For templates from packages, the `{ template, components }` config form avoids the scan entirely.
- **Absolute and Windows paths in output** (#290, #73, #720), via §2(b).
- **No HMR for templates** (#303), because the import is a real graph edge. The one remaining case is when a template's *export names* change: the compiled `.svx` must then be recompiled. The plugin watches each scanned template and re-scans it in `hotUpdate`. If the name set changed, it invalidates the `.svx` modules that used that template; it records `doc → [scanned files]`, which in v1 is only ever the template. If only component bodies changed, normal Svelte HMR handles it.

### 4.4 Relationship to SvelteKit `+layout`

The two coexist, because they solve different problems. A kit `+layout` is chosen by route. An mdsvex template is chosen by document, can be imported anywhere, and works outside kit.

Two things should be explicitly out of scope here, but worth noting:

- **Exposing `metadata` to kit `load`/`+layout`** (#313, #423, #448) is a frontmatter-export concern for #831. It is not part of templates.
- **Naming.** "Layout" collides with kit vocabulary (#584, #691), which is why the concept is called a *template* (§4.0).

## 5. Custom components (element substitution)

### 5.1 Sources and precedence (v1)

The renderer resolves each eligible element through a **scope chain**, closest first:

1. **The selected template.** Its `<script module>` exports work exactly as in legacy, and this is the main mechanism. Different templates can style everything differently.
2. **The optional root fallback** (`components` option in the plugin, one or more modules). It applies even with `template: false`.
3. **No match**: the plain element is rendered.

There are two ways to give a template a set:

- **Exports in the template file:**
  ```svelte
  <script module>
    export { default as h2 } from './docs/Heading.svelte';
  </script>
  ```
- **Config, for a template you can't edit:** `templates: { theme: { component: '@acme/theme/Layout.svelte', components: '#lib/theme-overrides.ts' } }`. The config set is merged over the template's own exports.

There are two points about the chain:

- **The lookup is a chain, even though v1's chain is never longer than two.** The chain is one merged name → local map per (template, root) pair. It is computed once per config and cached, so the renderer does one lookup per element. The renderer must look names up through `scope.get(name)`; it must not bake a flat table into the session. A later push or pop at component boundaries then needs no redesign.
- **The document can't define replacements itself.** Writing raw HTML or using a component directly already covers one-off changes. Per-document sets are Q4.

### 5.2 Modes: which elements are eligible

This is a global `component_mode` option:

| mode | substitutes | doesn't substitute |
|---|---|---|
| `'markdown'` (default) | elements produced by markdown syntax (`#`, `![]()`, fences, lists, tables, `---`, emphasis…) plus elements created by parse plugins | HTML the author typed (`<h1>`, `<img>`) |
| `'all'` | the above **plus** lowercase HTML elements written in the document | `<svelte:*>`, capitalised components, elements carrying directives (see below) |

`'markdown'` as the default means typing raw HTML is the natural escape hatch. In `'all'` mode, the escape hatch is `<svelte:element this="img">`. This covers #314, #815 and the `pre`/`code`/`hr` gaps (#100, #696), because every element kind goes through the same lookup.

**Elements with directives in `'all'` mode.** A component can't take element directives: `bind:`, `on:`/`onclick` handlers bound to the element, `use:`, `class:`, `style:`, `transition:`, `animate:`. An element carrying any of these stays a plain element, and the compiler emits a warning naming it. Plain attributes, `{expr}` attributes and spreads pass through as props.

**Lowercase custom tags.** With `component_mode: 'all'`, a name exported by any active scope, such as `warning`, also matches `<warning>`. That gives the "global component" users ask for (#815, #184) without magic: it only works because a template or the root module exported it. Uppercase names still need an import, as in Svelte.

### 5.3 Props contract

Every substituted element receives:

- **Its attributes as props.** This includes ones added by plugins, such as autolink's `id` (#506, #549).
- **`children`**, as a snippet, unless the element is void (`img`, `hr`, `br`, `input`).

Plus the following per-kind extras, so one component can serve several tags:

| element | extra props |
|---|---|
| `h1`–`h6` | `level` |
| `img` | `src`, `alt`, `title` (as attributes) |
| `a` | `href`, `title` |
| `pre` (fenced code) | `lang`, `meta` (raw info string, #289), `code` (raw source text); `children` = the default rendering (highlighted once a highlighter exists, #827) |
| `code` (inline) | `children` |
| `ol` | `start` |
| `li` | `checked` (task items) |
| `th`/`td` | `align` |

Svelte 5 doesn't warn about unknown props, so the extras cost nothing for components that ignore them (#510).

**Paragraphs around component images.** Per #430, a paragraph that contains only tags or components isn't wrapped in `<p>`. That rule (`60da6831`) already covers `![]()` → `<Img_MDSVEX>`.

### 5.4 Nested scopes: deferred, kept possible

#601 asks for regions of a document to use a different set: markdown inside `<Aside>` should use Aside's `p`. This is deferred. It requires tracking the document's imports and which components wrap markdown, then resolving and lexing those files on every transform. That is the main source of complexity and cost in the whole design, so it waits until we know it's worth it.

**What it would look like.** These are the §3.2 input and output with `Aside.svelte` opted in as a scope that exports `p`:

```svelte
  import { p as P_S1 } from '#lib/Aside.svelte';
  …
  <Aside>
    <H3_T …>Header 3</H3_T>            <!-- Aside has no h3 → falls back to template -->
    <P_S1>A second paragraph</P_S1>    <!-- Aside's p wins inside Aside -->
  </Aside>
```

**What it would add.** Each item is additive to v1:

- **A two-phase core API.** `session.parse(src) → { metadata, wrappers }`, then `doc.render(opts)`. `CompilerSession` already parses into a buffer before rendering, so this exposes an existing seam. The one-shot `compile` stays.
- **An optional `scopes` field on `CompileOptions`.** It maps the specifier as written in the document to `{ specifier, names }`. Omitting it gives v1 behaviour.
- **Per-transform plugin work.** For each wrapper, the plugin runs `this.resolve(spec, id)` and follows barrel re-exports to the `.svelte` file. It then runs the same scanner as v1, cached per resolved file id.
- **Renderer push and pop.** The renderer pushes a scope at the open of a scoping component and pops it at the close. The chain lookup from §5.1 doesn't change.
- **Larger HMR dependency sets.** A document's scanned files grow from `[template]` to `[template, …wrappers]`.

**Constraints v1 must honour so the door stays open:**

1. **Nested scopes must be opt-in per component.** *(Decided 2026-10-01: in v1 the element-named-exports convention applies to templates only.)* If they shipped later with legacy's implicit "element-named exports" rule, any component that already happens to export, say, `a` or `p` would silently change output inside every document that wraps markdown in it. That is a breaking change. So the implicit rule stays a **template** convention. A component becomes a scope only through something that doesn't exist today, for example:
   - a marker export (`export * as markdown from './md.ts'`);
   - a config entry (`scopes: { '#lib/Aside.svelte': … }`);
   - a plugin flag.

   This also settles the accidental-replacement worry (a helper `const a` replacing `<a>`) for wrappers.
2. **Substitution is lexical and compile-time only.** v1 must not deliver replacements through runtime context, such as a template calling `setContext('mdsvex-components', …)` that elements read. Runtime delivery would follow the *component tree*, while nested scopes follow the *source text*. The two disagree as soon as a component renders its `children` somewhere else.
3. **Closer always wins.** v1 already orders the chain template before root. Wrappers would slot in ahead of the template, so no existing precedence flips.
4. **The chain lookup goes through `scope.get` in the renderer** (§5.1). Generated local names come from a per-scope counter and aren't API, so new `_S1`-style names can't collide.
5. **The scanner is a standalone `(code) → names` function**, and plugin dependency tracking is keyed `doc → [files]` (§4.3).

**Questions to settle when this is picked up:**

- **Opt-in mechanism.** Which of the three options above?
- **Reset.** Can a scope opt out of inheritance, for example plain elements inside `<Card>` even though the template replaces them?
- **Which components open a scope.** Only those with markdown children, or self-closing ones too?
- **Non-scope paths.** What about components rendered via `<svelte:component>`, or conditionally?

## 6. Directives → components

Generic directives are parsed with `name`, `args` and bracket content. Each one renders as a component from a **directives namespace** that is separate from element replacements (Q6):

```md
:::Callout[Heads up](kind=warn)
Body **markdown**
:::
```

```svelte
<Callout_MDSVEX_D_T kind="warn">{#snippet label()}Heads up{/snippet}
  <p>Body <strong>markdown</strong></p>
</Callout_MDSVEX_D_T>
```

### 6.1 Declaring directives

A module's element-named exports replace elements. Its `directives` **namespace export** holds its directives:

```ts
// src/lib/markdown.ts: a root components module
export { default as img } from './Img.svelte';
export * as directives from './directives.ts';

// src/lib/directives.ts
export { default as Callout } from './Callout.svelte';
export { default as note } from './Note.svelte';
```

```svelte
<!-- a template's module script -->
<script module>
  export { default as h2 } from './docs/Heading.svelte';
  export * as directives from './docs/directives.ts';
</script>
```

The same rule applies everywhere a replacement module appears, so there is no extra option:

- **Root fallback:** each `components` module can carry a `directives` namespace export.
- **Per template:** the template's `<script module>` can carry one.
- **Config overrides for a template you can't edit:** the `components` module can carry one.

The rule has these consequences:

- **Matching.** A directive name matches an export name exactly. `:::Callout` matches `Callout` and `:::note` matches `note`. A name that isn't an identifier, such as `:::my-box`, matches an ES2022 string export, `export { default as "my-box" }`.
- **Static analysis only.** `scan_exports` records `export * as name from 'specifier'` as a namespace. The plugin resolves the specifier from the owning module, then scans that module with the same scanner. Any other form of a `directives` export is a startup error, because its names can't be read without running the module. That covers `export const directives = {…}` and `import * as d; export { d as directives }`.
- **Never an element name.** The `directives` export itself is never treated as an element name, so `<directives>` in `'all'` mode isn't replaced.
- **Output.** Compiled output imports each used directive by name from a virtual id: `mdsvex:directives`, or `mdsvex:directives/<i>` beside `mdsvex:components/<i>`. A template's is `mdsvex:template-directives/<name>`, or `mdsvex:template-directives/<name>/components` for the namespace of its config override module. Locals use their own suffix (`_MDSVEX_D_<scope>`), so they never collide with element locals.
- **Core input.** The core receives directives as pure data: `CompileOptions.directives` for the root, and `TemplateEntry.directives` per template.
- **HMR.** The plugin tracks the directives module like any scanned file. If its export set changes, the documents that used it recompile. If the owning module drops or moves its `directives` namespace, the registry resolves again on the next transform.

### 6.2 Lookup and precedence

- **A separate scope chain.** Directives resolve through a second `ComponentScope` chain, closest first, with the same shape as §5.1. The chain is the selected template's directives, then the root modules' directives in order, with a later module winning. The renderer looks names up through `scope.get`, as for elements.
- **Separate namespaces.** An element export `table` never serves `:::table`, and a directive `p` never replaces paragraphs.
- **Plugin fallthrough.** A directive with no component falls through to parse-plugin `directive_inline`, `directive_leaf` and `directive_container` handlers. A plugin handles a directive by rewriting the node, for example `node.type = 'block_quote'`.
- **Registered beats plugin.** A registered directive never reaches a plugin's directive handlers. The template is picked after the parse, so every name the root or any template registers is held back from plugins. The parser sets `name` after the open, so with directive replacements configured, the core runs a plugin's directive handler at the close, where `node.attrs.name` is known. Handlers that key on the name already have to work there.
- **Unhandled is an error.** A directive left in the tree with no component is a compile error naming it, for example `no component renders the directive :::thing at 3:1 …`. It is thrown as a `DirectiveError` with `directive`, `line` and `column`. It used to render as its children, and a leaf vanished. The renderer only throws when `strict_directives` is set, which `compile()` always sets. A preview renderer keeps rendering children.

### 6.3 Props contract

- **Args** become string props: `kind="warn"`, or `v={"{a}"}` when the value holds braces, so they are never read as expressions.
- **Bracket content** of a leaf or container becomes a `label` snippet. This also answers "named slots for a blockquote title" (#263). The parser parses it as inline content into a `directive_label` node, the directive's first child, so the snippet renders `:::x[Heads *up*]` as `Heads <strong>up</strong>`, with replaced elements and inline directives inside. Empty brackets pass no snippet, so `{#if label}` works.
- **Inline** `:name[…]` passes its content as `children`.
- **Container** passes its body as `children`.
- **Leaf** `::name[…]` passes `label` only.
- **Reserved names.** An arg named `children` is a compile error, and so is `label` on a leaf or container. On an inline directive, `label` is a plain prop.
- **Void output.** A directive with no label and no children renders self-closing.

### 6.4 Nested scopes later (§5.4)

The `directives` namespace export is the §5.4 "marker export" shape. A wrapper component could opt in as a directive scope the same way, with no new concept. The renderer pushes and pops the directive chain alongside the element chain.

## 7. Plugin config, all together

```ts
// vite.config.ts
mdsvex({
  extensions: ['.svx', '.md'],
  templates: {
    default: '#lib/templates/Post.svelte',               // replacements from its <script module>
    docs: '#lib/templates/Docs.svelte',
    theme: { component: '@acme/theme/Layout.svelte',     // a template you don't control
             components: '#lib/theme-overrides.ts' },
  },
  select_template: (id, metadata) => (id.includes('/changelog/') ? false : undefined),
  components: '#lib/markdown/defaults.ts',               // optional root fallback, may export * as directives
  component_mode: 'markdown',
});
```

The plugin builds the template and root parts of `CompileOptions` once per config resolution, and again whenever an HMR re-scan changes them. In v1 there is no per-document resolution. Every transform reuses the same options, apart from binding the file id into `select_template`.

```ts
{
  templates: { default: { specifier: 'mdsvex:template/default', components: ['h1', 'p'] }, … },
  default_template: 'default',
  select_template: (m) => user_select(id, m),   // bound per transform
  components: [{ specifier: 'mdsvex:components', names: ['img', 'pre'] }],
  directives: [{ specifier: 'mdsvex:directives', names: ['Callout', 'note'] }],
  component_mode: 'markdown',
}
```

## 8. Legacy compatibility

| legacy | next |
|---|---|
| `layout: './src/Layout.svelte'` (string) | `templates: { default: … }` |
| `layout: { _: …, blog: … }` | `templates: { default: …, blog: … }` |
| folder-name auto-match | `select_template(id, metadata)` |
| legacy layout module exports → components | kept as the main mechanism (§5.1); nested scopes possible later (§5.4) |
| frontmatter `layout: false` / `layout: name` | `template: false` / `template: name`. The migrator rewrites the key; Q11 covers accepting `layout:` as a deprecated alias. |
| `{...$$props}` / `layoutPropForwarding` | always runes forwarding |
| `<slot />` in layouts | `{@render children()}` in templates |
| `import * as Components` | per-name imports |

`@mdsvex/migrate` can rewrite the config shape and flag `<slot />` in templates.

## 9. Prerequisites and phasing

0. **Prerequisite: frontmatter → `metadata`** (#831). This needs YAML parsing in core: our own subset parser plus an optional injected `parse` function (Q7). It also needs the `<script module>` export, and the existing module-script merge must be correct (#261). `compile()` returns the metadata too, so the plugin and template selection don't parse it again.
1. **Templates.** Core: the selection plus wrapper plus hoisting rules in §3.2 and §4. Plugin: specifier resolution, `resolveId`, template export scan, HMR invalidation.
2. **Components, `'markdown'` mode, template scope.** Ship per-template replacements at legacy parity, plus the root fallback. The renderer needs:
   - **A per-kind tag lookup in the fold renderer.** The fast path must be unchanged when no names are registered, so put the check behind one `if (has_components)` per open/close. Measure it with `packages/bench/perf`.
   - **Lookups through the scope chain.** These go through `scope.get(name)` (§5.1), so that nested scopes stay possible.
3. **`'all'` mode.** Changes to the `K_HTML` render path:
   - Disable the source-slice passthrough for substituted self-closing tags.
   - Fix spread attribute rendering (`{...x}` currently looks like it renders as `...x={...x}`; to verify).
   - Add the directive rule.
4. **Directives → components** (§6). *Done, for the root fallback and per template.*
Deferred: **nested scopes** (§5.4). Pick these up only once the per-template sets are in use and #601-style demand is clear.

5. **Language tools.** *Done, 2026-10-02.* The editor learns the config without running Vite, from the first of these found walking up from the document:
   - **`node_modules/.mdsvex/manifest.json`.** The plugin writes it when its resolution or scan changes. It holds each `mdsvex:*` id resolved to a file, the scanned names, `component_mode`, `extensions`, whether a custom frontmatter parser, a parse plugin that handles directives, or `select_template` is configured, and the template `select_template` last picked for each document. It is stale until Vite has run once, like `.svelte-kit`.
   - **`mdsvex.config.json`.** The playground's static config. language-core resolves its relative, `file:`, `#` subpath and package specifiers itself, without Vite aliases, and reads export names from the TypeScript syntax tree.

   We rejected having `language-core` load the Vite config itself: it would run user code in the editor, it is slow, and the synchronous tsserver plugin can't await it. A config path option for the extension would be a second source of truth with no Vite resolution.

   `pfm_to_svelte` now runs core `compile()` with `strict_directives: false`, a pure option added for editors, instead of a parallel converter. It then rewrites `mdsvex:*` imports to the resolved files, maps each replaced element and directive to its export for hover, maps directive args to their props, and checks the frontmatter against the template's props with `satisfies`. Compile errors become editor diagnostics. Without a config, nothing is replaced and unknown directives aren't reported. See `language-tools/ARCHITECTURE.md`.

## 10. Open questions

- **Q1. Naming.** *Resolved 2026-10-01: "template" (§4.0).*
- **Q2. Mode granularity.** Is a global `component_mode` enough? Or do we want per-name control, for example `'all'` for `img` but `'markdown'` for `a`? One option is `component_mode: { all: ['img', 'table'] }`. I'd ship global first.
- **Q3. Is the root fallback needed at all?** With per-template sets, the root `components` module only matters for `template: false` documents and for sites with no templates. It is cheap to keep, but it is extra surface.
- **Q4. Per-document sets.** Is a frontmatter `components: blog` key selecting a named set (#455's `type` profiles) worth it, or would nested scopes (§5.4) cover the same need better if they ever ship? My view: leave both out of v1.
- **Q5. Metadata as spread vs. a single prop.** Spreading is friendly and legacy-compatible, but it collides with `children` and with forwarded document props. The alternative is `metadata={…}` as one prop.
- **Q6. Directive namespace.** *Resolved 2026-10-02: a separate namespace, declared by a `directives` namespace export (`export * as directives from './directives.ts'`) in any replacement module (§6.1).* We considered two alternatives. A separate `directives` option has no self-contained per-template form. A capitalisation rule is lossy, and it would silently register capitalised helper exports. Sharing one registry would make `:::table` and `<table>` both hit a `table` export.
- **Q7. YAML in core.** *Resolved 2026-10-01: both.* Core ships its own lightweight YAML parser in plain JS, with no Node APIs, so `compile()` still runs in a browser. It covers the common cases: plain and quoted scalars, numbers, booleans and null, dates as strings, nested maps, block and flow sequences, `|` and `>` blocks, and comments. Anything else throws an error that names the line and suggests a parse function. `frontmatter: { parse?: (raw: string) => Record<string, unknown> }` replaces the built-in parser, for full YAML or another format.
- **Q8. Non-Vite story.** Is "pass specifiers to `compile()`" enough for everyone else, or do we want a thin Svelte-preprocessor wrapper? A preprocessor wrapper could emit the same virtual ids, but only if some resolver knows them.
- **Q9. Registering extensions (SvelteKit 3).** *Resolved 2026-10-01: `mdsvex({ extensions })` registers its extensions with kit through kit's exposed config, so they no longer need repeating in `sveltekit({ extensions })`. Checked against kit 3.0.0, vite-plugin-svelte 7.3.1 and Vite 8.3.2.*

  **Why a normal config-hook return doesn't work.** vite-plugin-svelte merges only its inline options and `svelte.config.js`, inside its own `config` hook (`order: 'pre'`). It never reads the Vite config. In kit 3, `sveltekit()` builds those inline options with `configFile: false`. So returning `{ … }` from our hook can't reach vite-plugin-svelte.

  **What does work.** Kit 3 exposes its validated config on `vite-plugin-sveltekit-setup`'s `api.options`. That object's `extensions` array is the *same reference* that kit hands to vite-plugin-svelte (`inline_vps_config.extensions = svelte_config.extensions`). vite-plugin-svelte's merge keeps that reference (`arrayMerge: (t, s) => s ?? t`), and kit builds its route manifest from the same array later and lazily. So our `config` hook (`order: 'pre'`) does the following:
  1. Flattens `config.plugins`, which can contain promises because `sveltekit()` is async.
  2. Finds the kit setup plugin.
  3. Pushes our extensions onto `api.options.extensions` in place.

  This was verified in four cases:
  - **Build:** `+page.svx` compiled to a route entry.
  - **Dev:** `/doc` returned 200, with the markdown rendered on the server.
  - **Control:** with no push, there was no `.svx` route.
  - **Plugin order:** it works whether `mdsvex()` comes before or after `sveltekit()`. The array is read later, in vite-plugin-svelte's `configResolved`, which builds the id filter, and in kit's lazy manifest.

  **Caveats:**
  - **It depends on two internals:** kit sharing the array reference, and vite-plugin-svelte's array-merge behaviour.
  - **It mutates kit's module-level default.** When the user sets no `extensions`, kit's fallback `['.svelte']` is a single array shared by every `sveltekit()` call in the process. An `includes` guard keeps the push idempotent, but it is still shared mutable state.
  - **Plain vite-plugin-svelte (no kit)** has no equivalent handle. Its `api.options` only exists after `configResolved`, and by then the id filter has already been built. That case is reasoned from the source, not tested.

  **What shipped:**
  - The plugin injects through kit's `api.options` when it is present.
  - In `configResolved`, it reads `vite-plugin-svelte:config`'s `api.options.extensions`. If our extensions are missing, as with plain vite-plugin-svelte or a future kit change, it throws an error telling the user to add them to `sveltekit({ extensions })` or `svelte({ extensions })`.
  - An integration test builds and serves a `+page.svx` route in a kit 3 app, in both plugin orders, and checks the error with plain vite-plugin-svelte. A kit or vite-plugin-svelte upgrade that breaks either internal fails it.

  **Still open:** ask upstream for a sanctioned hook. For example, vite-plugin-svelte could read extra `extensions` from a `config()`-returned field, or kit could document `api.options` as mutable during `config`.
- **Q11. `layout:` alias.** Should frontmatter `layout:` be accepted as a deprecated alias for `template:` for one major version, with a warning? `@mdsvex/migrate` can rewrite the key either way, so the alias only helps people who upgrade without running the migrator. The risk is that `layout` is a common user-owned key.
