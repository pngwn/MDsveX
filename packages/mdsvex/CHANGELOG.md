# mdsvex

## 1.0.0-next.2

### Minor Changes

- [#1086](https://github.com/pngwn/MDsveX/pull/1086) [`6e921ad`](https://github.com/pngwn/MDsveX/commit/6e921adadb13a01894c48a1a8ba8e4cbac1a5016) Thanks [@pngwn](https://github.com/pngwn)! - The `children` handlers of a directive take a `'*'` key, a handler for a child of any type. It runs for every node written directly inside the directive as it opens, after the handler for the type of the child, so a plugin can act on content it did not expect where it arrives:

  ```js
  tabs: {
  	children: {
  		heading(node, ctx) {
  			ctx.state.tab?.close();
  			ctx.state.tab = node.wrap_from('directive_container', { name: 'tab' });
  		},
  		'*'(node, ctx) {
  			if (ctx.state.tab === undefined && node.type !== 'directive_label')
  				ctx.warn('before_first_tab', 'content before the first tab is in no tab', node);
  		},
  	},
  }
  ```

  `ctx.index` counts its own runs, so `0` is the first child. It is not called for the blank lines between children. `descendants` has no such key and throws for one.

- [#948](https://github.com/pngwn/MDsveX/pull/948) [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27) Thanks [@pngwn](https://github.com/pngwn)! - Leaf and container directives can be written without square brackets: `::toc`, `::toc(depth=2)`, and `:::steps` closed by `:::`. They render the same component as `::toc[]` and `:::steps[]`, with args as props and no `label` snippet, and a plugin's handlers run for the bare container as they do for the bracketed one.

  A line that is exactly `::word` or `:::word` used to be a paragraph. It is now a directive, so it needs a component or a plugin, and without one the compile fails with the usual error naming the directive and its line and column. Write `\::word` to keep such a line as text. The inline form still needs its brackets, `:word` in a sentence stays text.

- [#1042](https://github.com/pngwn/MDsveX/pull/1042) [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d) Thanks [@pngwn](https://github.com/pngwn)! - A fence shows a file with `src=`. The path resolves as an import from the document would, `#L5-L20` picks lines, and a fence with no language takes it from the file name. The file is highlighted like any code, a replaced `pre` gets `src` as a prop, and in dev saving the file updates every page that shows it. A file that is missing, a slice past the end of the file, and a fence with `src=` and code of its own each fail the build at the fence.

  ````md
  ```ts src=./math.ts#L5-L20

  ```
  ````

  `compile()` takes the text of each file in `sources`, and throws a `SourceError` for a file that is not there.

  ```js
  compile(source, { sources: { './math.ts': text } });
  ```

- [#1115](https://github.com/pngwn/MDsveX/pull/1115) [`89bf377`](https://github.com/pngwn/MDsveX/commit/89bf3776a22003ab42517b9b8a542507fce6f03b) Thanks [@pngwn](https://github.com/pngwn)! - A fence marked `run` is shown as code and is also a module the page imports. The component that replaces `pre` gets the module as a prop and decides what running means.

  ````md
  ```svelte run
  <script>
  	let count = $state(0);
  </script>

  <button onclick={() => count++}>clicked {count}</button>
  ```
  ````

  ```svelte
  <!-- Pre.svelte, exported as pre from a components module or a template -->
  <script>
  	let { lang, module, children } = $props();
  	const Demo = lang === 'svelte' ? module?.default : undefined;
  </script>

  {#if Demo}<Demo />{/if}
  {@render children()}
  ```

  The block is a real module in the Vite graph, so TypeScript and Svelte are compiled, imports resolve as they would in the document, the server renders it, and an error points at its line of the document. `js`, `ts`, `jsx`, `tsx` and `svelte` blocks run. In dev an edit to one block updates that block and leaves the modules of the others alone.

  `run=client` hands the component `load`, a function that imports the block when it is asked for, in place of `module`. With `src=` and `run` the page imports the file the fence shows.

  `run` is no longer a meta prop, and neither are `module` and `load`. A block that runs in a document with no `pre` replacement, in a language that is no module, or together with live code fails the build at the fence.

  `compile()` serves no module, so there a block that runs throws a `RunError` unless `snippets` says how it is imported. With `snippets: true` or a function the result has the code of each block in `snippets`, and `snippets: false` only shows the block.

  ```js
  const { code, snippets } = compile(source, {
  	filename: 'a.md',
  	snippets: true,
  });
  ```

- [#1195](https://github.com/pngwn/MDsveX/pull/1195) [`db7cea1`](https://github.com/pngwn/MDsveX/commit/db7cea19de7338a575d111f5b65642868dcaab17) Thanks [@pngwn](https://github.com/pngwn)! - `compile_async` takes a `CompilerSession` as an optional third argument. What plugins load with `ctx.cached` is kept in that session, so a host that compiles again when files change can call `session.invalidate(paths)` and get fresh loads. Without one, loads are kept for as long as the same `plugins` array is passed, as before.

- [#1176](https://github.com/pngwn/MDsveX/pull/1176) [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0) Thanks [@pngwn](https://github.com/pngwn)! - A host that is not Vite can compile in steps, fetching what a document needs between them:

  ```js
  const session = new CompilerSession();
  const inputs = compile_inputs(options);
  const parsed = session.parse(source, inputs);
  await session.settle(parsed); // undefined when nothing was deferred
  // read parsed.needs, set inputs.sources
  const { code } = session.render(parsed, inputs);
  ```

  `CompilerSession.parse`, `settle` and `render`, `Parsed.needs` and `compile_inputs(options)` are public.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`47197f7`](https://github.com/pngwn/MDsveX/commit/47197f7057de0ff90d16b9c4d407450b5f68a2ca) Thanks [@github-actions](https://github.com/apps/github-actions)! - A document imported with `?data` gives its frontmatter and what its plugins left, without its component. Use it for a list that shows something a plugin worked out, such as a reading time:

  ```js
  const posts = import.meta.glob('./*/+page.svx', {
  	query: '?data',
  	eager: true,
  });
  // posts['./intro/+page.svx'].metadata.title
  // posts['./intro/+page.svx'].plugin_data.reading_time.minutes
  ```

  The module exports `metadata` and `plugin_data` as the compiled document does, each `undefined` when the document has none, and both in one object as its default export. It parses the document and runs its plugins, and renders nothing.

  Unlike `?metadata`, which reads the frontmatter alone, a `?data` import depends on the whole document: in dev an edit of the body that changes what a plugin left updates whatever imported it. For TypeScript, `mdsvex/globals` types direct `?data` imports.

- [#1084](https://github.com/pngwn/MDsveX/pull/1084) [`b1ccd82`](https://github.com/pngwn/MDsveX/commit/b1ccd825b1cb05c59491880a112490a87b5c0d1d) Thanks [@pngwn](https://github.com/pngwn)! - A directive has its name in its open handlers. The parser sends the name straight after the open, and the handlers of a `directive_container`, `directive_leaf` or `directive_inline` node now wait for it, so a global handler and a handler bound to the directive around it can both tell directives apart as they open:

  ```js
  tabs: {
  	children: {
  		directive_container(node, ctx) {
  			// a written out :::tab ends the tab a heading opened
  			if (node.attrs.name === 'tab') ctx.state.tab?.close();
  		},
  	},
  }
  ```

  A block directive has its `args` there too. The args of an inline directive still follow its closing bracket, so its close callback is where they are read. A directive handler of a parse plugin in `mdsvex` runs at the open now, where it used to wait for the close to read the name.

- [#955](https://github.com/pngwn/MDsveX/pull/955) [`f1f8895`](https://github.com/pngwn/MDsveX/commit/f1f88950b8213b0bcacb5d47015b0e8f60146110) Thanks [@pngwn](https://github.com/pngwn)! - A template can be a document. Its content is markdown, and it reads its props and renders `children` as a component does.

  ```js
  mdsvex({
  	templates: { note: '#lib/templates/Note.svx' },
  });
  ```

  ```svx
  <script>
  	let { title, children } = $props();
  </script>

  # {title}

  {@render children()}
  ```

  A document used as a template is never wrapped in a template itself.

- [#1085](https://github.com/pngwn/MDsveX/pull/1085) [`14e9951`](https://github.com/pngwn/MDsveX/commit/14e9951b3b9de574ca0cc9c9062b48328586f1b4) Thanks [@pngwn](https://github.com/pngwn)! - A code fence has its info string in its open handlers, as `node.info`, and `fence_meta` reads it the way a compile does. A plugin no longer waits for the close of a fence to learn its language or title, and no longer splits the info string itself:

  ````js
  import { fence_meta } from 'mdsvex/compile';

  const plugin = {
  	code_fence: {
  		parse(node) {
  			const { lang, title, src, props } = fence_meta(node.info);
  			// 'ts', 'app.ts', undefined, [['wrap', true]] for ```ts [app.ts] wrap
  		},
  	},
  };
  ````

  - `node.info` is the whole info string, `''` for a fence with none. `node.lang` is the same string under its older name, and now gives `''` where it gave `undefined` for a fence without one.
  - `fence_meta(info)` gives `lang`, `meta`, `title`, `caption`, `src`, `props` (the `key=value` pairs and bare flags no highlighting convention claims) and `parts` (every part as written).
  - The open handlers of a fence run once the line of its opening fence is complete, before any of its code.

- [#1136](https://github.com/pngwn/MDsveX/pull/1136) [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47) Thanks [@pngwn](https://github.com/pngwn)! - A footnote definition holds more than one block. After a blank line, a block indented by four spaces belongs to the definition, as a block indented to a list item belongs to the item, and the first line that is not blank and not indented ends it. The line of the label may start any block.

  ```md
  A claim[^1].

  [^1]: The source.

      A second paragraph, and a list:

      - one
      - two

  Not part of the note.
  ```

  Inside a block quote the four spaces count from the marker, and inside a list item from the content of the item. The link back to the reference goes at the end of the last paragraph of the note, or after its last block when that is not a paragraph.

- [#1136](https://github.com/pngwn/MDsveX/pull/1136) [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47) Thanks [@pngwn](https://github.com/pngwn)! - Two replacement names for footnotes. A `footnote` export in a components module replaces a reference, and a `footnotes` export replaces the section at the end.

  ```js
  // src/lib/markdown.js
  export { default as footnote } from './markdown/Footnote.svelte';
  export { default as footnotes } from './markdown/Footnotes.svelte';
  ```

  `footnote` gets `label`, `number`, `href` and `id`, the link it would render as its `children`, and what its definition holds as the `note` snippet, which is enough to draw a side note or a hover card. `footnotes` gets the `<ol>` of notes as its `children`. The links and list items mdsvex writes for footnotes are not markdown nodes, so `a`, `sup`, `ol` and `li` replacements never get them.

- [#1135](https://github.com/pngwn/MDsveX/pull/1135) [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4) Thanks [@pngwn](https://github.com/pngwn)! - Footnotes. A reference is a label in brackets after a caret, and a definition is the same at the start of a line with a colon and its text:

  ```md
  A claim[^1], and a second one[^smith].

  [^1]: The source, with a [link](https://example.com).

  [^smith]: Smith, 2020.
  ```

  A reference renders as a number, by first reference, that links to its note. The notes are collected at the end of the document, wherever they were written, each with a link back to every reference to it:

  ```html
  <p>
  	A claim<sup><a href="#fn-1" id="fnref-1" role="doc-noteref">1</a></sup
  	>, and ...
  </p>

  <section class="footnotes" role="doc-endnotes" aria-label="Footnotes">
  	<ol>
  		<li id="fn-1">
  			<p>
  				The source, with a <a href="https://example.com">link</a>.
  				<a
  					href="#fnref-1"
  					role="doc-backlink"
  					aria-label="Back to reference 1"
  					>...</a
  				>
  			</p>
  		</li>
  		...
  	</ol>
  </section>
  ```

  - A reference with no definition fails the build with a `FootnoteError`, which has the `line` and `column` of the reference. So does a label defined twice. `[^abc]` in prose is a reference: escape the bracket, `\[^abc]`, or put it in code.
  - A definition nothing refers to is not rendered, and the compile warns with `footnote_unused`.
  - A definition holds one paragraph and may be written anywhere, in a block quote or a list item too.
  - The new `footnotes` option names the section and the back links, `{ label: 'Notes', back_label: 'Back to note {n}' }`. `strict: false` makes the two errors warnings, for a preview.
  - With `heading_ids`, a heading whose slug would be the id of a footnote gets a suffix.

- [#1189](https://github.com/pngwn/MDsveX/pull/1189) [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0) Thanks [@pngwn](https://github.com/pngwn)! - `heading_ids` makes each id as its heading closes, in place of a pass after the parse. The ids are the ones it made before, and a parse plugin reads them in the function its heading handler returns, so it no longer has to be `sequential` for that:

  ```js
  const anchors = {
  	heading: {
  		parse(node) {
  			return () => node.prepend('link', { href: `#${node.attrs.id}` });
  		},
  	},
  };
  ```

  A plugin that changes the text of a heading in that function changes its id when it comes before the first plugin that reads `node.attrs`.

  An id is made from the ids before it and never changes once given. An id the document fixes, typed on a heading written as HTML or set on a heading by a plugin, is kept, and one that an element before it already has is now a `HeadingIdError` (code `id_taken`) naming both, where a made id used to move aside. A footnote is numbered at the end, so one whose id a heading took moves aside instead: `## Fn 1` keeps `fn-1` and the footnote `[^1]` gets `fn-1-1`.

  A document that streams gets the same ids as its headings arrive. `make_heading_ids()` from `mdsvex/compile`, given a slug or not, goes to the builder:

  ```js
  const builder = new WireTreeBuilder();
  builder.set_headings(make_heading_ids());
  ```

  `@mdsvex/parse` exports `HeadingIds`, `HeadingIdError` and `heading_slug`, and both builders take `set_headings`.

- [#943](https://github.com/pngwn/MDsveX/pull/943) [`636d9b9`](https://github.com/pngwn/MDsveX/commit/636d9b9c065a29007e9581151be1f6c061f256e4) Thanks [@pngwn](https://github.com/pngwn)! - `heading_ids`, off by default, gives every markdown heading an `id` made from its text, as `rehype-slug` did. The id is the one GitHub makes, and a repeated heading gets `-1`, `-2` and so on.

  ```js
  mdsvex({ heading_ids: true });
  ```

  ```svx
  ## Getting _started_

  ## Getting started
  ```

  ```html
  <h2 id="getting-started">Getting <em>started</em></h2>
  <h2 id="getting-started-1">Getting started</h2>
  ```

  The text is what a reader sees, so expressions, components and directives contribute nothing. A heading that already has an `id` keeps it, and a heading with no text left gets none. A replaced heading gets the `id` as a prop, and a sequential parse plugin can read it from `node.attrs.id`.

  For another scheme pass a `slug` function. Duplicates in what it returns are numbered the same way, and `heading_slug` is the default one.

  ```js
  import { mdsvex, heading_slug } from 'mdsvex';

  mdsvex({
  	heading_ids: {
  		slug: (text, { depth }) => `h${depth}-${heading_slug(text)}`,
  	},
  });
  ```

  `compile()` takes the option too. `@mdsvex/parse` on its own makes no ids.

- [#1171](https://github.com/pngwn/MDsveX/pull/1171) [`3f8ce51`](https://github.com/pngwn/MDsveX/commit/3f8ce514f7f7cbec985bd067492d36dce2aa3212) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/host` exports the rest of what a tool without Vite rebuilds from the plugin: the `mdsvex:*` virtual id prefixes, `manifest_resolver` to find the file an id stands for in an editor manifest, `metadata_module` and `data_module` to serve `?metadata` and `?data` imports, and `queue_manifest` with `manifest_json` to write a manifest the editor extension reads.

- [#1170](https://github.com/pngwn/MDsveX/pull/1170) [`6719013`](https://github.com/pngwn/MDsveX/commit/6719013bcaea57b36341eae90733d344a0c175e1) Thanks [@pngwn](https://github.com/pngwn)! - A new `mdsvex/host` entry holds what a tool that compiles documents without Vite needs beside `compile()`. It runs in a browser and in Node without Vite. Its first export, `read_exports`, finds the names a module or a Svelte module script exports, with the TypeScript stripper you pass.

  ```js
  import { read_exports } from 'mdsvex/host';

  const { names } = read_exports(
  	source,
  	'svelte',
  	(code) =>
  		ts.transpileModule(code, {
  			compilerOptions: { target: ts.ScriptTarget.ESNext },
  		}).outputText
  );
  ```

- [#949](https://github.com/pngwn/MDsveX/pull/949) [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0) Thanks [@pngwn](https://github.com/pngwn)! - A markdown image with a relative url is imported, so Vite hashes the file, inlines a small one and fails the build when it is missing. `![A chart](./chart.png)` compiles to:

  ```svelte
  <script>
  	import __mdsvex_img_0 from './chart.png';
  </script>

  <p><img src={__mdsvex_img_0} alt="A chart" /></p>
  ```

  `./chart.png`, `../img/chart.png` and a bare `chart.png` are relative to the document. A url that starts with an alias, `$lib/`, `#lib/`, `@/` or `~/`, is imported as written. A query or fragment stays on the import, so `?url`, `?inline` and `?enhanced` work. A root path such as `/chart.png`, a url with a scheme, a fragment and a url with a Svelte expression are left as they are, and so is an `<img>` typed as HTML. A replaced `img` component gets the imported value as its `src` prop.

  This is on by default in the Vite plugin, so a document that relied on `./chart.png` being served from the url of its page now needs `/chart.png`, or the new `import_images: false` option, which leaves every url as written. `compile()` takes `import_images` too, off by default.

- [#1128](https://github.com/pngwn/MDsveX/pull/1128) [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738) Thanks [@pngwn](https://github.com/pngwn)! - Inline math. A code span wrapped in dollars renders as math, through the same renderer as a `math` fence:

  ```md
  Euler's identity, # mdsvexe^{i\pi} + 1 = 0`$, links five constants.
  ```

  ```html
  <span class="math math-inline" translate="no"><math>...</math></span>
  ```

  Both dollars have to touch the backticks, and the span has to end on its line. The LaTeX is raw, so braces, backslashes, `_` and `^` need no escaping. It works wherever a code span does, in a heading, a table cell or the text of a link. Plain `$x# mdsvex and `$x$` are still text, so a price needs no escaping.
  - The Vite plugin loads Temml the first time a document has math of either kind.
  - A `math` replacement gets inline math too, with the LaTeX as `code` and the rendered math as `children`, and without `display`. A `code` replacement never gets it.
  - A math renderer function is called with `display: false` and an empty `meta`.
  - LaTeX the renderer can't read is a `MathError` that says `inline math` and has the `line` and `column` of the place in the LaTeX.
  - With `math: false`, and in `compile()` without a `math` option, it is inline code that shows the LaTeX, without the dollars.

- [#1040](https://github.com/pngwn/MDsveX/pull/1040) [`542d604`](https://github.com/pngwn/MDsveX/commit/542d604fabf70b0dcb52b8140ed066843dc18916) Thanks [@pngwn](https://github.com/pngwn)! - Links between documents can become routes, and root urls can get the base path. `links.routes` names the directory your files are served from, `links.base` is the prefix (`true` for Vite's base, a string, or a function the page imports), and `rewrite` is a function for anything else. `compile()` takes them too.

  ```js
  mdsvex({
  	links: {
  		routes: 'src/routes',
  		base: { import: 'resolve', from: '$app/paths' },
  	},
  	rewrite: (url) =>
  		url.startsWith('gh:') ? 'https://github.com/' + url.slice(3) : undefined,
  });
  ```

  ```md
  [Install](../setup/+page.svx#install)
  ```

  ```svelte
  <script>
  	import { resolve as __mdsvex_base } from '$app/paths';
  </script>

  <p><a href={__mdsvex_base('/setup#install')}>Install</a></p>
  ```

- [#945](https://github.com/pngwn/MDsveX/pull/945) [`50e0b8c`](https://github.com/pngwn/MDsveX/commit/50e0b8ccc97885e0ca7eed53c075bfaed7969b23) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block with the language `math` renders as display math. The Vite plugin renders the LaTeX with Temml when it compiles the document, so the page gets MathML and loads no JavaScript for math. Temml is loaded the first time a document has a `math` fence.

  ````md
  ```math
  \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
  ```
  ````

  ```html
  <div class="math math-display" translate="no">
  	<math display="block" class="tml-display">...</math>
  </div>
  ```

  The new `math` option picks the renderer and passes options to it. KaTeX is an optional peer dependency, install it when you pick it. A function is a renderer of your own, and `false` leaves the fence a code block.

  ```js
  mdsvex({ math: { options: { macros: { '\\RR': '\\mathbb{R}' } } } });
  mdsvex({ math: { renderer: 'katex' } });
  mdsvex({ math: false });
  ```

  mdsvex adds no CSS. Import `temml/dist/Temml-Local.css`, or `katex/dist/katex.min.css` for KaTeX, yourself.
  - A `math` export in a components module replaces math. It gets the LaTeX as `code`, `display`, the rest of the fence line as `meta`, and the rendered math as `children`. `pre` and `code` replacements never get math.
  - LaTeX the renderer can't read fails the build with a `MathError`, which has the `line` and `column` of the place in the fence.
  - A math fence never reaches the highlighter, whatever `highlight` is. With math on, inline code with a `math` hint, `` `#!math x` ``, is plain inline code and no longer warns about an unknown language.
  - `compile()` takes `math` as a renderer function and leaves the fence a code block without one. The new `mdsvex/math` entry has `load_math`, `temml_math`, `katex_math` and `source_math`.
  - The manifest the plugin writes for editors has a `math` field when the option is not the default.

  Inline math, `$x# mdsvex and `$x$`are not math. A`latex` fence is still a code block.

- [#937](https://github.com/pngwn/MDsveX/pull/937) [`9842f87`](https://github.com/pngwn/MDsveX/commit/9842f872de3f911bbaf54a56a1529d6a1445dccc) Thanks [@pngwn](https://github.com/pngwn)! - A document imported with `?metadata` gives its frontmatter without its component. Use it to list posts, so the list does not load every page:

  ```js
  const posts = import.meta.glob('./*/+page.svx', {
  	query: '?metadata',
  	import: 'metadata',
  	eager: true,
  });
  ```

  ```js
  import { metadata } from './article.svx?metadata';
  ```

  The module exports the same `metadata` as the compiled document, also as its default export, and `frontmatter.parse` applies. A document without frontmatter exports `undefined`. In dev, editing the frontmatter updates whatever imported it, and an edit below the frontmatter does not. For TypeScript, add `mdsvex/globals` to `compilerOptions.types` to type direct imports.

- [#1087](https://github.com/pngwn/MDsveX/pull/1087) [`9a8b94d`](https://github.com/pngwn/MDsveX/commit/9a8b94da69804114e2cac93fc82cd12094592662) Thanks [@pngwn](https://github.com/pngwn)! - A node view has `pending`, which is `true` while the parser may still revoke the node: an emphasis before its closer, a link before its destination, the paragraph of a list that can still be tight. `wrap_from` and `close()` throw exactly when the node whose handler is running is pending, so a plugin can now ask first:

  ```js
  link: {
  	parse(node) {
  		return () => {
  			if (!node.pending) node.wrap_from('html', { tag: 'span' }).close();
  		};
  	},
  }
  ```

  In the close callback of a node that closed for good it is `false`, and `wrap_from` and `close()` are allowed there, where they used to throw for a link or an emphasis that had closed.

- [#998](https://github.com/pngwn/MDsveX/pull/998) [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096) Thanks [@pngwn](https://github.com/pngwn)! - A node view says where its node is in the source, so a plugin can point at it.

  ```js
  heading: {
  	parse(node) {
  		return () => {
  			node.position;
  			// { start: { offset: 12, line: 4, column: 0 }, end: { offset: 20, line: 4, column: 8 } }
  		};
  	},
  }
  ```

  Lines count from 1 and columns from 0. `end` is `undefined` while the node is open, and `position` is `undefined` for a node a plugin made and for a tree built from the wire format, which carries no offsets.

- [#1088](https://github.com/pngwn/MDsveX/pull/1088) [`c37520f`](https://github.com/pngwn/MDsveX/commit/c37520f5d0ba21dc7647e4a31cedc723636a36dd) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can remove a node. `node.remove()` takes a node and everything it holds out of the tree:

  ```js
  // comments do not reach the page
  html_comment: {
  	parse(node) {
  		return () => node.remove();
  	},
  }
  ```

  Nothing undoes a removal, so it is allowed only where no revoke can ask for the node back, and throws anywhere else:
  - from a close callback, once the node it runs for closed for good, which is when `node.pending` is `false`;
  - from a sequential pass, in a handler or a close callback;
  - for the node the handler runs for, or a node inside it.

  An open handler of the fused pass cannot remove a node, since the parser has more to send for it.

- [#1218](https://github.com/pngwn/MDsveX/pull/1218) [`1e54c51`](https://github.com/pngwn/MDsveX/commit/1e54c51e1595fc8d3b04bee33fa8f83f54306645) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/host` exports `read_json_config`, which reads an `mdsvex.config.json` into the manifest the Vite plugin writes for the same options, with the list of what is wrong with it. The host passes how it resolves a specifier and reads the exports of a module, so it runs without Vite or Node. The editor and the playground read their config with it.

- [#1178](https://github.com/pngwn/MDsveX/pull/1178) [`a83b22f`](https://github.com/pngwn/MDsveX/commit/a83b22fd70193965102cd0bf35868d4839660675) Thanks [@pngwn](https://github.com/pngwn)! - Given `read` and `resolve` options, `compile_async()` reads the files fences show with `src=` itself, and its result names them in `dependencies` with the module of the document's template, so a host that is not Vite can watch them:

  ```js
  const { dependencies } = await compile_async(source, {
  	filename,
  	read,
  	resolve,
  });
  // ['/site/snippets/a.ts', '/site/src/Post.svelte']
  ```

- [#944](https://github.com/pngwn/MDsveX/pull/944) [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5) Thanks [@pngwn](https://github.com/pngwn)! - A new `plugins` option, on `mdsvex()` and on `compile()`, takes plugins that bring their own directives: the components that render them and handlers that reshape what is written inside them.

  ```js
  import { steps } from '@acme/steps';

  mdsvex({ plugins: [steps()] });
  ```

  ```js
  export function steps() {
  	return {
  		name: 'steps',
  		// exports a component for each directive below, under its name
  		module: '@acme/steps/directives',
  		directives: {
  			steps: {
  				children: {
  					heading(node, ctx) {
  						ctx.state.step?.close();
  						ctx.state.step = node.wrap_from('directive_container', {
  							name: 'step',
  						});
  						node.wrap_from('directive_label').close();
  					},
  				},
  			},
  			step: {},
  		},
  	};
  }
  ```

  - An entry of `directives` can hold `children` (handlers for nodes written directly inside the directive), `descendants` (nodes at any depth) and `parse` (the directive itself). Each handler gets `ctx.directive`, `ctx.index` and `ctx.state`, an object that is new for each directive in the document.
  - The plugin's components have the lowest precedence. A `directives` export of the same name from a `components` module or a template replaces the component, and the plugin's handlers still run.
  - A plugin can also carry `parse`, a parse plugin for the whole document, and `components`, element replacements.
  - In the Vite plugin a plugin's `module` resolves as an import from the Vite root would, and the editor manifest lists each plugin's directives in a new optional `plugins` field.

  `parse_plugins` works as before, alone or beside `plugins`.

- [#998](https://github.com/pngwn/MDsveX/pull/998) [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096) Thanks [@pngwn](https://github.com/pngwn)! - Parse plugin handlers learn about their document and can report back through their context. Global handlers and handlers bound to a directive both get four new members:

  ```js
  const toc = {
  	name: 'toc',
  	parse: {
  		sequential: true,
  		heading: {
  			parse(node, ctx) {
  				ctx.filename; // '/src/routes/guide.svx'
  				ctx.frontmatter; // { title: 'Guide' }
  				const headings = (ctx.data.headings ??= []);
  				const last = headings[headings.length - 1];
  				if (last && node.depth > last.depth + 1) {
  					ctx.warn('skipped_level', 'a heading level is skipped', node);
  				}
  				headings.push({ depth: node.depth, id: node.attrs.id });
  			},
  		},
  	},
  };
  ```

  - `ctx.filename` is the `filename` option of a compile, which the Vite plugin sets to the id of the document without its query. It is `undefined` when none was given.
  - `ctx.frontmatter` is the parsed frontmatter, read through the `frontmatter.parse` option the first time a handler asks for it. Every handler has it except the open handler of the frontmatter node itself.
  - `ctx.warn(code, message, node?)` adds a warning to the compile, at the node when one is given.
  - `ctx.data` is an object the plugin writes to. Each plugin name has its own for each document, so a plugin needs a `name` to use it.

  A warning, and a write to a key of `ctx.data`, are taken back when the parser gives up on the node whose handler made them, as attribute writes are. A `push` to an array kept in `ctx.data` is not, so collect in a sequential plugin or in the close callback of a heading or a block directive.

- [#1190](https://github.com/pngwn/MDsveX/pull/1190) [`3022559`](https://github.com/pngwn/MDsveX/commit/30225590d894496515c1dd1c5f602e790ca92e7b) Thanks [@pngwn](https://github.com/pngwn)! - A parse plugin that gives a node an id asks for one with `ctx.id(base)`. It returns the base, or the next free repeat of it (`-1`, `-2`), so it never takes the id of a heading, a footnote or what another plugin asked for:

  ```js
  link: {
  	parse(node, ctx) {
  		return () => {
  			node.attrs.id = ctx.id(node.text_content);
  		};
  	},
  },
  ```

  The id belongs to the node whose handler asked and is free again if that node is revoked. `ctx.id(id, { fixed: true })` keeps an id the author wrote as it is, and one an element before it already has is a `HeadingIdError`.

- [#998](https://github.com/pngwn/MDsveX/pull/998) [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096) Thanks [@pngwn](https://github.com/pngwn)! - `compile()` returns what plugins left in `ctx.data` as `data`, keyed by plugin name, and their warnings in `warnings`.

  ```js
  const result = compile(source, { heading_ids: true, plugins: [toc()] });

  result.data.toc.headings;
  // [{ depth: 1, id: 'guide' }, { depth: 2, id: 'set-up' }]

  result.warnings;
  // [{ plugin: 'toc', code: 'skipped_level', message: '...', start: { line: 11, column: 0 } }]
  ```

  `data` is `undefined` when no plugin left any. A warning from a plugin has the name of the plugin as `plugin`, and the Vite plugin reports it with the file and the position like any other warning. Nothing exports `data` from the compiled document yet.

- [#1172](https://github.com/pngwn/MDsveX/pull/1172) [`c340fa5`](https://github.com/pngwn/MDsveX/commit/c340fa5cbe8bcd208f3b1c2784d10dedd0278736) Thanks [@pngwn](https://github.com/pngwn)! - Plugins write their data with `ctx.set(key, value)` and `ctx.add(key, value)`, and `ctx.data` is read-only:

  ```js
  heading: {
  	parse(node, ctx) {
  		return () => ctx.add('headings', { depth: node.depth, text: node.text_content });
  	},
  }
  ```

  - Every write belongs to the node whose handler made it, and a revoke takes back exactly that node's writes, whatever they were.
  - `add` keeps a list in document order, whatever order the handlers ran in. Of two nodes that `set` one key, the later one in the document wins. Writes from a sequential pass come after the rest.
  - A value is checked when it is written: one JSON cannot hold throws a `PluginDataError` with the plugin, the key, the path of the value and where the node is. It is copied and frozen.
  - Assigning to `ctx.data` throws a `TypeError` that names `ctx.set`.
  - `PluginDispatcher.on_data(listener)` follows each change to the data, a write or a revoke, with the value of the key after it.

  `@mdsvex/plugin-toc` and `@mdsvex/plugin-page-data` write with the new calls, with their output unchanged.

- [#1203](https://github.com/pngwn/MDsveX/pull/1203) [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/compile` exports the type `PluginDataContext`, what a component gets from `getContext(Symbol.for('mdsvex.plugin_data'))`. It is typed by the `PluginData` keys plugins declare, so a plugin's component reads its own data without writing the shape out:

  ```svelte
  <script>
  	import { getContext } from 'svelte';
  	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
  	const data = getContext(Symbol.for('mdsvex.plugin_data'));
  	const headings = $derived(data?.current?.toc?.headings ?? []);
  </script>
  ```

  Import it as a type. A value import of `mdsvex/compile` in a component would put the compiler in the page's bundle.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`cfc1ab0`](https://github.com/pngwn/MDsveX/commit/cfc1ab0468d82dc54d57ff525f542402a92423ee) Thanks [@github-actions](https://github.com/apps/github-actions)! - A document exports what its plugins left in `ctx.data` as `plugin_data`, beside `metadata`, keyed by plugin name. A template gets the same object as its `plugin_data` prop, and the document can read it in its own markup.

  ```js
  import Article, { metadata, plugin_data } from './article.svx';

  plugin_data.toc.headings; // [{ depth: 2, text: 'Install', id: 'install' }]
  ```

  - A document whose plugins left nothing has no such export and compiles as it did.
  - The values are JSON: plain objects, arrays, strings, finite numbers, booleans and `null`. Anything else fails the compile with a `PluginDataError` that names the plugin and the path of the value. A key that holds `undefined` is left out.
  - A frontmatter key named `plugin_data` is an error when the document has a template and its plugins left data.
  - `PluginData` is an interface, so a plugin types its own key by declaration merging:

  ```ts
  declare module 'mdsvex' {
  	interface PluginData {
  		toc: { headings: { depth: number; text: string; id?: string }[] };
  	}
  }
  ```

- [#1176](https://github.com/pngwn/MDsveX/pull/1176) [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can start async work for a node with `ctx.defer(node, task)`, and `compile_async()` waits for it:

  ```js
  return () =>
  	ctx.defer(node, async (node, ctx) => {
  		const entry = await lookup(node.text_content);
  		node.attrs.label = entry.short;
  		ctx.set(`entry:${entry.key}`, entry);
  	});
  ```

  - The task changes its node through the node and context it is given. Its changes apply once it finished and the node is final, in document order, and go if the parser takes the node back.
  - A task may change its node and what is inside it and write data for it. Anything else is a `TypeError`.
  - `compile()` throws a `PluginAsyncError` at the first `ctx.defer`, pointing to `compile_async()`. A task that fails rejects `compile_async()` with a `PluginTaskError` that names the plugin and the node.
  - The Vite plugin and `?data` imports wait for deferred work. A document that defers nothing compiles as before.

- [#1177](https://github.com/pngwn/MDsveX/pull/1177) [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10) Thanks [@pngwn](https://github.com/pngwn)! - Plugins can load files and tell the host what they read:
  - `ctx.depend(path)` names a file the output depends on. A compile result has them as `dependencies`.
  - `ctx.read(path)` and `ctx.resolve(specifier)` use the `read` and `resolve` options a host passes. The Vite plugin passes both.
  - `ctx.cached(key, load)` shares one load between documents. A key that is a path is a dependency, and `CompilerSession.invalidate(paths)` drops it.

  The Vite plugin compiles a document and its `?data` import again when a file its plugins depend on is created, changed or deleted, also outside the project root and in a watch build, and warns in dev when a document waits five seconds for a plugin.

- [#1177](https://github.com/pngwn/MDsveX/pull/1177) [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can have a `document` hook for work that needs the whole document. It runs once, after the parse, the sequential passes and every deferred task, in plugin order, and gets the root of the tree:

  ```js
  {
  	name: 'summary',
  	async document(root, ctx) {
  		ctx.set('headings', count_headings(root));
  	},
  }
  ```

  A hook that returns a promise needs `compile_async()`, `compile()` throws a `PluginAsyncError` for one. Its writes belong to no node.

- [#1203](https://github.com/pngwn/MDsveX/pull/1203) [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03) Thanks [@pngwn](https://github.com/pngwn)! - A plugin keeps what it needs through a document in `ctx.scratch`. It is one object per plugin name and document, the same from every handler, close callback, handler bound to a directive, deferred task and document hook of the plugin, so the directives of a plugin can leave something for its document hook without a walk of the tree:

  ```js
  {
  	name: 'refs',
  	parse: {
  		document(root, ctx) {
  			for (const list of ctx.scratch.lists ?? []) list.attrs.args = { ...list.attrs.args, ready: 'true' };
  		},
  	},
  	directives: {
  		references: {
  			parse(node, ctx) {
  				(ctx.scratch.lists ??= []).push(node);
  			},
  		},
  	},
  }
  ```

  Anything can go in it, and it never reaches `plugin_data`. A revoke does not take a write back, so keep there what the parser never revokes, such as a block directive or a heading, and write what must follow revocation with `ctx.set` and `ctx.add`. Reading it throws for a plugin with no `name`.

  `PluginContext` no longer takes keys of your own, so `ctx.section = ...` is a type error. Move such a key to `ctx.scratch`.

- [#1083](https://github.com/pngwn/MDsveX/pull/1083) [`9b8d968`](https://github.com/pngwn/MDsveX/commit/9b8d9681b17874aba4188e597c8b0d5075d155ed) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can add a text node with its own text. `prepend` and `append` take the text of a text node in place of attrs:

  ```js
  link: {
  	parse(node) {
  		return () => {
  			const label = node.append('html', { tag: 'span', attributes: { class: 'visually-hidden' } });
  			label.append('text', ' (opens in a new tab)');
  		};
  	},
  }
  ```

  The text renders as text, so markup, a brace and a character reference in it come out as characters. It is a node of its own beside the text the parser sends, `text_content` reads it, and it goes when the node whose handler added it is revoked. `append('text')` without text now throws a `TypeError`, where it used to add an empty node.

- [#1081](https://github.com/pngwn/MDsveX/pull/1081) [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b) Thanks [@pngwn](https://github.com/pngwn)! - A new `smart_punctuation` option turns straight quotes into curly quotes, two hyphens into an en dash, three into an em dash and three dots into an ellipsis. It is off by default, and `compile()` and the Vite plugin both take it.

  ```js
  mdsvex({ smart_punctuation: true });
  // or pick the kinds, and give the four quote strings of another language
  mdsvex({
  	smart_punctuation: {
  		dashes: false,
  		quotes: ['\u00ab', '\u00bb', '\u2039', '\u203a'],
  	},
  });
  ```

  Only prose changes. Code, math, urls, attributes, Svelte expressions, image alt text, titles and a character behind a backslash stay as written, and so does `--name` after a space, which is a command line flag. Heading ids are still made from the text as written.

- [#1191](https://github.com/pngwn/MDsveX/pull/1191) [`e27008d`](https://github.com/pngwn/MDsveX/commit/e27008dba1e54999c763edaf1af84ae585fba62d) Thanks [@pngwn](https://github.com/pngwn)! - A streaming view follows what plugins write and what their deferred tasks change. `PluginStream` from `@mdsvex/render/stream` holds the wire builder and the dispatcher of a document that arrives in pieces:

  ```js
  import { PluginStream } from '@mdsvex/render/stream';

  const stream = new PluginStream({ plugins, headings: make_heading_ids() });
  stream.renderers.push(renderer);
  stream.on_change(() => renderer.update(stream.buffer, ''));
  for await (const batch of batches) stream.apply(batch);
  await stream.end();
  ```

  - `stream.data.current` is what plugins wrote, a new object after each change, and a component that reads it renders again when it changes.
  - A node a deferred task changed renders again, even in a block the renderer had cached. `CursorHTMLRenderer` and `ComponentRenderer` take `invalidate(buf, nodes)` for this.
  - `end()` runs the sequential passes, waits for the deferred tasks and runs the document hooks, then renders every block again.

  Components read the data from the Svelte context under `Symbol.for('mdsvex.plugin_data')`, as `{ current }`. `Node.svelte` sets it from its `plugin_data` prop and a compiled document that has plugin data sets it too, so a component reads it the same way in both:

  ```svelte
  <script>
  	import { getContext } from 'svelte';
  	const data = getContext(Symbol.for('mdsvex.plugin_data'));
  </script>

  {data?.current?.toc?.headings.length}
  ```

  `Node.svelte` also takes `directives`, a component for a directive by its name, which gets the args as props and the label and the content as snippets, as in a compile. A stream with no plugin renders as before.

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

- [#1220](https://github.com/pngwn/MDsveX/pull/1220) [`3e868eb`](https://github.com/pngwn/MDsveX/commit/3e868eb09c8a67361168725175377b7f5125a7ed) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/host` exports `template_module`, the module a template id stands for when a module of extra replacements goes with the template: it exports the template and its replacements, with the names of the extra module winning. A host that bundles documents itself serves it as the Vite plugin does.

- [#1141](https://github.com/pngwn/MDsveX/pull/1141) [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can rewrite text. A sequential plugin takes a `text` function, which is called for each run of text in the document and replaces a range of it with text or with a node:

  ```js
  const emoji = {
  	name: 'emoji',
  	sequential: true,
  	text(run) {
  		for (const match of run.text.matchAll(/:([a-z0-9_+-]+):/g)) {
  			const to = table[match[1]];
  			if (to === undefined) continue;
  			run.replace(match.index, match.index + match[0].length, 'text', to);
  		}
  	},
  };

  // the same call puts a node in, here #12 becomes a link
  run.replace(start, end, 'link', { href: '/issues/12' }).append('text', '#12');
  ```

  - A run is the text of neighbouring text nodes joined, so a match is found however the tree split the text. `run.parent` is the node that holds it.
  - `run.replace(start, end, type, attrs)` takes offsets into `run.text` and, after them, what `append` takes. It returns a view of the new node. An empty range puts the node in at that point. A range that overlaps one already replaced throws a `RangeError`.
  - The text around a replacement is still the author's: it is escaped, mapped and curled by smart punctuation as before.
  - Code, math, urls, attribute values, expressions and raw text are never given to a text handler. Characters the author escaped, the text of an autolink, the alt text of an image and the text of a `code`, `kbd`, `samp`, `var` or `tt` element are held back unless the plugin sets `all_text: true`.
  - The handler runs once the tree is complete. A `text` function on a plugin that is not sequential throws a `TypeError`, and so does a `text` that is not a function.

  `mdsvex` exports the type of a run as `TextRun`.

- [#939](https://github.com/pngwn/MDsveX/pull/939) [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba) Thanks [@pngwn](https://github.com/pngwn)! - `unwrap_images`, off by default, renders a paragraph that holds only images without its `<p>`. An `img` replacement that renders a block element such as `<figure>` is then no longer inside one.

  ```js
  mdsvex({ components: '#lib/markdown.js', unwrap_images: true });
  ```

  ```md
  ![A chart](/chart.png)
  ```

  ```html
  <!-- off -->
  <p><img src="/chart.png" alt="A chart" /></p>
  <!-- on -->
  <img src="/chart.png" alt="A chart" />
  ```

  Several images in one paragraph are all unwrapped, and so is an image inside a link, which keeps its link. Any text beside the image keeps the `<p>`. It works the same in block quotes, list items, directives and HTML elements. `compile()` takes the option too, and the parser takes it as a parse option.

### Patch Changes

- [#1208](https://github.com/pngwn/MDsveX/pull/1208) [`ae0c24d`](https://github.com/pngwn/MDsveX/commit/ae0c24d53beab1c05f0c9074cd11edcabcd692ca) Thanks [@pngwn](https://github.com/pngwn)! - A `?data` import compared after an edit gives its plugins `ctx.resolve` as its load does, so a plugin that resolves no longer reloads every page that imports it on each edit.

- [#1224](https://github.com/pngwn/MDsveX/pull/1224) [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114) Thanks [@pngwn](https://github.com/pngwn)! - The type declarations write `.js` on their relative imports, so they resolve under `moduleResolution: node16` and `nodenext` as well as `bundler`. A project on `node16` or `nodenext` used to get TS2834 errors from inside the packages, or with `skipLibCheck` on, `any` where the types should be.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`edaaa59`](https://github.com/pngwn/MDsveX/commit/edaaa59bda7e388248428eb7b6459442c7ddd216) Thanks [@github-actions](https://github.com/apps/github-actions)! - The editor knows the `plugin_data` export of a document. When the config has plugins, a document that reads `plugin_data` and a module that imports it type check against the `PluginData` interface, so a key a plugin declared has its type and any other is `unknown`. The manifest the Vite plugin writes says whether a plugin could leave data, and `mdsvex.config.json` says so with a `plugins` entry.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`c085c85`](https://github.com/pngwn/MDsveX/commit/c085c856084f6346748a325b31fa50915413872a) Thanks [@github-actions](https://github.com/apps/github-actions)! - A brace escaped with a backslash renders as text, so Svelte no longer reads it as an expression. This holds in the alt text of an image too.

  ```md
  a \{1 + 1\} b
  ```

  renders `a {1 + 1} b`, where it used to render `a 2 b` or fail the build when the text between the braces was not JavaScript. An unescaped brace is an expression, as before.

- [#1179](https://github.com/pngwn/MDsveX/pull/1179) [`65ebb4d`](https://github.com/pngwn/MDsveX/commit/65ebb4dc029fc1cfd391495fa96a1e683bd3db4b) Thanks [@pngwn](https://github.com/pngwn)! - A components, template or directives module can export replacements from one declaration with several names or a destructuring. Every name is found, so `export const p = P, h1 = H1` replaces headings too.

- [#950](https://github.com/pngwn/MDsveX/pull/950) [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2) Thanks [@pngwn](https://github.com/pngwn)! - Documents compile faster with parse plugins, most of all with plugins that add nodes (`wrap_inner`, `prepend`, `append`, `wrap_from`) or that change inline nodes such as emphasis and links. A plugin now costs about what its own handlers do, where it used to slow down every node after the first one it added or changed. On a set of 20 real documents a compile with the heading autolink plugin took about 14% less time. Output is unchanged.

- [#956](https://github.com/pngwn/MDsveX/pull/956) [`78c552f`](https://github.com/pngwn/MDsveX/commit/78c552f8951c9186ec5b33934477d31e6028b627) Thanks [@pngwn](https://github.com/pngwn)! - Documents compile faster with parse plugins that group content, such as one that wraps each heading and what follows it in a section, or a steps directive that turns each heading into a step. Such a plugin used to slow down every node from its first wrapper to the end of the document or of the directive. On a set of 20 real documents a compile took about 4% less time with sections and about 10% less with steps. Output is unchanged.

- [#1215](https://github.com/pngwn/MDsveX/pull/1215) [`0c8b126`](https://github.com/pngwn/MDsveX/commit/0c8b1262437a4d22258949ad082b927c90078d98) Thanks [@pngwn](https://github.com/pngwn)! - A footnote definition may start its text on the next line, indented by four spaces, which is how Prettier formats a long one. It is the same footnote as one written with its text after the label:

  ```md
  [^1]:
      To add line breaks within a footnote,
      add a second line.
  ```

  A definition with no text, `[^1]:` with no indented line after it, fails the build with a `FootnoteError` whose code is `footnote_empty`.

- [#987](https://github.com/pngwn/MDsveX/pull/987) [`3f7ad22`](https://github.com/pngwn/MDsveX/commit/3f7ad22711f914a27338428e8a9fbbc24c03b33e) Thanks [@pngwn](https://github.com/pngwn)! - Spaces and tabs after a frontmatter fence no longer stop the frontmatter from being read. Editors and CMSs add them and they cannot be seen.

  ```md
  ---
  title: hi
  ---

  # Body
  ```

  Before, a space after the opening `---` rendered a rule, a paragraph `title: hi` and another rule, with no `metadata` export, and a space after the closing `---` did the same. Both fences now allow trailing spaces and tabs, in a compiled document and in a `?metadata` import. A fence followed by anything else (`--- x`) is still not a fence.

- [#1207](https://github.com/pngwn/MDsveX/pull/1207) [`ad07ded`](https://github.com/pngwn/MDsveX/commit/ad07dedac075a42ed0f41c9ea1b8e156ff317cf5) Thanks [@pngwn](https://github.com/pngwn)! - The editor compiles a document with `import_images` when the Vite plugin has it on, which is the default, so a replaced `img` gets the type of the import as its `src` where it used to get a string. The plugin writes the option to its manifest, and `mdsvex.config.json` takes `import_images`, on unless it is `false`. A manifest without the field means off.

- [#949](https://github.com/pngwn/MDsveX/pull/949) [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0) Thanks [@pngwn](https://github.com/pngwn)! - The first document with a `math` fence, which loads the math renderer, is parsed once, so its parse plugins run once for it. It keeps its parse while the renderer loads and then only renders again.

- [#1039](https://github.com/pngwn/MDsveX/pull/1039) [`a02a0ae`](https://github.com/pngwn/MDsveX/commit/a02a0aefe318b90c630df9818268f5588eaf476d) Thanks [@pngwn](https://github.com/pngwn)! - The first document with a math fence reports each of its warnings once. It renders a second time when the math renderer has loaded, and the warnings of the first render were reported as well.

- [#938](https://github.com/pngwn/MDsveX/pull/938) [`a8473b4`](https://github.com/pngwn/MDsveX/commit/a8473b453958c8619744cb0d8c8c694f515961bc) Thanks [@pngwn](https://github.com/pngwn)! - A `?metadata` request to the dev server only reads documents the server may serve. The path has to end in one of the configured extensions and pass Vite's `server.fs` rules (`allow`, `deny` and `strict`), as a request for the file itself would. A document outside `server.fs.allow` that is imported with `?metadata` in the browser needs its directory added to that option. Server rendering and builds read documents as before.

- [#1223](https://github.com/pngwn/MDsveX/pull/1223) [`a521675`](https://github.com/pngwn/MDsveX/commit/a52167532d3899c1900ffe81b43d9e12cbb89c87) Thanks [@pngwn](https://github.com/pngwn)! - A code span or an html comment a parse plugin makes shows the text the plugin puts in it, as a code fence does. Before, it rendered empty:

  ```js
  paragraph.append('code_span').append('text', 'a < b');
  // <code>a &lt; b</code>
  ```

- [#1219](https://github.com/pngwn/MDsveX/pull/1219) [`36b25c3`](https://github.com/pngwn/MDsveX/commit/36b25c33a81b385a868d10d56a16edc426247f42) Thanks [@pngwn](https://github.com/pngwn)! - A code fence a parse plugin makes shows the code the plugin puts in it. Text appended inside the fence is its code, in the html, through the highlighter, in a `pre` replacement and in a block that runs, as if the fence had been typed:

  ```js
  const fence = node.append('code_fence', { info: 'ts' });
  fence.append('text', 'let a = 1;');
  // <pre><code class="language-ts">let a = 1;</code></pre>
  ```

- [#1120](https://github.com/pngwn/MDsveX/pull/1120) [`9df619b`](https://github.com/pngwn/MDsveX/commit/9df619b02dc35693f47d4e0751df4c72f20ae491) Thanks [@pngwn](https://github.com/pngwn)! - The content of a typed `<pre>` or `<textarea>` is text, kept as written up to the close tag, as the content of `<script>` and `<style>` is. Line breaks and indentation stay, no paragraph or heading is made inside, and markdown markers are plain characters.

  ```md
  <pre>
  line one
    indented *x*
  
  # line three
  </pre>
  ```

  The text goes to Svelte as it is written, so an expression such as `{value}` and an element such as `<b>` still work there. With `component_mode: 'all'` a `pre` component gets that text as its children.

  A `<pre>` that starts a line is a block, as a `<div>` is: it ends the paragraph or the table on the line before it.

- [#1122](https://github.com/pngwn/MDsveX/pull/1122) [`e09ab81`](https://github.com/pngwn/MDsveX/commit/e09ab81451d98d6dd8d9b77f2f4409d169ae9a49) Thanks [@pngwn](https://github.com/pngwn)! - An element that writes one attribute twice is compiled with both, so Svelte reports the duplicate as it does in a `.svelte` file. An element with content used to be written with only one of them, which hid the mistake.

  ```md
  <div class="a" class="b">x</div>
  ```

  This now fails in Svelte with `attribute_duplicate`. A self closing tag such as `<img alt="a" alt="b" />` already did.

- [#936](https://github.com/pngwn/MDsveX/pull/936) [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27) Thanks [@pngwn](https://github.com/pngwn)! - `CompilerSession` and the vite plugin keep their tree, plugin dispatcher and renderer from one document to the next when parse plugins are configured, as they already did without plugins. They are rebuilt when `parse_plugins` is a different array, so pass a new array to change the plugins.

  A plugin that keeps a `NodeView` after its document has compiled now gets an error when it uses the view once the next document has started. It would otherwise read and write the nodes of that document. `TreeBuilder.reset()` works on a builder with plugins, and resets its dispatcher.

- [#1208](https://github.com/pngwn/MDsveX/pull/1208) [`ae0c24d`](https://github.com/pngwn/MDsveX/commit/ae0c24d53beab1c05f0c9074cd11edcabcd692ca) Thanks [@pngwn](https://github.com/pngwn)! - An image whose `src` a deferred task set, and a fence with `src=` that a task or an async `document` hook adds, now compile as if they were written in the document. `CompilerSession.settle` makes `Parsed.needs`, `snippets` and `math` again from the settled tree, so `compile_async`, a host that compiles in steps and the Vite plugin import the image and read the file.

- [#926](https://github.com/pngwn/MDsveX/pull/926) [`fc56ba8`](https://github.com/pngwn/MDsveX/commit/fc56ba892e7068b378e350c29cfb52be6c5d48b1) Thanks [@pngwn](https://github.com/pngwn)! - A document imported with `?raw`, `?url`, `?worker` or `?sharedworker` is left to Vite instead of being compiled as markdown.

- [#1139](https://github.com/pngwn/MDsveX/pull/1139) [`7dfb9c9`](https://github.com/pngwn/MDsveX/commit/7dfb9c9c7301e96e4780c03ff45b04dbee6e92c4) Thanks [@pngwn](https://github.com/pngwn)! - Vite no longer logs `Failed to load source map` for mdsvex when it loads the package through its own transform, as vitest does for a package that is not external. A line inside mdsvex read as the source map comment of the file it is in.

- [#923](https://github.com/pngwn/MDsveX/pull/923) [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41) Thanks [@pngwn](https://github.com/pngwn)! - The script that bare imports start is `lang="ts"` when an import is a type import or the module script is `lang="ts"`.

- [#929](https://github.com/pngwn/MDsveX/pull/929) [`19fc058`](https://github.com/pngwn/MDsveX/commit/19fc05846c53942ec53ca75baabecd02ed5da076) Thanks [@pngwn](https://github.com/pngwn)! - Vite 6 or later is required. The dev server picks up a changed component or template file through a hook that Vite 5 never calls, so on Vite 5 documents kept the old components and templates until a restart.

- Updated dependencies [[`6e921ad`](https://github.com/pngwn/MDsveX/commit/6e921adadb13a01894c48a1a8ba8e4cbac1a5016), [`7786d93`](https://github.com/pngwn/MDsveX/commit/7786d9301c06d94895386b5f03b7dc96fb5f2b8e), [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27), [`dadfba9`](https://github.com/pngwn/MDsveX/commit/dadfba96363ab3fc59e65799243651ea7b78195c), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`1c5c5ef`](https://github.com/pngwn/MDsveX/commit/1c5c5ef99483ac86ac52f434fe34b9237c27f12c), [`e42f3f1`](https://github.com/pngwn/MDsveX/commit/e42f3f1d978ab3746f9863da229078f77db85376), [`2781cbe`](https://github.com/pngwn/MDsveX/commit/2781cbe6b697dd5f2a268de17bc6049b41eca5b6), [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5), [`be86761`](https://github.com/pngwn/MDsveX/commit/be867619ed92fb0d7e9ef4294aa88afedc198683), [`354ab3c`](https://github.com/pngwn/MDsveX/commit/354ab3c6d672de2c8d5aa40e1e9d3da5ed4ae592), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`d4bbd4d`](https://github.com/pngwn/MDsveX/commit/d4bbd4dfb193cb5f6bbf10ed9444bf343c58590d), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`b214e6e`](https://github.com/pngwn/MDsveX/commit/b214e6e2f9596b9619b4e9d2bc43f9277c5d5395), [`7524ce7`](https://github.com/pngwn/MDsveX/commit/7524ce7de4cbdfd545c455fb8d1643031306b303), [`8e11a68`](https://github.com/pngwn/MDsveX/commit/8e11a689e5e00d92dd66ac92ea2f5f34be5963a1), [`ddf0d00`](https://github.com/pngwn/MDsveX/commit/ddf0d00c8313d9d314c71ad8592d6df7bc8f44ff), [`ef131ac`](https://github.com/pngwn/MDsveX/commit/ef131aca6ad93a6803d18b43ce919089fd0039c6), [`3bdc62e`](https://github.com/pngwn/MDsveX/commit/3bdc62eb6bd0ed4110d3af9b3485934ea996c19f), [`c1ccbfd`](https://github.com/pngwn/MDsveX/commit/c1ccbfdc7fc7cc7e63587bedd7d4287932462d50), [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`b73e460`](https://github.com/pngwn/MDsveX/commit/b73e4606a005f2093a90ac025cfe089e44c9a373), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`e16f89c`](https://github.com/pngwn/MDsveX/commit/e16f89c492542663079c4741d54727084f46b188), [`aa0a892`](https://github.com/pngwn/MDsveX/commit/aa0a89224d5781fba95fef0102d7b288af18a0d0), [`69fe42e`](https://github.com/pngwn/MDsveX/commit/69fe42eb47883e7029530bf576c2fe09acb00628), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`1b328e7`](https://github.com/pngwn/MDsveX/commit/1b328e7130927ac495f3d969d3d4f7f7b876c28d), [`b1ccd82`](https://github.com/pngwn/MDsveX/commit/b1ccd825b1cb05c59491880a112490a87b5c0d1d), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3343943`](https://github.com/pngwn/MDsveX/commit/3343943f3907da8ce45488c2da3d78023bd68851), [`0785cb7`](https://github.com/pngwn/MDsveX/commit/0785cb7950a81839e7dde22104f3f0bd704e0a29), [`c085c85`](https://github.com/pngwn/MDsveX/commit/c085c856084f6346748a325b31fa50915413872a), [`c9a977a`](https://github.com/pngwn/MDsveX/commit/c9a977ad3dadd981ca7f8c66104fd38435306408), [`9dd0099`](https://github.com/pngwn/MDsveX/commit/9dd00997dfafb1be89f0ee220269722eed83a535), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`10b2e4d`](https://github.com/pngwn/MDsveX/commit/10b2e4dd55f90c125fcc54765eac1a22cb9816d8), [`14e9951`](https://github.com/pngwn/MDsveX/commit/14e9951b3b9de574ca0cc9c9062b48328586f1b4), [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d), [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47), [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47), [`6a4c139`](https://github.com/pngwn/MDsveX/commit/6a4c1394d30e1b5c87ca63e96b3be6d5dfa10667), [`0c8b126`](https://github.com/pngwn/MDsveX/commit/0c8b1262437a4d22258949ad082b927c90078d98), [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4), [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4), [`3f7ad22`](https://github.com/pngwn/MDsveX/commit/3f7ad22711f914a27338428e8a9fbbc24c03b33e), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`b14fe53`](https://github.com/pngwn/MDsveX/commit/b14fe5315d014096fb4e7d1d0c45152ee3eb3e0e), [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0), [`636d9b9`](https://github.com/pngwn/MDsveX/commit/636d9b9c065a29007e9581151be1f6c061f256e4), [`58ca71c`](https://github.com/pngwn/MDsveX/commit/58ca71c76191f67c8215441f582f893e2cb7cdf6), [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0), [`37b0c66`](https://github.com/pngwn/MDsveX/commit/37b0c66b69197772f14722391d2affdd20295ff8), [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738), [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738), [`4efb7c1`](https://github.com/pngwn/MDsveX/commit/4efb7c130ebc6095fd9ead7a41cf043ffc1ef9c2), [`b966a44`](https://github.com/pngwn/MDsveX/commit/b966a447d4d32ee1868dc3a13653129b68f25235), [`911857b`](https://github.com/pngwn/MDsveX/commit/911857b811121fc1ca09f5e8effb21b7f937174a), [`9277618`](https://github.com/pngwn/MDsveX/commit/9277618c8e1e4a7278245a84c7210514cc55e834), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`6272e0d`](https://github.com/pngwn/MDsveX/commit/6272e0db220788f80f05463531a0ea0e1358ff0e), [`50e0b8c`](https://github.com/pngwn/MDsveX/commit/50e0b8ccc97885e0ca7eed53c075bfaed7969b23), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`b361600`](https://github.com/pngwn/MDsveX/commit/b361600c167cf1d53094cb2e1309768b4c8316e0), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`9a8b94d`](https://github.com/pngwn/MDsveX/commit/9a8b94da69804114e2cac93fc82cd12094592662), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`c37520f`](https://github.com/pngwn/MDsveX/commit/c37520f5d0ba21dc7647e4a31cedc723636a36dd), [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea), [`2749b28`](https://github.com/pngwn/MDsveX/commit/2749b28e8d5f1e75e663a8485b521472020be143), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`503a007`](https://github.com/pngwn/MDsveX/commit/503a007371d8cd60a4f7b2fec74c89c476196c39), [`78c552f`](https://github.com/pngwn/MDsveX/commit/78c552f8951c9186ec5b33934477d31e6028b627), [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368), [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148), [`fd12ae7`](https://github.com/pngwn/MDsveX/commit/fd12ae7c3e1e32956857388512444940049e955e), [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea), [`89bf377`](https://github.com/pngwn/MDsveX/commit/89bf3776a22003ab42517b9b8a542507fce6f03b), [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0), [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`a521675`](https://github.com/pngwn/MDsveX/commit/a52167532d3899c1900ffe81b43d9e12cbb89c87), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`3022559`](https://github.com/pngwn/MDsveX/commit/30225590d894496515c1dd1c5f602e790ca92e7b), [`c340fa5`](https://github.com/pngwn/MDsveX/commit/c340fa5cbe8bcd208f3b1c2784d10dedd0278736), [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`36b25c3`](https://github.com/pngwn/MDsveX/commit/36b25c33a81b385a868d10d56a16edc426247f42), [`bb3b2f1`](https://github.com/pngwn/MDsveX/commit/bb3b2f1e572fa7033a226f58585011bb7290afb5), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`9b8d968`](https://github.com/pngwn/MDsveX/commit/9b8d9681b17874aba4188e597c8b0d5075d155ed), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`2ecbf3d`](https://github.com/pngwn/MDsveX/commit/2ecbf3db4d5eb9a1d3fd01c041a3261eaa76a10c), [`604ea57`](https://github.com/pngwn/MDsveX/commit/604ea571b652d236951b98be5be49296dbfcc0f4), [`d313802`](https://github.com/pngwn/MDsveX/commit/d31380241a1c9e096da42261a6025b6ff8b57521), [`8882b5a`](https://github.com/pngwn/MDsveX/commit/8882b5af6820661b4eecff452b88fb4b8d7815b8), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`9df619b`](https://github.com/pngwn/MDsveX/commit/9df619b02dc35693f47d4e0751df4c72f20ae491), [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`e09ab81`](https://github.com/pngwn/MDsveX/commit/e09ab81451d98d6dd8d9b77f2f4409d169ae9a49), [`4f1821d`](https://github.com/pngwn/MDsveX/commit/4f1821d6b94839b70904d63df154534cd0d44c4b), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`a87bf30`](https://github.com/pngwn/MDsveX/commit/a87bf30a4ce04fba3ff18366b9b808b6338fd598), [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b), [`1c99e72`](https://github.com/pngwn/MDsveX/commit/1c99e72673fe19216a0a809acce122b176364135), [`e27008d`](https://github.com/pngwn/MDsveX/commit/e27008dba1e54999c763edaf1af84ae585fba62d), [`9dc77cf`](https://github.com/pngwn/MDsveX/commit/9dc77cf82fc9180fc2d2ca57fa4866b83141750d), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`cc819e4`](https://github.com/pngwn/MDsveX/commit/cc819e40ae16f4c13ab164328ea3eee94f47446a), [`680e26f`](https://github.com/pngwn/MDsveX/commit/680e26f83eba5b0d2a74c44d24ca022ea3d699b3), [`707e616`](https://github.com/pngwn/MDsveX/commit/707e616f8672e51966ffcbd08bc8beb994910262), [`f3ee7ec`](https://github.com/pngwn/MDsveX/commit/f3ee7ecb9ac2f3b9711631776b3cabd0bc757924), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148), [`f62d613`](https://github.com/pngwn/MDsveX/commit/f62d6131d1b14a7876bc80a7a67cb08bb51acafa), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`2f8da0a`](https://github.com/pngwn/MDsveX/commit/2f8da0a6ef28a23e80c48627d7a25a30b6ea2ac8), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`06b466b`](https://github.com/pngwn/MDsveX/commit/06b466b326293b1cb1f12a69c93513f138f03774), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`182abbc`](https://github.com/pngwn/MDsveX/commit/182abbc20d5a942ada81867ec6c482f0d89117c6), [`88b34e5`](https://github.com/pngwn/MDsveX/commit/88b34e5cd7c7549cd0bf0375131e4090ce060cf0), [`6d96607`](https://github.com/pngwn/MDsveX/commit/6d9660796b1cff6e781bfb6b7b2d9af87edeadae), [`00fe005`](https://github.com/pngwn/MDsveX/commit/00fe005adf2963908dcbf15b6c2986416345710f), [`b26b0c4`](https://github.com/pngwn/MDsveX/commit/b26b0c4d5afd1db34e840878e7b352ddd3d9294f), [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e), [`cfc1ab0`](https://github.com/pngwn/MDsveX/commit/cfc1ab0468d82dc54d57ff525f542402a92423ee), [`9b9fc0c`](https://github.com/pngwn/MDsveX/commit/9b9fc0c643423a48276582ef8e9b61c4d0f8c4e7), [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3), [`6c73849`](https://github.com/pngwn/MDsveX/commit/6c73849b9d27d895795f32fcb6b8ae03a7a418af), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`a91c589`](https://github.com/pngwn/MDsveX/commit/a91c589eceab67c32767fbce7eb9061c2a1cdb22), [`817c168`](https://github.com/pngwn/MDsveX/commit/817c168a85bb7033a8c41a8037d5ed14919d35b3), [`06b1c7f`](https://github.com/pngwn/MDsveX/commit/06b1c7f75479cb2f39fb91560fdb0322433315d7), [`5ba36ec`](https://github.com/pngwn/MDsveX/commit/5ba36ecea4c8008f0249fc105d86486a52621ddc), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba), [`2c06694`](https://github.com/pngwn/MDsveX/commit/2c0669413118ca19a8b97ba4e68bdda27f9a2d2d), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637), [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3), [`db21435`](https://github.com/pngwn/MDsveX/commit/db214350aab84b0d5b91560d8eb4c5b7ec11728f), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d)]:
  - @mdsvex/parse@1.0.0-next.2
  - @mdsvex/render@1.0.0-next.2

## 1.0.0-next.1

### Minor Changes

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Import statements at the top of a document are kept. They go into the document's instance `<script>`, or into a new `<script>` when there is none.

  ```md
  import Chart from './Chart.svelte'

  <Chart />
  ```

- [#888](https://github.com/pngwn/MDsveX/pull/888) [`c81604f`](https://github.com/pngwn/MDsveX/commit/c81604f77f7e2662f42db2dcfb1c2a29a594e726) Thanks [@pngwn](https://github.com/pngwn)! - Add a `mdsvex/compile` entry point that holds only the compiler: `compile`, `CompilerSession`, the errors it throws and its option and result types. It never imports Vite, `es-module-lexer` or Node builtins, even lazily, so a browser or worker bundle needs no config to leave them out.

  ```js
  import { compile } from 'mdsvex/compile';

  const { code } = compile('# Hello');
  ```

  The root `mdsvex` entry is unchanged and still exports everything, including the Vite plugin.

- [#887](https://github.com/pngwn/MDsveX/pull/887) [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67) Thanks [@pngwn](https://github.com/pngwn)! - `compile()` takes `strict_directives: false` to render a directive with no component as its children instead of throwing, which suits previews and editors.

  ```ts
  compile(':::note[x]\nbody\n:::', { strict_directives: false }); // <p>body</p>
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

- [#887](https://github.com/pngwn/MDsveX/pull/887) [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67) Thanks [@pngwn](https://github.com/pngwn)! - The editor now knows your templates, replacement components and directives. The Vite plugin writes what it resolved to `node_modules/.mdsvex/manifest.json` and the editor reads it, falling back to an `mdsvex.config.json` like the playground's:

  ```json
  {
  	"templates": { "docs": "#lib/templates/Docs.svelte" },
  	"components": "#lib/markdown.ts"
  }
  ```

  Hovering a replaced element or directive shows its component, and go to definition opens it. The frontmatter `template` key is typed as your template names or `false`. Completions offer template names, the template's props as frontmatter keys and their literal values, and a directive's props as args with their values. Directive args and the frontmatter of a templated document are type-checked against the component's props, and `metadata` is typed by the same YAML parser `compile()` uses. Compile errors such as an unknown template show on their line, and `.svx` files are supported alongside `.pfm`.

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - The editor reads live expressions in code as references, so type errors, hover, rename and the unused check work on them. It highlights code as the Vite plugin does unless the plugin renders code plain, and `mdsvex.config.json` takes `highlight: false`. A half-typed live expression is an error on that fence rather than on the whole document.

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

- [#892](https://github.com/pngwn/MDsveX/pull/892) [`59bbad3`](https://github.com/pngwn/MDsveX/commit/59bbad3d1905ea378b8745d916af0dca3e63b042) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/highlight` exports `language_loaders`, which loads each bundled twinkleplop language on its own, so a browser `compile` only fetches the languages it uses. It also re-exports `shiki_notation`, for content written with Shiki's `// [!code ++]` markers:

  ```js
  import {
  	create_highlight,
  	default_annotations,
  	language_loaders,
  	shiki_notation,
  } from 'mdsvex/highlight';

  const highlight = create_highlight({
  	languages: { svelte: await language_loaders.svelte() },
  	annotations: [...default_annotations, shiki_notation()],
  });
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

- [#868](https://github.com/pngwn/MDsveX/pull/868) [`4927fd8`](https://github.com/pngwn/MDsveX/commit/4927fd87ef00ae106f081cf4315e425ec71a790c) Thanks [@pngwn](https://github.com/pngwn)! - With SvelteKit 3, the `mdsvex()` Vite plugin registers its extensions with SvelteKit, so they no longer need repeating in `sveltekit({ extensions })`.

  ```js
  export default defineConfig({
  	plugins: [mdsvex({ extensions: ['.svx'] }), sveltekit()],
  });
  ```

  Without SvelteKit, the build fails with an error naming the missing extensions until they are added to `svelte({ extensions })`.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - A top level `<script>` with a `src` attribute, as in pasted tweet or Instagram embeds, renders as `<svelte:element this={"script"}>`. Svelte treats every top level `<script>` as the component script, so two embeds used to fail to compile.

- [#872](https://github.com/pngwn/MDsveX/pull/872) [`266f24d`](https://github.com/pngwn/MDsveX/commit/266f24d652a2bf03795b5397696790eb016890b4) Thanks [@pngwn](https://github.com/pngwn)! - The `parsePlugins` option is now `parse_plugins`, as every option mdsvex owns is snake_case.

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

- [#877](https://github.com/pngwn/MDsveX/pull/877) [`b35c5ff`](https://github.com/pngwn/MDsveX/commit/b35c5ff2011f9b35515edd24a11027c7a410ba56) Thanks [@pngwn](https://github.com/pngwn)! - A template can export its own `directives` namespace from its module script, the same way a components module does. For a document wrapped in that template, its directives take precedence over the root ones:

  ```svelte
  <script module>
    export * as directives from './docs-directives.ts';
  </script>
  ```

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

- [#893](https://github.com/pngwn/MDsveX/pull/893) [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9) Thanks [@pngwn](https://github.com/pngwn)! - A code span holding only `#!` or `#!lang`, with no space and code after it, renders as ordinary inline code showing that text, and never takes a language hint.

  ```md
  Write `#!ts` or `#!` in prose.
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

- [#886](https://github.com/pngwn/MDsveX/pull/886) [`6c64d8b`](https://github.com/pngwn/MDsveX/commit/6c64d8b7c13c876dc03668123a9dbfcc9520b885) Thanks [@pngwn](https://github.com/pngwn)! - A `<style>` block in a document works. The vite plugin no longer compiles vite-plugin-svelte's style request for the document as markdown, which broke the build.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Compiling markdown is much faster, especially with source maps, and repeated one-off compiles no longer set up a new compiler each time. The vite plugin transforms markdown files many times faster and only builds the part of the source map that the Svelte output needs.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

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

- [#871](https://github.com/pngwn/MDsveX/pull/871) [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now ships type declarations, so TypeScript finds types for `compile`, `CompileOptions`, `mdsvex` and the other exports instead of reporting a missing declaration file. Types for `@mdsvex/render` also check under TypeScript 6.

- [#889](https://github.com/pngwn/MDsveX/pull/889) [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e) Thanks [@pngwn](https://github.com/pngwn)! - Character references like `&lt;`, `&copy;` and `&#123;` in text, link and image attributes render as written instead of being escaped a second time. A bare `&`, a backslash escaped `\&` and any `&` inside code are still escaped.

  ```md
  a &lt; b &copy;
  ```

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - An annotation in a block comment, such as `/* [!hl] */` or `<!-- [!hl] -->`, now hides the whole comment, and fences with many annotations render in linear time.

- [#875](https://github.com/pngwn/MDsveX/pull/875) [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9) Thanks [@pngwn](https://github.com/pngwn)! - Attribute values in raw html render as written, so an entity like `&amp;` is no longer escaped a second time.

  ```md
  <div title="a &amp; b">x</div>
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - Spread and attachment attributes on HTML you type, such as `<div {...rest} {@attach tooltip}>`, are no longer rendered as `...rest={...rest}`, which Svelte failed to compile.

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Files with Windows (`\r\n`) or old Mac (`\r`) line endings compile to the same HTML as their `\n` equivalents, and their sourcemaps point at the right lines and columns in the original file.

- Updated dependencies [[`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4), [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781), [`fa297f9`](https://github.com/pngwn/MDsveX/commit/fa297f9b3fda7cc11c3f4274ba0b0cc27acedf9a), [`ebdb9fb`](https://github.com/pngwn/MDsveX/commit/ebdb9fb687933c69da0260eb50e8a4d2fae2bbca), [`311902d`](https://github.com/pngwn/MDsveX/commit/311902de7c606430e3899440d37def14f5190b6c), [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87), [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`8bd14fe`](https://github.com/pngwn/MDsveX/commit/8bd14fe77aed1ff532757a06e934fa6238ecb2da), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`045aca9`](https://github.com/pngwn/MDsveX/commit/045aca94077183b8b58bb59c45813f0aa4f33cde), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`f2ff5fe`](https://github.com/pngwn/MDsveX/commit/f2ff5fe144a9009a79e0aa7a6f08f1bed5a7696c), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55), [`4c55f5e`](https://github.com/pngwn/MDsveX/commit/4c55f5eea023e687202fa97626b401f09bffd6f7), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e708e1d`](https://github.com/pngwn/MDsveX/commit/e708e1d4c66478efd8606fa2e1ff2fee40e0732a), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`430cf34`](https://github.com/pngwn/MDsveX/commit/430cf3493575c706b31b5e02b4c219f4b6ea0569), [`eefaff5`](https://github.com/pngwn/MDsveX/commit/eefaff563e6ce05026f92c03fce21b3ba4bd5e77), [`3f5bbbb`](https://github.com/pngwn/MDsveX/commit/3f5bbbb069ca12e16b3bb96afb60c41362161109), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`1dceed1`](https://github.com/pngwn/MDsveX/commit/1dceed1b863e202066c943d7b3e463db7e8fdb05), [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e), [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239)]:
  - @mdsvex/parse@1.0.0-next.1
  - @mdsvex/render@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e), [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb), [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9), [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/render@1.0.0-next.0
  - @mdsvex/parse@1.0.0-next.0

## 0.12.5

### Patch Changes

- [#714](https://github.com/pngwn/MDsveX/pull/714) [`14ad73f`](https://github.com/pngwn/MDsveX/commit/14ad73fd5c563a5ac263a9169a50ebf022d34566) Thanks [@pngwn](https://github.com/pngwn)! - Ensure that mdsvex files and layouts can contain Svelte 5 syntax.

* [#714](https://github.com/pngwn/MDsveX/pull/714) [`14ad73f`](https://github.com/pngwn/MDsveX/commit/14ad73fd5c563a5ac263a9169a50ebf022d34566) Thanks [@pngwn](https://github.com/pngwn)! - Replace process polyfill with something that isn't ridiculous

## 0.12.4

### Patch Changes

- [#692](https://github.com/pngwn/MDsveX/pull/692) [`27b40a8`](https://github.com/pngwn/MDsveX/commit/27b40a81417a743a07075eb02eb8b2f937f91140) Thanks [@ckiee](https://github.com/ckiee)! - fix(mdsvex): Ensure escaped <angle>bracket is handled correctly

* [#712](https://github.com/pngwn/MDsveX/pull/712) [`92268f4`](https://github.com/pngwn/MDsveX/commit/92268f49cf7e40cf463d283d7ecc791d222bcbcb) Thanks [@pngwn](https://github.com/pngwn)! - Allows user to disable automatic code optimisation (`@html` insertion)

- [#545](https://github.com/pngwn/MDsveX/pull/545) [`fa44d04`](https://github.com/pngwn/MDsveX/commit/fa44d0432cde153a5fe23a987b0b5cce9e961660) Thanks [@henrikvilhelmberglund](https://github.com/henrikvilhelmberglund)! - Replace hyphen in YAML frontmatter with underscore to prevent issues when building

* [#690](https://github.com/pngwn/MDsveX/pull/690) [`59e793e`](https://github.com/pngwn/MDsveX/commit/59e793e78c504bb95ab8ee40db411d2680d1ff77) Thanks [@Antosik](https://github.com/Antosik)! - Fix: Export global type definitions for .svx files

- [#709](https://github.com/pngwn/MDsveX/pull/709) [`7dd3f90`](https://github.com/pngwn/MDsveX/commit/7dd3f904afb39cf91f15db5a04442a4a1c1414c9) Thanks [@pngwn](https://github.com/pngwn)! - Ensure mdsvex works in a browser environment.

* [#656](https://github.com/pngwn/MDsveX/pull/656) [`bdb68ee`](https://github.com/pngwn/MDsveX/commit/bdb68eee6f4ed5e4fdd649cb24662329fe1032b9) Thanks [@ghostdevv](https://github.com/ghostdevv)! - fix: types in the exports map (https://github.com/pngwn/MDsveX/pull/651 https://github.com/pngwn/MDsveX/pull/656)

## 0.12.3

### Patch Changes

- [#637](https://github.com/pngwn/MDsveX/pull/637) [`9e8165f`](https://github.com/pngwn/MDsveX/commit/9e8165f981f52ef0b05cbb93335a7ac664d9e50c) Thanks [@pngwn](https://github.com/pngwn)! - fix layout path resolution

## 0.12.2

### Patch Changes

- [#630](https://github.com/pngwn/MDsveX/pull/630) [`157d9a3`](https://github.com/pngwn/MDsveX/commit/157d9a3e05ad08dfec2837828e11c19f6941f66c) Thanks [@pngwn](https://github.com/pngwn)! - Fix the builds

## 0.12.1

### Patch Changes

- [#628](https://github.com/pngwn/MDsveX/pull/628) [`b1fc10b`](https://github.com/pngwn/MDsveX/commit/b1fc10bbcc870ff57668a0627872701926070cd4) Thanks [@pngwn](https://github.com/pngwn)! - fix exports

## 0.12.0

### Minor Changes

- [#617](https://github.com/pngwn/MDsveX/pull/617) [`623b182`](https://github.com/pngwn/MDsveX/commit/623b18277b867a7b088951609710af871c9b9e56) Thanks [@benmccann](https://github.com/benmccann)! - add exports map to package.json and cleanup build output.

### Patch Changes

- [#612](https://github.com/pngwn/MDsveX/pull/612) [`91ef99f`](https://github.com/pngwn/MDsveX/commit/91ef99f9e95f6014243deadbbdcc13aac24079f8) Thanks [@moiri-gamboni](https://github.com/moiri-gamboni)! - Fix typescript module declaration to resolve errors when importing markdown files as components

## 0.11.2

### Patch Changes

- [#604](https://github.com/pngwn/MDsveX/pull/604) [`82553e0`](https://github.com/pngwn/MDsveX/commit/82553e02ab06b40a1650632865e076d0ad4d6ea4) Thanks [@pngwn](https://github.com/pngwn)! - Update peerDeps for Svelte 5

## 0.11.1

### Patch Changes

- [#596](https://github.com/pngwn/MDsveX/pull/596) [`d238325`](https://github.com/pngwn/MDsveX/commit/d2383257d959c68ea5279fd3a8d22ec6d5a4504e) Thanks [@TheOnlyTails](https://github.com/TheOnlyTails)! - Infer the settings type when using unified plugins with settings

* [#591](https://github.com/pngwn/MDsveX/pull/591) [`1ff938c`](https://github.com/pngwn/MDsveX/commit/1ff938c9e9aa588486fb57f762a5356630549288) Thanks [@vnphanquang](https://github.com/vnphanquang)! - Allow more extensive extension filtering. For example, now `.md.svelte` is possible

- [#592](https://github.com/pngwn/MDsveX/pull/592) [`68c6df2`](https://github.com/pngwn/MDsveX/commit/68c6df2e97103119a2bb048588f43d4f0fad1493) Thanks [@vnphanquang](https://github.com/vnphanquang)! - Pass filename to highlighter

* [#603](https://github.com/pngwn/MDsveX/pull/603) [`ae41002`](https://github.com/pngwn/MDsveX/commit/ae410026fb51bcdb5577c324a4e4d87323a0e57b) Thanks [@pngwn](https://github.com/pngwn)! - Update peerDependencies to allow Svelte 5

## 0.11.0

### Minor Changes

- [#522](https://github.com/pngwn/MDsveX/pull/522) [`0d690dc`](https://github.com/pngwn/MDsveX/commit/0d690dcc98358aa33a2d9a12bb5f908bbbe8e8a4) Thanks [@pngwn](https://github.com/pngwn)! - The default code highlighter is now exported, for your convenience.

* [#520](https://github.com/pngwn/MDsveX/pull/520) [`d5191b6`](https://github.com/pngwn/MDsveX/commit/d5191b64f20a93adb1845435fa0244d2d29c63b4) Thanks [@flakolefluk](https://github.com/flakolefluk)! - Support Svelte v4.

## 0.10.6

### Patch Changes

- [#450](https://github.com/pngwn/MDsveX/pull/450) [`eb10fbd`](https://github.com/pngwn/MDsveX/commit/eb10fbda2d682593083369960afc018ae8fafc45) Thanks [@GauBen](https://github.com/GauBen)! - Escape script and style tags in frontmatter

## 0.10.5

### Patch Changes

- [#409](https://github.com/pngwn/MDsveX/pull/409) [`573cabb`](https://github.com/pngwn/MDsveX/commit/573cabbb24b61390bdae2ec517807ea9b54b6aad) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add defineConfig and ambient d.ts

## 0.10.4

### Patch Changes

- [#407](https://github.com/pngwn/MDsveX/pull/407) [`7dee856`](https://github.com/pngwn/MDsveX/commit/7dee856ea2e577dae3c32b1039e26d32c1a08847) Thanks [@pngwn](https://github.com/pngwn)! - make it work

## 0.10.3

### Patch Changes

- [#405](https://github.com/pngwn/MDsveX/pull/405) [`9d98465`](https://github.com/pngwn/MDsveX/commit/9d98465dce438efd520b069ae90b75fafe0f65db) Thanks [@pngwn](https://github.com/pngwn)! - Delete globals.d.ts

* [#403](https://github.com/pngwn/MDsveX/pull/403) [`5349992`](https://github.com/pngwn/MDsveX/commit/5349992078dbc9f3116089570465aec383934432) Thanks [@pngwn](https://github.com/pngwn)! - Revert 401 feat/defineconfig

## 0.10.2

### Patch Changes

- [#401](https://github.com/pngwn/MDsveX/pull/401) [`e3d6228`](https://github.com/pngwn/MDsveX/commit/e3d6228851d1e75f073687a4f7fa4ad72fcd246b) Thanks [@PuruVJ](https://github.com/PuruVJ)! - expose types, and defineMDSveXConfig

## 0.10.1

### Patch Changes

- [#399](https://github.com/pngwn/MDsveX/pull/399) [`814e8f6`](https://github.com/pngwn/MDsveX/commit/814e8f6f712fe6499c3fb71d895fe5f4430522ab) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Fix globals.d.ts location

## 0.10.0

### Minor Changes

- [#396](https://github.com/pngwn/MDsveX/pull/396) [`c0cdf71`](https://github.com/pngwn/MDsveX/commit/c0cdf71915314c3c709cb616b7822c20f2954666) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add ambient Typings

## 0.9.8

### Patch Changes

- [#274](https://github.com/pngwn/MDsveX/pull/274) [`b253bb0`](https://github.com/pngwn/MDsveX/commit/b253bb0e402d109a62f8ad33f96943672d65cc1e) Thanks [@pngwn](https://github.com/pngwn)! - Custom highlight functions now receive the metastring as an additional argument.

## 0.9.7

### Patch Changes

- [#265](https://github.com/pngwn/MDsveX/pull/265) [`d1c1b4f`](https://github.com/pngwn/MDsveX/commit/d1c1b4f0a2b70fb09d3efb5f391ca12f717a0474) Thanks [@wlach](https://github.com/wlach)! - Escape code chunks in browser builds

## 0.9.6

### Patch Changes

- [#256](https://github.com/pngwn/MDsveX/pull/256) [`492b7a4`](https://github.com/pngwn/MDsveX/commit/492b7a4ad0eaf4274bdc83e629816644e56de643) Thanks [@pngwn](https://github.com/pngwn)! - Props passed to mdsvex documents will now be forwarded to layout files.

## 0.9.5

### Patch Changes

- [#253](https://github.com/pngwn/MDsveX/pull/253) [`8dc7900`](https://github.com/pngwn/MDsveX/commit/8dc790039a6b8f5f31f3e71bfc09c8d7a968cc95) Thanks [@pngwn](https://github.com/pngwn)! - There is now an ESM browser build in addition to UMD.

## 0.9.4

### Patch Changes

- [#251](https://github.com/pngwn/MDsveX/pull/251) [`3d8b400`](https://github.com/pngwn/MDsveX/commit/3d8b40039f3b096b609cdd358f3d56f9961c63e4) Thanks [@pngwn](https://github.com/pngwn)! - UMD build now works in the browser.

## 0.9.3

### Patch Changes

- [`2af50ee`](https://github.com/pngwn/MDsveX/commit/2af50ee80aeda5ca007b1046a8bb04523963ddc9) [#239](https://github.com/pngwn/MDsveX/pull/239) Thanks [@brev](https://github.com/brev)! - Standalone compile() function not returning headmatter attributes. Also export all types.

## 0.9.2

### Patch Changes

- [`0567e15`](https://github.com/pngwn/MDsveX/commit/0567e151ea29ea531b8f71496c46871add43dcbb) [#237](https://github.com/pngwn/MDsveX/pull/237) Thanks [@pngwn](https://github.com/pngwn)! - Fix "Cannot find module 'prism-svelte'" error.

## 0.9.1

### Patch Changes

- [`f458229`](https://github.com/pngwn/MDsveX/commit/f458229033aaee7a86bbba6004053f65441ac25c) [#234](https://github.com/pngwn/MDsveX/pull/234) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now exposes an `escapeSvelte` utility to help with escaping Svelte syntax in custom highlight functions.

* [`fe9b437`](https://github.com/pngwn/MDsveX/commit/fe9b43782d3cf5ea74b13d69aa82fbf0b0db4837) [#233](https://github.com/pngwn/MDsveX/pull/233) Thanks [@pngwn](https://github.com/pngwn)! - Language definitions for fenced code-blocks are now case insensitive.

- [`8c905ce`](https://github.com/pngwn/MDsveX/commit/8c905ce380e0a8fb0b755f9b3ed23224b0ed4866) [#231](https://github.com/pngwn/MDsveX/pull/231) Thanks [@pngwn](https://github.com/pngwn)! - Svelte syntax is now highlighted by default when using the default code highlighter.

## 0.9.0

### Minor Changes

- [`99da8fe`](https://github.com/pngwn/MDsveX/commit/99da8fe17882d55ecb7ec0d5a64ee6a592fc17bc) [#207](https://github.com/pngwn/MDsveX/pull/207) Thanks [@pngwn](https://github.com/pngwn)! - User-provided remark plugins that modify code nodes now run before the builtin in code highlighting, allowing for custom code transformations.

* [`aa8d825`](https://github.com/pngwn/MDsveX/commit/aa8d825a241b02a4387e2b034038b68d76ebe1b6) [#209](https://github.com/pngwn/MDsveX/pull/209) Thanks [@pngwn](https://github.com/pngwn)! - Asynchronous custom highlight functions are now supported.

## 0.8.9

### Patch Changes

- [`a4806af`](https://github.com/pngwn/MDsveX/commit/a4806af06edf2c756a0777cb42eb73edcd12abe7) [#187](https://github.com/pngwn/MDsveX/pull/187) Thanks [@wlach](https://github.com/wlach)! - Various small fixes to compile typechecking

* [`94d5c3e`](https://github.com/pngwn/MDsveX/commit/94d5c3ed6b09565319168e1befd4ca80c4a2b2eb) [#185](https://github.com/pngwn/MDsveX/pull/185) Thanks [@wlach](https://github.com/wlach)! - Fix calling mdsvex.compile with no options

## 0.8.8

### Patch Changes

- 5949714: Update licences
- 142933b: Update Licenses
- 08f9963: Update licences
- a79e29f: Add full licenses.
- ca179e6: Update licenses.
