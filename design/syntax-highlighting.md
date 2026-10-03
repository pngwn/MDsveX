# Syntax highlighting: design

Status: drafted and agreed 2026-10-03 (decisions in §13). Targets `next`.

Sources:
- Trackers #827 (highlighter pipeline), #826 (code block contents mangled), #832 (dynamic and executable code blocks), #824 (Svelte-significant characters) and #829 (custom components).
- pngwn's 2024 checklist in #588.
- About 200 related issues and PRs, linked inline below.
- Twinkleplop's docs (https://twinkleplop.pngwn.at/docs) and its source.

## 0. Where we are

On `next`:

- **There is no highlighting.** There is no option, no hook and no dependency. A fence renders as `<pre><code class="language-{info}">{escaped text}</code></pre>`.
- **The whole info string ends up in the class.** ```` ```sh title="shell" ```` renders `class="language-sh title=&quot;shell&quot;"`, which #870's own example shows.
- **Braces in code are not escaped (#839).** Svelte evaluates `{` in a code block as an expression. The entity half (#841) landed in #889. The brace half (commit `f084b62a`, local branch `p/escape-code-braces-hold`) escapes `{ }` in fence text, code spans and the info string across all five render walks. It is held back because it breaks the docs site's post-compile highlighting, so it lands with phase 2.
- **Compile is synchronous end to end.** That includes `compile()`, `CompilerSession`, the renderer, language-tools (tsserver can't await) and the REPL worker. Only the Vite plugin's `transform` can await, and it already does for template and component registries.
- **`pre` can be replaced already (#870).** The component receives `lang`, `meta`, `code` (raw source) and `children` (the default `<code>`).
- **PFM already has an inline language hint.** In `` `#!js foo()` `` the parser records the `#!js` hint as `info_start`/`info_end` on the code span. The renderer ignores it.
- **The `next` docs site highlights after compile.** It regex-matches the `<pre><code class="language-…">` that compile emits and runs refractor through `{@html}` (#869). Once braces become `&#123;` that breaks (it only un-escapes `&amp; &lt; &gt; &quot;`), so the site has to move to whatever lands here.

What legacy (0.x) did, and why most of the issue volume exists:

- **Escaping was split between mdsvex and every highlighter.** Highlighted code was emitted as `` {@html `…`} `` with Prism by default. Every highlighter had to make its output safe for a template literal inside Svelte markup, using `escapeSvelte` for `` { } ` `` and `\t \r \n`.
- **Users got that escaping wrong in many ways.** About 25 issues come from it: #117, #211, #212, #224, #379, #390, #392, #481, #492, #514, #524, #528, #636, #747.
- **Prism's UMD packaging was its own source of bugs:** #431, #484, #486, #548, #719, #734.
- **rehype plugins couldn't see `pre > code`:** #139, #304, #534, #554, #706, #737.

On `next` we start clean: there is no Prism, no `{@html}` and no remark/rehype.

## 1. Principles

1. **mdsvex owns Svelte safety.** A highlighter, whether built in or custom, returns ordinary HTML. mdsvex alone makes it safe to drop into a Svelte component. Users never escape for Svelte, and `escapeSvelte` goes away. #826 asks for exactly this: "the escaping needs to move out of the highlighter's hands".
2. **Highlighting stays compile-time and synchronous in the core.** `compile()` takes the highlighter as plain data (functions are fine) and stays pure. It does no I/O and no dynamic imports, so it still runs in a browser, a worker or the REPL. Anything async, such as loading languages or twoslash, happens once in the Vite plugin before `compile()` is called.
3. **Twinkleplop is the default, and every part of it can be replaced.** It is synchronous, pure, ESM-only and fast. Its features (directives, meta conventions, inline structure, line numbers, twoslash) map onto what the issues ask for. A custom highlighter is a single function.
4. **Highlighted output is markup, not `{@html}`.** That is what makes live expressions in code (§5) and component replacement of `pre` (§7) possible. Svelte 5 hoists static markup into one template string, so it doesn't cost size. This was the reason for #81's `{@html}`; see §4.3.
5. **Code is inert unless the author marks a piece of it as live.** The escape hatch is per expression, never per block by default. This is pngwn's long-standing objection to a block-level flag (#739): `function () { … }` has to stay escaped.
6. **Ship the twinkleplop pieces upstream, not as workarounds.** mdsvex needs two small, generic additions to twinkleplop (§8). Both are useful to any template language (Vue's `{{ }}`, Angular, Jinja), not just to us.

Snake_case for all option keys we own, as before.

## 2. Architecture

```
vite plugin (async, node)                     core compile() (sync, pure)
──────────────────────────                    ───────────────────────────
resolve highlight options                      parse → fences/code spans carry
load twinkleplop languages (once, lazily) ─┐   raw info + content
load twoslash if enabled (once)            ├──► render: for each fence/span
build the highlight config                 ┘     highlight(code, info)  ── twinkleplop path or custom fn
                                                  → make Svelte-safe (§4)
                                                  → wrap / replace pre (§7)
                                                  → live expressions + mappings (§5)
```

### 2.1 Core `compile()` option

```ts
interface CompileOptions {
  // ...existing
  highlight?: HighlightConfig | Highlighter | false;
}

// a resolved, synchronous configuration. The plugin builds one with
// `create_highlight()` from "mdsvex/highlight" (§3); compile() never imports languages.
interface HighlightConfig { /* opaque, produced by create_highlight() */ }

type Highlighter = (code: string, info: CodeInfo) => string | null | undefined;
interface CodeInfo {
  lang: string;          // "" when the fence names none
  meta: string;          // the rest of the info string, raw
  inline: boolean;       // code span vs fence
  filename?: string;
}
```

`compile()` defaults to `highlight: false`, which renders plain escaped code (§4.2). The plugin defaults to twinkleplop. That keeps the core free of twinkleplop's languages, so the REPL and #888's compile-only entry stay small and can opt in with whatever subset they load (Q2).

### 2.2 `mdsvex/highlight` subpath

The subpath is pure and synchronous apart from one async loader:

```ts
import { create_highlight, load_default_languages } from "mdsvex/highlight";

const languages = await load_default_languages(); // dynamic imports of every bundled language
const highlight = create_highlight({ languages, /* options from §3 */ });
compile(source, { highlight });
```

The plugin calls `load_default_languages()` the first time a transformed document contains a fence or a `#!` span, and awaits it once per process. Measured on twinkleplop `main`: importing all 19 built language packages takes **42 ms** and instantiating them takes 0.3 ms. That is cheap enough not to bother scanning documents for the languages they use.

## 3. Twinkleplop by default

### 3.1 Options

```ts
mdsvex({
  highlight: {
    languages: { dockerfile: "bash", ...more },  // merged over the defaults
    default_language: undefined,                 // for fences with no language
    on_unknown_language: "plain",                // "plain" (warn once per file+lang) | "throw"
    line_numbers: false,                         // site default; fence meta overrides
    annotations: undefined,                      // undefined = defaults (§3.4); false = none; or a list
    twoslash: false,                             // §3.7
    render: {},                                  // twinkleplop RenderOptions site defaults (hooks, whitespace, indent_guides…)
    parse_meta: undefined,                       // (raw, parsed) => RenderOptions, for house conventions
  },
  // or a custom highlighter (§6), or false
});
```

**Language values.** The preferred value is a twinkleplop **module namespace**, which is the "import the module and pass it in" shape:

```ts
import * as zig from "@acme/twinkleplop-zig";
highlight: { languages: { zig, zg: "zig" } }
```

mdsvex uses the module's `tokenize` factory, so it can instantiate the language with the annotation plugins (including `eval`, §5) and render through `to_html` itself. A string is an alias. A plain `(code, render) => html` function also works, but annotations and live expressions don't apply to it, because it was built without mdsvex's annotation config.

### 3.2 Defaults that should "just work"

- **Every twinkleplop language** is available, and Svelte, HTML, CSS and JS are highlighted with no setup (#228).
- **Common aliases** ship by default:
  - `js mjs cjs` → javascript
  - `ts mts cts` → typescript
  - `jsx` → tsx
  - `sh shell zsh` → bash
  - `console shell-session` → shellsession
  - `yml` → yaml
  - `md` → markdown
  - `env` → dotenv
  - `patch` → diff
  - `py` → python
  - `rs` → rust
- **Fences inside markdown blocks are highlighted.** The `markdown` language is created with the whole registry for its fence embeds and with yaml for front matter.
- **Language lookup** tries an exact match first, then the lowercased name, so `Dockerfile` and `JSON` work (#225).
- **Unknown languages render as plain text, not an error.** The output is the same twinkleplop markup with no tokens, so themes and line numbers still apply. There is one warning per file and language (#224, #719).
- **A fence with no language** renders as plain twinkleplop markup with `default_language` unset. That keeps styling uniform. With `highlight: false` it's a bare `<pre><code>`.
- **The class carries only the language**, never the meta: `language-sh` (fixes the #870 leak).

### 3.3 Fence meta

We reuse `@twinkleplop/markdown-core`'s `split_info` and `parse_meta`, so the conventions people already write keep working:

| meta | from | effect |
|---|---|---|
| `{1,3-4}`, `{1,3-4}#id` | shiki / VitePress, rehype-pretty-code | highlight lines (+ `data-highlighted-line-id`) |
| `/word/`, `/word/3-5`, `/word/#id` | shiki, rehype-pretty-code | highlight words / occurrences |
| `:line-numbers[=N]`, `:no-line-numbers`, `showLineNumbers{N}` | VitePress, rehype-pretty-code | line numbers (#458) |
| `[title]`, `title="…"` | VitePress, rehype-pretty-code | title caption |
| `caption="…"` | rehype-pretty-code | caption below |
| `twoslash` | shiki | route through twoslash (§3.7) |

The info string is never emitted as markup, so the braces in `{1,3}` are harmless. A meta range that points past the end of the fence fails the build, as markdown-core does: a stale range becomes an error instead of silently highlighting nothing. Anything no convention claims is passed to `parse_meta` and is also available to a replaced `pre` as the raw `meta` (§7).

### 3.4 Annotations (twinkleplop directives)

By default every built-in annotation plugin is enabled:

- `hl`, `em`, `focus`, `dim`
- `add`, `del`, `mod`
- `err`, `warn`, `info`
- mdsvex's own `eval` (§5)

`shiki_notation` (`// [!code ++]`) is not on by default (Q7). Content written for shiki transformers (#706) can opt in with `annotations: [...default_annotations, shiki_notation()]`; `default_annotations` is exported from `mdsvex/highlight`.

Extraction short-circuits when `[!` doesn't appear in a snippet, so enabling all of them costs nothing for ordinary code.

In mdsvex config the key is **`annotations`**, not `directives`, so it doesn't collide with mdsvex's own `:::directive` namespace (templates design §6). The docs can still call them "code directives".

### 3.5 Inline code

`` `#!ts const x = 1` `` is the PFM inline hint, and the parser already records it. It renders with twinkleplop's `structure: "inline"` as `<code class="twinkleplop twinkleplop-inline language-ts">…</code>` (#543, #554). The `twinkleplop` class is there because themes only style tokens inside `.twinkleplop`. A code span without a hint stays a plain `<code>`.

rehype-pretty-code's `` `code{:ts}` `` suffix is not accepted (Q5): one syntax is enough, and `{:ts}` reads like a Svelte expression in a `.svx` file. Inline code has no live values; `[!eval]` and the `eval` flag are fence-only.

### 3.6 Themes

Deferred (Q3). v1 injects no CSS. Users import a theme stylesheet themselves, usually once in the root layout:

```js
import "@twinkleplop/theme-github";          // light on :root, dark under .dark
// or, for prefers-color-scheme:
import "@twinkleplop/theme-github/light";
```

```css
@import "@twinkleplop/theme-github/dark" (prefers-color-scheme: dark);
```

The media-query form works because the `/dark` export defines its variables on `:root`. Twoslash users also import `@twinkleplop/twoslash/style.css`.

Missing theme CSS was a recurring support issue (#63, #243, #371, #439), so the getting-started docs lead with this step, and a plugin-injected `theme` option can be added later without changing anything else here.

### 3.7 Twoslash

This is opt-in and plugin-only, because it builds a TypeScript environment:

```ts
highlight: { twoslash: true }                 // ts, tsx, js, jsx via @twinkleplop/twoslash
highlight: { twoslash: { svelte: true } }     // also svelte via @twinkleplop/twoslash-svelte
```

Fences with `twoslash` in their meta use it. The twoslash packages are optional peer dependencies, and enabling twoslash without them installed is a clear config error. Popover text contains braces (types), so it relies on the same escaping as everything else (§4, §8).

## 4. Output contract and escaping

### 4.1 One rule

Whatever a highlighter returns, mdsvex guarantees:

- **No `{` or `}` reaches Svelte as markup syntax**, apart from live expressions (§5).
- **No `{@html}` and no template literal.** The backslash, `${` and whitespace bugs (#212, #224, #492, #524) therefore can't happen. The only escaping needed in markup is `{ }`. `<` and `&` are already the highlighter's job as an HTML producer.

There are two ways this is met:

- **The twinkleplop path:** twinkleplop's text escaper writes `&#123;` and `&#125;` in the same pass in which it escapes `<` and `&` (§8.1). There is no second pass over the output.
- **A custom highlighter:** mdsvex replaces every `{` / `}` in the returned string with `&#123;` / `&#125;`, including inside attribute values (Svelte decodes character references in static attribute text). It's one linear scan.

### 4.2 `highlight: false`

The output is `<pre><code class="language-x">` plus the escaped text from the #839 branch (`& < > " { }`). This is also what `compile()` emits by default.

### 4.3 Size and performance

I checked this with Svelte 5.57 on a 60-line highlighted TypeScript snippet:

| output | client JS | server JS |
|---|---|---|
| legacy-style `{@html "…"}` | 22,640 B | 22,473 B |
| inline markup, braces escaped | **22,008 B** | **21,076 B** |
| inline markup, 20 live `{expr}` | 23,843 B | 20,156 B |

Static markup compiles to a single hoisted `from_html` template, so inline output is slightly *smaller* than `{@html}`. The concern behind #81 doesn't apply to Svelte 5. Each live expression adds a few lines of client code, roughly two `sibling` calls and a text assignment.

Highlighting cost: twinkleplop handles a 600-character snippet in about 10 µs, and a 50 KB TypeScript file in 4.8 ms. No cache is needed in `CompilerSession`. The renderer has five walks (plain, mapped, trace, v3 and component), and the highlighted HTML is computed once per fence per compile and reused across them.

## 5. Live expressions in code: `[!eval]`

### 5.1 Problem

People want to write things like

````md
```sh
{install_command} @pkg/my-pkg
```
````

where `install_command` comes from a setting (#661, #739, #777, #832). A block-level flag can't express which braces are live:

```js
function () {                    // escaped
  console.log({ a: {some_val} }) // the outer escaped, the inner live
}                                // escaped
```

### 5.2 Design

`eval` is an annotation verb that mdsvex registers with twinkleplop. It selects a range with twinkleplop's standard argument grammar, and **inside that range every top-level balanced `{…}` group becomes a live Svelte expression tag.** Everything else in the range is highlighted and escaped as usual.

```js
function my_func() {
  console.log({ a: {some_val} }) // [!eval ="{some_val}"]
}
```

```sh
{install_command} @pkg/my-pkg # [!eval]
```

```ts
// [!eval +2]
const url = "{base_url}/api";
const key = "{public_key}";
```

The forms that matter most, all of which are standard twinkleplop arguments:

| marker | live groups |
|---|---|
| `[!eval]` | every top-level `{…}` on the marker's line |
| `[!eval +N]`, `[!eval :N..M]` | every top-level `{…}` on those lines |
| `[!eval ="{x}"]` | each occurrence of the literal `{x}` on the line |
| `[!eval ="{x}" :*]` | each occurrence anywhere in the snippet |
| `[!eval a...b]`, paired `[!eval a...]` / `[!eval ...b]` | top-level groups between anchors |

**Rules:**

- **The marker is removed.** It's a twinkleplop marker, so it disappears from the output, and a line holding only markers is dropped. Line numbers don't count it.
- **Live text is verbatim.** A live group is emitted byte for byte with no entity escaping (`{a < b}` must stay JS). It is rendered as **one** token span, so Svelte sees a single expression tag rather than `{`, `x` and `}` in three spans.
- **Brace matching** counts depth and skips JS string and template literals inside the group. If a group is unbalanced, the build fails with the marker's position.
- **Allowed tags** are expression tags `{expr}` and `{@html expr}`. Block tags (`{#if}`, `{#each}`) are a compile error in v1: they would open and close in different line spans, which Svelte can't parse.
- **One line per expression.** A live group can't span lines. Each line is its own `span.l`, and twinkleplop rejects verbatim ranges that cross a line break (pngwn/twinkleplop#158).
- **Scope:** values come from the document's scope. That means its `<script>` and its `metadata`.
- **Rendering:** at runtime the value is text, so Svelte escapes it. `{@html}` is the explicit route to markup.

### 5.3 Token type

A live group takes the type of the source token that encloses it, when the whole group sits inside one token, such as a string literal or comment. Otherwise it has no token class and inherits the block's base colour.

An explicit override is deferred (Q1). If it's added later, the two candidate forms are `[!eval ="{x}" token=string]`, which works with today's marker grammar through `parse: "raw"`, or `[!eval(token=string) ="{x}"]`, which mirrors PFM's `(k=v)` directive arguments but needs a twinkleplop grammar change. Twinkleplop's verbatim ranges already accept a `type`, so either form is a small addition.

### 5.4 Block-level `eval`

A fence can also turn on live expressions for the whole block (Q4):

````md
```sh eval
{install_command} @pkg/my-pkg
{run_command} dev
```
````

The `eval` meta flag means "`[!eval]` on every line": every top-level `{…}` group in the block is live. It works on any fence, including languages without comments (`json`, `text`) and fences with no language, where the marker form isn't available.

It is coarse by design. In brace-heavy languages, every object literal and function body would become an expression, which is exactly the problem the marker form solves. The docs say so: use the flag for commands, config snippets and prose-like blocks, and the marker for code. Unbalanced groups fail the build with the line number, as in §5.2.

### 5.5 Tooling and other surfaces

- **Source maps and language-tools.** Each live group gets its own 1:1 mapping record with full CODE capabilities. svelte2tsx then sees `some_val` as a real reference, so type errors, hover, rename and the "unused variable" check all work. The rest of the fence stays one record. language-tools runs the same highlighting path (it's microseconds), because it needs the live ranges.
- **The `code` prop.** A replaced `pre` gets `code` as display text: markers removed, elided lines dropped, and live groups interpolated as a template literal, for example ``code={`${install_command} @pkg/my-pkg`}``. A copy button then copies what the reader sees (#385).
- **Custom highlighters** don't get `eval` in v1 (Q8).

## 6. Custom highlighters

```ts
// vite.config.ts — top-level await does the async setup; the function itself is sync
import { createHighlighter } from "shiki";
const shiki = await createHighlighter({ themes: ["github-dark"], langs: ["ts", "svelte"] });

mdsvex({
  highlight: (code, { lang, meta, inline }) =>
    inline ? null : shiki.codeToHtml(code, { lang, theme: "github-dark", transformers: [/* … */] }),
});
```

- **It must be synchronous.** Async setup belongs in the config (top-level await) or a plugin-level factory, never in the per-fence call. This rules out the "async highlighter" problem space (#205, #210) without losing shiki, because shiki's `codeToHtml` is sync once the highlighter exists. Shiki transformers work this way too: #706 and #827's "tree access" ask become "use shiki's own transformer API inside your highlighter".
- **It returns ordinary HTML** for the whole block (`<pre>…`) or for an inline `<code>…`. `null` or `undefined` means "use mdsvex's plain rendering for this one".
- **It must not escape for Svelte.** mdsvex does that (§4.1). A legacy highlighter that returns `{@html …}` breaks loudly, because the braces get escaped. The migration guide covers this.
- **The output has to be well-formed markup**, because Svelte parses it. Every mainstream highlighter's output is.

## 7. Code block components

This extends templates design §5.3 now that a highlighter exists. A replaced `pre` wraps the whole `<pre>` element, which it gets as `children`:

```svelte
<!-- what mdsvex emits for a replaced pre -->
<Pre_MDSVEX lang="ts" meta={"title=\"math.ts\" {2}"} title="math.ts" code={`…`}>
  <pre class="twinkleplop language-ts has-highlight" data-language="ts"><code>…highlighted lines…</code></pre>
</Pre_MDSVEX>
```

| prop | value |
|---|---|
| `lang`, `meta` | split info string (as today) |
| `code` | display text (§5.5) |
| `title`, `caption` | from meta, when present |
| `children` | the highlighted `<pre>`, or a custom highlighter's whole output |

**Why `children` holds the `<pre>`.** Decided 2026-10-03 while implementing phase 2. Svelte 5 keeps whitespace only inside a `<pre>` or `<textarea>` it can see in the template. In component children it collapses the newline between line spans to a space and drops leading indentation, and character references don't help, because it decodes them first. Passing the `<code>` as children and the `<pre>` attributes as props would render every block on one line. Protecting each whitespace run with a literal `{"\n    "}` tag works, but it added about 10.7 KB of client JS to a 60-line block (+64%). So the `<pre>` stays in `children` and its attributes are not props. The plain (`highlight: false`) replacement has the same shape.

**Title and caption.**
- When `pre` is not replaced, a fence with a title or caption renders twinkleplop's `<figure class="twinkleplop-block">` with `figcaption`s.
- When `pre` is replaced, no figure is emitted. The component gets `title` and `caption` and decides the chrome itself: copy button, filename tab, language badge.

Example (#100, #385, #437, #496):

```svelte
<!-- #lib/markdown/Pre.svelte -->
<script>
  let { code, title, children } = $props();
</script>

<div class="code">
  {#if title}<span class="filename">{title}</span>{/if}
  <button onclick={() => navigator.clipboard.writeText(code)}>copy</button>
  {@render children()}
</div>
```

Inline highlighted code goes through the `code` replacement and gets `lang` as an extra prop. Elements that only exist in highlighter output (`span.l`, `figure`) are never replaced, in any `component_mode`.

**Meta props (#289, Q9).** Meta parts that no convention claims (§3.3) become props on a replaced `pre`:

````md
```svelte title="App.svelte" playground height=300 theme="dark"
````

gives `playground={true}`, `height="300"` and `theme="dark"`, alongside `title` from the meta conventions. The forms are `key="value"`, `key='value'`, `key=value` (string) and bare `key` (`true`). Expression values (`key={expr}`) are not supported in v1. A key that collides with a built-in prop (`lang`, `meta`, `code`, `title`, `caption`, `class`, `children`) is dropped with a warning. Meta props only apply to a replaced `pre`; a plain `<pre>` doesn't grow arbitrary attributes.

## 8. Twinkleplop changes

All of these are generic and none mention Svelte. 8.1 and 8.2 are required; 8.3 and 8.4 save mdsvex from re-deriving things twinkleplop already knows. All four have shipped (see Status at the end of this section).

### 8.1 Extra escapes (required, pngwn/twinkleplop#151)

```ts
ts(code, { escape: { "{": "&#123;", "}": "&#125;" } })
```

- **Scope.** The extra characters are encoded wherever the renderer escapes text: token text, plain text, attribute values and hook output. Twoslash popover text is included.
- **Speed.** The generator's scan table is built around `code > 62` being an immediate "no escape" exit. `{` (123) and `}` (125) break that, so the table and its upper bound should be built per configuration. The default stays on the current fast path.

### 8.2 Verbatim ranges (required, pngwn/twinkleplop#152)

The `[!eval]` plugin returns verbatim contributions:

```ts
// an annotation plugin returns
{ overlays: [{ start, end, verbatim: true, type?: "string" }] }
// and RenderOptions.overlays accepts { start, end, verbatim: true, type? } too
```

- **Rendering.** The renderer emits the range's source bytes unescaped, ignoring `escape` as well, as **one** `span.tok`. It splits the surrounding tokens at the range edges.
- **Token class.** `type` sets the span's token class. Without it, the span takes the enclosing token's type when the range lies inside a single token, and has no class otherwise.
- **Overlap.** Verbatim ranges can't overlap each other or a `hide` range. A token-mode class overlay that covers them still adds its classes, so `[!hl]` on a line with a live value still highlights the line.

### 8.3 Block parts (nice to have, pngwn/twinkleplop#153)

`to_parts(input, result, render)` returns `{ attributes, body }`, where `attributes` holds the `<pre>`'s class and attributes and `body` the `<code>…</code>` HTML.

- **Why mdsvex wants it.** It needs `attributes` and `body` separately to add plugin attributes to the `<pre>` and to leave the figure out for a `pre` replacement (§7).
- **Fallback without it.** Twinkleplop documents its block structure, so splitting at the first `<code>` and the last `</code></pre>` works.

### 8.4 Display text (nice to have, pngwn/twinkleplop#154)

`visible_text(input, result)` returns the source with marker bytes removed and elided lines dropped. This is the `code` prop (§5.5).

**Fallback without it.** mdsvex can rebuild the display text from `overlays.skip_ranges` and `elided_lines`. That ties mdsvex to twinkleplop internals.

### Status

All four shipped in `@twinkleplop/core` 0.3.0 (with `markdown-core` 0.2.0, `twoslash` 0.3.0 and `rehype` 0.2.0) on 2026-10-03. They behave as specified above, with these review follow-ups:
- `escape` also covers class names and the markdown-core fence wrappers.
- `@twinkleplop/rehype` throws if `render.escape` is set without `output: "raw"`.
- Verbatim ranges have trailing whitespace trimmed, as the main render loop does.
- `visible_text_map` provides the offset map that the `code` template literal needs (§5.5).

Two open bugs on `main` affect this design:
- **pngwn/twinkleplop#159.** A marker in a block comment leaves the closing `*/` or `-->` visible. `[!eval]` in Svelte, HTML and CSS blocks needs this fixed before phase 3 ships.
- **pngwn/twinkleplop#160.** Rendering with overlays is quadratic in overlay count. It doesn't block anything, but every live expression adds an overlay.

## 9. Plugin config, all together

```ts
import { mdsvex } from "mdsvex";
import * as zig from "@acme/twinkleplop-zig";

mdsvex({
  templates: { default: "#lib/templates/Post.svelte" },
  components: "#lib/markdown/components.ts",   // may export `pre` (§7)
  highlight: {
    languages: { zig },
    line_numbers: false,
    twoslash: { svelte: true },
  },
});
```

The zero-config case is `mdsvex()`. It gives every bundled language, the default aliases, annotations including `[!eval]`, the meta conventions and `#!lang` inline code. The user imports a theme stylesheet (§3.6). There's no copy button, because that's a `pre` component (§7). A ready-made one could ship later as `@mdsvex/components`.

## 10. Legacy compatibility

| 0.x | next |
|---|---|
| `highlight: false` | `highlight: false` |
| `highlight.alias: { x: "y" }` | `highlight.languages: { x: "y" }` |
| `highlight.highlighter(code, lang, meta, filename)` (may be async, returns `{@html …}`) | `highlight: (code, { lang, meta, filename }) => html` (sync, plain HTML) |
| `highlight.optimise` | removed (§4.3) |
| `escapeSvelte` export | removed; mdsvex escapes (§4.1) |
| Prism + prism-svelte, theme CSS by hand | twinkleplop, theme CSS by hand (`@twinkleplop/theme-*`) |

`@mdsvex/migrate` rewrites `highlight: false` and `alias`. It can't safely rewrite a highlighter function, so it leaves a `// TODO(mdsvex-migrate)` comment linking to the guide and flags any `escapeSvelte` import.

## 11. What this closes

- **Contract and escaping:** #826, #117, #211, #212, #224, #379, #390, #392, #481, #492, #514, #524, #528, #636, #747. Any remaining open items are closed when this lands.
- **Pipeline:** #827. The rehype and tree-access asks are answered by annotations, meta conventions, render hooks, `pre` components and custom highlighters, and #139, #304, #554, #706 and #737 are covered by those.
- **Features:**
  - #458 (line numbers)
  - #543 (inline)
  - #100, #385, #437, #496 (code components)
  - #661, #739, #777 (interpolation)
  - #832's interpolation half
  - #210, #276 (docs)
- **Not this design:** executable and demo blocks (#52, #432, #608, #832's other half). They belong to directives (`:::example`), as pngwn has said since 2021. #838 is a 0.x fix.

## 12. Phasing

| phase | work | depends on |
|---|---|---|
| 1 | twinkleplop 8.1–8.4: done, `@twinkleplop/core` 0.3.0 | — |
| 2 | core + plugin highlighting: land the brace fix (`f084b62a`, #839); class carries `lang` only; `highlight` compile option; `mdsvex/highlight` (`create_highlight`, `load_default_languages`, aliases, case fallback, unknown → plain, meta conventions, inline `#!`, default annotations); custom highlighter + brace escaping; `pre` props and the `<pre>` as children, title/caption figure, meta props (Q9), `code` prop; plugin lazy default load and twoslash opt-in; switch the docs site off refractor | 1 |
| 3 | `[!eval]` and the `eval` fence flag: annotation plugin, brace-group matching, verbatim emit, per-expression mappings, `code` template literal via `visible_text_map`, language-tools check | 2, pngwn/twinkleplop#159 |
| 4 | docs (getting started with theme import, shiki recipe, copy-button component, annotations, live code), `@mdsvex/migrate` for `highlight`, REPL wiring | 2 (3 for the live-code docs) |

The brace fix lands in phase 2, not on its own, because it breaks the docs site's post-compile refractor step. Phase 2 replaces that step. Phases 3 and 4 can run in parallel once phase 2 merges.

## 13. Decisions and open questions

Decided 2026-10-03:

- **Q1. Live-code token override:** deferred. The verb is `eval`; tokens use the inherit rule (§5.3).
- **Q2. `compile()` highlighting by default:** no. `compile()` is slim by design; the plugin defaults to twinkleplop.
- **Q3. Default theme injection:** deferred. Users import theme CSS (§3.6).
- **Q4. Block-level `eval`:** yes, as a fence meta flag on any fence (§5.4).
- **Q7. Default annotations:** the twinkleplop built-ins plus `eval`. `shiki_notation` is opt-in (§3.4).
- **Q8. `[!eval]` for custom highlighters:** deferred.
- **Q9. Meta props:** yes, unclaimed `key=value` and bare flags become props on a replaced `pre` (§7).

- **Q5. Inline code:** PFM's `` `#!ts code` `` only; no `{:ts}` suffix and no live values in inline code (§3.5).
- **Q6. The `code` prop:** always passed to a replaced `pre`. It repeats the block's text as a JS string (13–24% of the highlighted block's size on two 40-line TypeScript samples), but it is available during SSR and is already display text. Reading `textContent` instead would pick up line numbers.

No questions are open.
