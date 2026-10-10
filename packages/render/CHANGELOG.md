## 1.0.0-next.0

## 1.0.0-next.2

### Minor Changes

- [#934](https://github.com/pngwn/MDsveX/pull/934) [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e) Thanks [@pngwn](https://github.com/pngwn)! - Task lists. A list item that starts with `[ ]`, `[x]` or `[X]`, then a space and some text, is a task item. It renders with a disabled checkbox before its text, and the marker is no longer part of the text. A replaced `li` component gets a boolean `checked` prop instead of the checkbox.

  ```md
  - [ ] to do
  - [x] done
  ```

  ```html
  <li><input type="checkbox" disabled /> to do</li>
  <li><input type="checkbox" checked disabled /> done</li>
  ```

  A marker with nothing after it (`- [ ]`) or with no space after it (`- [x]done`) stays text. To start an item with those characters, escape the bracket: `- \[x] text`.

### Patch Changes

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - In a streaming render, an html element that is still open keeps its attribute text as written. `title="a &amp; b"` showed as `a &amp;amp; b` until the closing tag arrived.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - A self-closing element made by a parse plugin, such as an `img`, renders as its tag and attributes. It rendered the source of the document in its place.

- [#923](https://github.com/pngwn/MDsveX/pull/923) [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41) Thanks [@pngwn](https://github.com/pngwn)! - The script that bare imports start is `lang="ts"` when an import is a type import or the module script is `lang="ts"`.

- Updated dependencies [[`1c5c5ef`](https://github.com/pngwn/MDsveX/commit/1c5c5ef99483ac86ac52f434fe34b9237c27f12c), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d)]:
  - @mdsvex/parse@1.0.0-next.2

## 1.0.0-next.1

### Minor Changes

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Import statements at the top of a document are kept. They go into the document's instance `<script>`, or into a new `<script>` when there is none.

  ```md
  import Chart from './Chart.svelte'

  <Chart />
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - `component_mode: 'all'` now replaces HTML you type as well as elements written in markdown:

  ```ts
  mdsvex({ components: '#lib/markdown.ts', component_mode: 'all' });
  ```

  A lowercase element such as `<h2>` or `<img>` uses the same replacement as its markdown form, and a custom tag such as `<warning>` uses a `warning` export, so a components module can provide tags that work in every document without imports. Attributes pass through as props exactly as written, including `{expr}`, `{shorthand}`, `{...spread}` and `{@attach}`. A typed `h1` to `h6` gets `level`, and an `ol` without `start` gets `start={1}`. Children arrive as `children`, and void elements get none.

  `<svelte:*>` tags and capitalised components are never replaced, so `<svelte:element this="img">` renders a plain element. An element with a directive (`bind:`, `on:`, `use:`, `class:`, `style:`, `transition:`, `in:`, `out:`, `animate:` or `let:`) stays an element, because a component can't take one. The compiler warns about it, and `compile()` returns the warning in `warnings`.

- [#870](https://github.com/pngwn/MDsveX/pull/870) [`fa297f9`](https://github.com/pngwn/MDsveX/commit/fa297f9b3fda7cc11c3f4274ba0b0cc27acedf9a) Thanks [@pngwn](https://github.com/pngwn)! - Elements written in markdown can be replaced with your own Svelte components. Point the `components` option at one or more modules, and each export named after an element replaces that element:

  ```ts
  // vite.config.ts
  mdsvex({ components: '#lib/markdown.ts' });
  ```

  ```ts
  // src/lib/markdown.ts
  export { default as h2 } from './Heading.svelte';
  export { default as img } from './Image.svelte';
  ```

  Specifiers resolve the way an import from the Vite root would, so aliases, package exports and `#lib/...` subpath imports work, as does `new URL('./markdown.ts', import.meta.url)`. A `.svelte` module works too, and its `<script module>` exports are the replacements.

  Only elements produced by markdown syntax or by parse plugins are replaced. HTML you type yourself stays as it is. A replacement gets the element's attributes as props, plus `children` unless the element is void (`img`, `hr`, `br`). Some elements also get extra props:
  - `h1` to `h6` get `level`.
  - `pre` gets `lang`, `meta` and the raw `code`.
  - `ol` gets `start`.
  - `li` gets `checked`, when a plugin sets it.
  - `th` and `td` get `align`.

  Each document imports only the components it uses. When a module's export names change, the dev server recompiles the documents that use it.

- [#874](https://github.com/pngwn/MDsveX/pull/874) [`311902d`](https://github.com/pngwn/MDsveX/commit/311902de7c606430e3899440d37def14f5190b6c) Thanks [@pngwn](https://github.com/pngwn)! - Generic directives now render as your own Svelte components. A components module declares its directives with a `directives` namespace export. Directives are a separate namespace from element replacements, so a `table` export never serves `:::table`:

  ```ts
  // src/lib/markdown.ts, passed as mdsvex({ components: '#lib/markdown.ts' })
  export { default as img } from './Image.svelte';
  export * as directives from './directives.ts';
  ```

  ```ts
  // src/lib/directives.ts
  export { default as Callout } from './Callout.svelte';
  export { default as abbr } from './Abbr.svelte';
  ```

  Here is what each directive passes to its component:
  - **Args** arrive as string props.
  - **Leaf and container text** in the brackets arrives as a `label` snippet.
  - **Inline directive text** arrives as `children`.
  - **A container's body** arrives as `children`.

  So `:::Callout[Heads up](kind=warn)` passes `kind="warn"`, a `label` snippet and the body as `children`.

  A directive with no component is passed to parse plugins' `directive_inline`, `directive_leaf` and `directive_container` handlers. If none of them replaces it, the compile fails with a `DirectiveError` that names the directive and its line. Before this change, an unhandled directive rendered as its children and a leaf directive disappeared. A directive with a component never reaches a plugin's directive handlers.

- [#899](https://github.com/pngwn/MDsveX/pull/899) [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619) Thanks [@pngwn](https://github.com/pngwn)! - Tables can have header columns and merged cells. A `||` in the delimiter row, matched by an empty `||` cell in the header row, turns the columns on its narrower side into row headers, and two `||` give headers on both sides. A cell holding only `>` merges into the cell to its left, and a cell holding only `^` merges into the cell above. Merged cells must form rectangles, and a marker that can't merge stays text.

  ```md
  | maybe || title |> |
  |-------||-------|---|
  | hello || text | b |
  |^ || more | c |
  ```

- [#872](https://github.com/pngwn/MDsveX/pull/872) [`045aca9`](https://github.com/pngwn/MDsveX/commit/045aca94077183b8b58bb59c45813f0aa4f33cde) Thanks [@pngwn](https://github.com/pngwn)! - Frontmatter becomes the document's metadata. The compiled component exports it from its `<script module>` as `metadata`, and `compile()` returns it as `metadata`. When the document already has a module script, the export goes into that script.

  ```md
  ---
  title: Hello
  tags: [svelte, markdown]
  ---
  ```

  ```svelte
  <script module>
  export const metadata = {"title":"Hello","tags":["svelte","markdown"]};
  </script>
  ```

  mdsvex parses the YAML that frontmatter commonly holds: strings, numbers, booleans, null, nested maps, block and flow sequences, `|` and `>` blocks and comments. Dates stay strings. Anything else, such as anchors or tags, fails with an error naming the line. For full YAML, pass a parser:

  ```js
  import { parse } from 'yaml';

  mdsvex({ frontmatter: { parse } });
  ```

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - Code blocks can hold live Svelte expressions. An `[!eval]` comment makes every top-level `{...}` group in its range live, and everything else stays text:

  ````md
  ```sh
  {install_command} @pkg/my-pkg # [!eval]
  ```

  ```js
  function my_func() {
  	console.log({ a: { some_val } }); // [!eval ="{some_val}"]
  }
  ```
  ````

  `[!eval]` takes every twinkleplop argument form: bare for its own line, `+N`, `:N..M`, `="{x}"` with an optional `:*`, anchors and pairs. It is on by default and part of `default_annotations`. Values come from the document's script and `metadata` and render as text, so use `{@html}` for markup. A group that doesn't close on its line, or a block tag such as `{#if}`, fails the build with its line and column.

  The `eval` fence flag means `[!eval]` on every line, on any fence, including ` ```eval ` for a fence with no language. It suits commands and config rather than brace-heavy code. A custom highlighter doesn't support it yet and warns.

  A replaced `pre` gets `code` as a template literal with the live values in it, such as ``code={`${install_command} @pkg/my-pkg`}``, so a copy button copies what the reader sees. Each live expression gets its own source mapping.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - A top level `<script>` with a `src` attribute, as in pasted tweet or Instagram embeds, renders as `<svelte:element this={"script"}>`. Svelte treats every top level `<script>` as the component script, so two embeds used to fail to compile.

- [#891](https://github.com/pngwn/MDsveX/pull/891) [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db) Thanks [@pngwn](https://github.com/pngwn)! - Fenced code and `` `#!lang code` `` spans are highlighted with [twinkleplop](https://twinkleplop.pngwn.at) by default in the Vite plugin. Every twinkleplop language loads the first time a document has code, along with the common aliases (`js`, `ts`, `sh`, `yml`, `md`, `py` and others). Lookup tries the exact name, then the lowercased one. A language mdsvex doesn't know renders as plain twinkleplop markup, with one warning per file. mdsvex adds no CSS, so import a theme yourself:

  ```js
  import '@twinkleplop/theme-github';
  ```

  ```ts
  mdsvex({
  	highlight: {
  		languages: { dockerfile: 'bash' },
  		line_numbers: false,
  		twoslash: { svelte: true },
  	},
  });
  ```

  Highlighted output is markup, not `{@html}`. Twinkleplop escapes `{` and `}` as it renders, so code never reaches Svelte as an expression. Fences accept the Shiki, VitePress and rehype-pretty-code meta conventions: `{1,3-4}`, `/word/`, `:line-numbers`, `showLineNumbers`, `[title]`, `title="..."` and `caption="..."`. A title or caption wraps the block in a `<figure>`. Twinkleplop's annotations (`// [!hl]`, `[!focus]`, `[!add]` and the rest) are on by default, and `default_annotations` is exported for extending the list. `twoslash: true` needs `@twinkleplop/twoslash`, and `{ svelte: true }` also needs `@twinkleplop/twoslash-svelte`.

  `compile()` takes a `highlight` option too. It stays synchronous and doesn't highlight by default. Build a config with `mdsvex/highlight`, which loads the languages in its only async function:

  ```js
  import { compile } from 'mdsvex/compile';
  import { create_highlight, load_default_languages } from 'mdsvex/highlight';

  const highlight = create_highlight({
  	languages: await load_default_languages(),
  });
  compile(source, { highlight, filename: 'post.svx' });
  ```

  `highlight` also takes a synchronous function, `(code, { lang, meta, inline, filename }) => html`, or `false`. A function returns ordinary HTML and mdsvex escapes every brace in it. Returning `null` renders that code plain.

  A replaced `pre` now gets the whole `<pre>` element as `children`, because Svelte only keeps whitespace inside a `<pre>` it can see. It also gets `lang`, `meta`, `code` (the text a reader sees, without annotation markers), `title`, `caption`, and a prop for each meta part no convention claims, such as `playground` or `height=300`:

  ```svelte
  <script>
  	let { code, title, children } = $props();
  </script>

  <div class="code">
  	{#if title}<span>{title}</span>{/if}
  	<button onclick={() => navigator.clipboard.writeText(code)}>copy</button>
  	{@render children()}
  </div>
  ```

  A highlighted code span goes through the `code` replacement with a `lang` prop. The `language-` class now carries only the language, never the rest of the info string.

- [#876](https://github.com/pngwn/MDsveX/pull/876) [`1dceed1`](https://github.com/pngwn/MDsveX/commit/1dceed1b863e202066c943d7b3e463db7e8fdb05) Thanks [@pngwn](https://github.com/pngwn)! - Documents can be wrapped in templates, which were called layouts in mdsvex 0.x. A template is a Svelte component. It gets the frontmatter and any props passed to the document as props, and the document body as `children`:

  ```ts
  // vite.config.ts
  mdsvex({
  	templates: {
  		default: '#lib/templates/Post.svelte',
  		docs: './src/lib/templates/Docs.svelte',
  		blog: new URL('./src/Blog.svelte', import.meta.url),
  	},
  });
  ```

  ```svelte
  <!-- src/lib/templates/Post.svelte -->
  <script module>
  	export { default as h2 } from './Heading.svelte';
  </script>

  <script>
  	let { title, children } = $props();
  </script>

  <article>
  	<h1>{title}</h1>
  	{@render children()}
  </article>
  ```

  Specifiers resolve the way an import from the Vite root would, as with `components`. Element-named exports from a template's `<script module>` replace those elements in the documents it wraps, and they take precedence over the `components` modules. To add replacements to a template you can't edit, pass `{ component, components }`, and the `components` module's exports are merged over the template's own.

  mdsvex picks a document's template in this order:
  1. Frontmatter `template: false` means no template.
  2. Frontmatter `template: docs` picks that template. An unknown name is an error that lists the known names.
  3. `select_template(id, metadata)`, when given.
  4. The `default` template, when there is one.

  You can also override the template on an import, with `import Post from './post.svx?template=false'` or `?template=docs`.

  The document's `<script>`, `<script module>`, `<style>` and top level `<svelte:head>`, `<svelte:window>`, `<svelte:body>`, `<svelte:document>` and `<svelte:options>` stay outside the template. A frontmatter key named `children` is an error when the document has a template. A document that binds its own props with `let props = $props()` forwards `props` to the template. A document that destructures its props forwards nothing.

  `compile()` takes the same options as plain data, with `templates` mapping names to `{ specifier, components }`, plus `default_template` and `select_template(metadata)`. It returns the name of the template it used as `template`. When a template's export names change, the dev server recompiles the documents that used it.

### Patch Changes

- [#891](https://github.com/pngwn/MDsveX/pull/891) [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db) Thanks [@pngwn](https://github.com/pngwn)! - Braces in code spans, fenced code and fence info strings render as text, so Svelte no longer reads them as expressions.

  ```md
  Use `{ a: 1 }` here.
  ```

- [#879](https://github.com/pngwn/MDsveX/pull/879) [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87) Thanks [@pngwn](https://github.com/pngwn)! - Leaf and container directive labels now take inline markdown, as inline directive text does. A directive component's `label` snippet renders it, so `:::Callout[Heads *up*]` passes `Heads <strong>up</strong>`. Links, images and autolinks stay literal, and nothing in a label reaches past its closing `]`, so `::x[*a](k=*)` keeps `*a` as text and its args intact.

  In the parse tree the label is a `directive_label` node, the directive's first child, so a container's label stays apart from its body:

  ```
  directive_container name="Callout"
    directive_label
      text "Heads "
      strong_emphasis
        text "up"
    paragraph
      text "body"
  ```

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

- [#856](https://github.com/pngwn/MDsveX/pull/856) [`8bd14fe`](https://github.com/pngwn/MDsveX/commit/8bd14fe77aed1ff532757a06e934fa6238ecb2da) Thanks [@pngwn](https://github.com/pngwn)! - Rendering to HTML without a source map is a few percent faster.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Rendering markdown to HTML is much faster, up to about 2.9x, and building source maps for the rendered output is many times faster.

- [#848](https://github.com/pngwn/MDsveX/pull/848) [`f2ff5fe`](https://github.com/pngwn/MDsveX/commit/f2ff5fe144a9009a79e0aa7a6f08f1bed5a7696c) Thanks [@pngwn](https://github.com/pngwn)! - Sourcemaps for large documents build in linear time, so a 100KB file takes milliseconds instead of over a second in the vite plugin.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Source mappings are now objects whose `sourceOffsets`, `generatedOffsets`, `lengths` and `data` are getters. Read those properties directly; spreading a mapping no longer copies them.

  ```ts
  const copy = { ...mapping, data: other }; // before: offsets copied, now: offsets missing
  const copy = {
  	sourceOffsets: mapping.sourceOffsets,
  	generatedOffsets: mapping.generatedOffsets,
  	lengths: mapping.lengths,
  	data: other,
  };
  ```

- [#896](https://github.com/pngwn/MDsveX/pull/896) [`4c55f5e`](https://github.com/pngwn/MDsveX/commit/4c55f5eea023e687202fa97626b401f09bffd6f7) Thanks [@pngwn](https://github.com/pngwn)! - A replaced `pre` gets `title`, `caption` and meta props from the fence meta with `highlight: false` too, which is the `compile()` default, and when a highlighter returns `null` for a fence. A meta prop that collides with a built-in prop is dropped with the same warning in every mode.

  ````md
  ```ts title="math.ts" playground height=300
  const a = 1;
  ```
  ````

  gives `title={"math.ts"}`, `playground={true}` and `height={"300"}` whether or not the code is highlighted. A fence that isn't replaced still renders as a plain `<pre><code class="language-ts">` without highlighting, with no `<figure>` for its title or caption.

- [#884](https://github.com/pngwn/MDsveX/pull/884) [`e708e1d`](https://github.com/pngwn/MDsveX/commit/e708e1d4c66478efd8606fa2e1ff2fee40e0732a) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block inside a block quote renders without the quote markers at the start of each line.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - The low-level render helpers exported with a leading underscore now collect source mappings into a `MapSink` instead of an array, and the `PendingMapping` type is no longer exported.

- [#871](https://github.com/pngwn/MDsveX/pull/871) [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now ships type declarations, so TypeScript finds types for `compile`, `CompileOptions`, `mdsvex` and the other exports instead of reporting a missing declaration file. Types for `@mdsvex/render` also check under TypeScript 6.

- [#889](https://github.com/pngwn/MDsveX/pull/889) [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e) Thanks [@pngwn](https://github.com/pngwn)! - Character references like `&lt;`, `&copy;` and `&#123;` in text, link and image attributes render as written instead of being escaped a second time. A bare `&`, a backslash escaped `\&` and any `&` inside code are still escaped.

  ```md
  a &lt; b &copy;
  ```

- [#875](https://github.com/pngwn/MDsveX/pull/875) [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9) Thanks [@pngwn](https://github.com/pngwn)! - Attribute values in raw html render as written, so an entity like `&amp;` is no longer escaped a second time.

  ```md
  <div title="a &amp; b">x</div>
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - Spread and attachment attributes on HTML you type, such as `<div {...rest} {@attach tooltip}>`, are no longer rendered as `...rest={...rest}`, which Svelte failed to compile.

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Files with Windows (`\r\n`) or old Mac (`\r`) line endings compile to the same HTML as their `\n` equivalents, and their sourcemaps point at the right lines and columns in the original file.

- Updated dependencies [[`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4), [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781), [`ebdb9fb`](https://github.com/pngwn/MDsveX/commit/ebdb9fb687933c69da0260eb50e8a4d2fae2bbca), [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87), [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`430cf34`](https://github.com/pngwn/MDsveX/commit/430cf3493575c706b31b5e02b4c219f4b6ea0569), [`eefaff5`](https://github.com/pngwn/MDsveX/commit/eefaff563e6ce05026f92c03fce21b3ba4bd5e77), [`3f5bbbb`](https://github.com/pngwn/MDsveX/commit/3f5bbbb069ca12e16b3bb96afb60c41362161109), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727)]:
  - @mdsvex/parse@1.0.0-next.1

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e), [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb), [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9), [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/parse@1.0.0-next.0
