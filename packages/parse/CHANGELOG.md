# parse

## 1.0.0-next.3

### Minor Changes

- [#1234](https://github.com/pngwn/MDsveX/pull/1234) [`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can observe a directive another plugin owns. `observe` on a parse plugin, or on the `parse` of a plugin, takes entries by directive name as a plugin's own `directives` do, with `parse`, `children` and `descendants`:

  ```js
  const numbering = {
  	name: 'numbering',
  	observe: {
  		figure: {
  			parse(figure, ctx) {
  				const number = (ctx.scratch.figures = (ctx.scratch.figures ?? 0) + 1);
  				return () => ctx.set('target:' + figure.attrs.args.id, { number });
  			},
  		},
  	},
  };
  ```

  An observer runs after the owner's handlers, at the open and at the close, whoever owns the name or renders the directive, in the fused pass. It writes plugin data, warns, takes ids, uses its scratch and defers, and changes no node: a write to one, from its handlers, its close callbacks or a task it deferred, throws a `TypeError` that names the directive and its owner.

  A directive has one owner. Two plugins that bind the same directive name throw a `DirectiveOwnerError` with `directive` and both plugin names at setup, where the later one used to take the name silently, and so do two `directive_handlers` tables in the parse package.

### Patch Changes

- [#1241](https://github.com/pngwn/MDsveX/pull/1241) [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657) Thanks [@pngwn](https://github.com/pngwn)! - Documents with a lot of HTML parse about 8% faster, render to HTML about 30% faster and compile about 12% faster. The `attributes` of an HTML node's metadata are now built the first time they are read, so a spread of the metadata, `Object.keys` and `Object.entries` leave them out. Read `meta.attributes` directly instead.

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

- [#948](https://github.com/pngwn/MDsveX/pull/948) [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27) Thanks [@pngwn](https://github.com/pngwn)! - Leaf and container directives no longer need their square brackets. `::toc` and `:::note` alone on a line are directives with no label, the same tree as `::toc[]` and `:::note[]`, and args can follow the name directly: `::toc(depth=2)`, `:::note(kind=warn)`.

  ```md
  :::steps

  ## Install

  ## Configure

  :::
  ```

  Only an argument list and trailing spaces or tabs may follow the name. Anything else keeps the line a paragraph, so `::before is a pseudo-element`, `::name:` and `:::name [x]` are still text. When both are written the brackets come first, `::name(k=v)[x]` is a paragraph.

  A line that is exactly `::word` or `:::word` used to be a paragraph and is now a directive. Write `\::word` to keep it as text.

  The inline form is unchanged and still needs its brackets: `:name` in a sentence is text, so `:tada:` and `std::vector` are safe.

- [#944](https://github.com/pngwn/MDsveX/pull/944) [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5) Thanks [@pngwn](https://github.com/pngwn)! - Parse handlers can be bound to a directive name. `directive_handlers` on the parse options (and a third argument of `PluginDispatcher`) takes tables keyed by directive name, and an entry holds `children`, `descendants` and `parse`:

  ```js
  const bound = {
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
  };

  parse_markdown_svelte(source, { directive_handlers: [bound] });
  ```

  - `children` handlers run for nodes written directly inside a container directive of that name, `descendants` handlers for nodes at any depth, and `parse` for the directive itself, of any form.
  - Each gets `ctx.directive`, `ctx.index` (how many times the handler already ran in this directive) and `ctx.state`, an object that is new for each directive. A write to the state and the index a handler used are undone when the node it ran for is revoked.
  - Bound handlers run before global plugins for the same node.

  A block directive now gets its `args` before its `name`, so a handler that runs at the name can read them. `NodeView`, `WrapperView` and the handler types are exported from `@mdsvex/parse`.

- [#931](https://github.com/pngwn/MDsveX/pull/931) [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9) Thanks [@pngwn](https://github.com/pngwn)! - Han, kana and hangul characters count as a boundary on the outer side of a delimiter, so emphasis, strong and strikethrough work in CJK prose, which has no spaces, without the `|` marker. Other scripts written without spaces, such as Thai, still need the marker.

  ```md
  这是*重要*的, これは*重要*です and 이것은~~중요~~합니다
  ```

- [#950](https://github.com/pngwn/MDsveX/pull/950) [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2) Thanks [@pngwn](https://github.com/pngwn)! - The parser says which closes are not final, so an emitter can treat every other close of a pending node as its commit.
  - `Emitter` has an optional `close_pending(id, end, kind)`. The parser calls it in place of `close` for an inline delimiter (`*`, `_`, `~~`, `~`, `^`) that reaches the end of its block with no closing delimiter, which it revokes afterwards. An emitter without the method gets `close` as before.
  - Over the wire that close is `["C", id, 1]`. A consumer that reads only the id is unaffected.
  - A paragraph that starts with an html tag or an image is opened pending. When it closes with text of its own, the parser now sends a `commit` for it (`["K", id]` over the wire, the opcode a loose list already sends for its paragraphs). It used to send nothing.
  - `Emitter` has an optional `follow(parser)`, called when a parser is made for it or bound to it. `TreeBuilder` uses it with the new `PFMParser.skip_ids` to keep node ids equal to buffer slots when a plugin adds nodes.

  The wire format documentation covers `K` and the flag on `C`.

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

- [#1135](https://github.com/pngwn/MDsveX/pull/1135) [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4) Thanks [@pngwn](https://github.com/pngwn)! - Footnotes. `[^label]` is a footnote reference and `[^label]: text` at the start of a line is a footnote definition.

  ```md
  A claim[^1], and a second one[^smith].

  [^1]: The source, with a [link](https://example.com).

  [^smith]: Smith, 2020.
  ```

  There are two new node kinds, both with the label as the `label` attribute:
  - `footnote_reference`, a leaf in inline content. It is one by its syntax alone, whether or not a definition exists, so it may come before its definition and the parser never turns it back into text. A label is any characters but whitespace, brackets and `^`.
  - `footnote_definition`, a block that holds one paragraph. It ends a paragraph, as a heading does, and may sit in any container.

  `[^abc]` in prose is now a reference. Escape the bracket, `\[^abc]`, or put it in code. A line `[^a]: b` used to be plain text.

  `footnote_index(buf)` from `@mdsvex/parse/buf-utils` numbers the footnotes of a finished tree by first reference and lists what is wrong: a reference with no definition, a label defined twice, a definition nothing refers to. Nothing throws in a parse. Parse plugins get handlers for both kinds.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - In a plugin's open handler, `node.parent` is the node the author wrote it inside, whatever wrappers a plugin has put there. A child of a node that had a `wrap_inner` wrapper used to see that wrapper as its parent at open. It now sees the wrapper only in its close callback, where `node.parent` is the parent in the tree.

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

- [#1128](https://github.com/pngwn/MDsveX/pull/1128) [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738) Thanks [@pngwn](https://github.com/pngwn)! - A code span wrapped in dollars is inline math: a `# parse, a code span and a `# parse with nothing between them, on one line.

  ```md
  Euler's identity, # parsee^{i\pi} + 1 = 0`$, links five constants.
  ```

  It is a `code_span` node whose `extra` is `1`. It starts at the first dollar and ends after the last, and its value is the LaTeX, raw: a `#!` at its start is no language hint. Anything that does not read the flag shows the LaTeX as inline code.

  A `# parse that does not complete the form is text, as it was, so `$5`, `$x# parse, `` # parsex` `` and ``\# parsex`$`` hold no math. A code span that runs over a line end is not math either.

  For a parse plugin, `node.math` is `true` on such a span and `false` on any other code span. Over the wire the flag is the `extra` of the open op.

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

- [#1029](https://github.com/pngwn/MDsveX/pull/1029) [`fd12ae7`](https://github.com/pngwn/MDsveX/commit/fd12ae7c3e1e32956857388512444940049e955e) Thanks [@pngwn](https://github.com/pngwn)! - `parse_markdown_svelte` tells plugin handlers about the document and returns what they left. It takes a `filename` and a `frontmatter` option, the parser `ctx.frontmatter` is read through, and its result has `warnings` and `data`.

  ```js
  const { nodes, warnings, data } = parse_markdown_svelte(source, {
  	plugins: [toc],
  	filename: '/docs/intro.svx',
  	frontmatter: (text) => yaml.parse(text),
  });
  ```

  The types of the plugin context are exported from the package root: `PluginWarning`, `PluginData`, `PluginDocument`, `DocumentContext`, `NamedDirectiveHandlers`, `DirectiveTable`, `Position` and `Point`.

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

- [#998](https://github.com/pngwn/MDsveX/pull/998) [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096) Thanks [@pngwn](https://github.com/pngwn)! - Each parse plugin gets a context of its own for each document. Plugins used to share one object, so two plugins that kept a key of the same name on `ctx` overwrote each other. A plugin can also have a `name`, and a table of bound handlers can be given with one as `{ name, directives }`.

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

- [#1196](https://github.com/pngwn/MDsveX/pull/1196) [`1c99e72`](https://github.com/pngwn/MDsveX/commit/1c99e72673fe19216a0a809acce122b176364135) Thanks [@pngwn](https://github.com/pngwn)! - Every part of a document has a node whose offsets slice it from the source, which a formatter that prints from the source needs:
  - A link reference definition, `[label]: /url "title"`, is a `definition` node with the attrs `label`, `href` and `title`, from its bracket to the end of its destination or title. Its value range is the label. It renders nothing, the links that use it still carry its url.
  - An element's value range runs from the end of its open tag to the start of its close tag, so `start` to `value_start` is the open tag, over several lines too, and `value_end` to `end` the close tag. A self closing or void element has both at its end.
  - The value range of a link starts after its `[` and that of an image after its `![`, it used to start at 0.
  - The root ends at the length of the source, it used to end one short, and an empty document has a root of `[0, 0]`.

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

- [#1141](https://github.com/pngwn/MDsveX/pull/1141) [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3) Thanks [@pngwn](https://github.com/pngwn)! - The wire format says which characters the author escaped. A `T` opcode whose text starts at a character escaped with a backslash has a fourth field, `["T", id, ":b", 1]`. A client that reads three fields sees no change. `WireTreeBuilder` uses it to keep those characters from the text handler of a plugin, as the batch builder does.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - Parse plugins can group a node with the siblings that follow it. `node.wrap_from(type, attrs?)` puts a new node around the node and sends every later sibling into it, until `close()` is called on the view it returns or the parent closes:

  ```js
  const sectionize = {
  	heading: {
  		parse(node, ctx) {
  			if (node.parent?.type !== 'root') return;
  			ctx.section?.close();
  			ctx.section = node.wrap_from('html', { tag: 'section' });
  		},
  	},
  };
  ```

  Keep the open wrapper on `ctx`, which is new for each document. The node must be the last child of its parent, which the node in an open handler always is. Both methods throw when called from the handler of a pending node, such as an emphasis or a tight list paragraph.

### Patch Changes

- [#1105](https://github.com/pngwn/MDsveX/pull/1105) [`7786d93`](https://github.com/pngwn/MDsveX/commit/7786d9301c06d94895386b5f03b7dc96fb5f2b8e) Thanks [@pngwn](https://github.com/pngwn)! - An autolink has its `href` and its text when it closes, as a link written `[text](url)` does. A parse plugin that reads a link in its close callback used to see neither for `<https://example.com>`, and a node it appended there landed ahead of the link text.

- [#1037](https://github.com/pngwn/MDsveX/pull/1037) [`dadfba9`](https://github.com/pngwn/MDsveX/commit/dadfba96363ab3fc59e65799243651ea7b78195c) Thanks [@pngwn](https://github.com/pngwn)! - A block quote opens inside an HTML element or a component that runs over lines, as headings, lists and fences already did. Its `>` used to be text in a paragraph.

  ```md
  <div>
  > a quote
  </div>
  ```

  The `div` holds a block quote. The quote ends at the first line with no `>`, which here is the close tag.

- [#970](https://github.com/pngwn/MDsveX/pull/970) [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9) Thanks [@pngwn](https://github.com/pngwn)! - An inline HTML element in a block quote can span lines, as it does outside a quote. It ends where the paragraph ends.

  ```markdown
  > some <b>bold
  > text</b>
  ```

  This is one `<b>` element, where the two tags were literal text.

- [#970](https://github.com/pngwn/MDsveX/pull/970) [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9) Thanks [@pngwn](https://github.com/pngwn)! - Link, image or inline directive text in a block quote closes at a `]` that starts a line.

  ```markdown
  > [a
  > ](u)
  ```

  This is a link, where the brackets were literal text.

- [#970](https://github.com/pngwn/MDsveX/pull/970) [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9) Thanks [@pngwn](https://github.com/pngwn)! - In a block quote, emphasis, strikethrough, superscript, subscript, link or image text and inline directive text now end at the lines a paragraph ends at: a nested quote, a fence, the close of a container directive or the next item of a quoted list. The paragraph ends there, the unclosed marker is literal text and the next line is its own block.

  ```markdown
  > \*a
  >
  > > b\*
  ```

  This is a paragraph `*a` and a nested quote holding `b*`, where it was one paragraph with strong text holding `> b`.

- [#941](https://github.com/pngwn/MDsveX/pull/941) [`1c5c5ef`](https://github.com/pngwn/MDsveX/commit/1c5c5ef99483ac86ac52f434fe34b9237c27f12c) Thanks [@pngwn](https://github.com/pngwn)! - When a document is parsed incrementally, content inside a block quote is emitted as it arrives. A quoted line opens as soon as the first character after its `>` marker shows what it is, instead of when its newline arrives. The parsed document is unchanged.

- [#1101](https://github.com/pngwn/MDsveX/pull/1101) [`e42f3f1`](https://github.com/pngwn/MDsveX/commit/e42f3f1d978ab3746f9863da229078f77db85376) Thanks [@pngwn](https://github.com/pngwn)! - A block level element such as `<div>` that starts a line is a block of its own, and what follows its close tag is read as the start of a line. Text there starts a paragraph, where it used to sit bare beside the element.

  ```md
  <div>one</div> two
  ```

  ```html
  <div>one</div>
  <p>two</p>
  ```

  A block level element later in a line no longer takes the `<p>` off its paragraph: `<Badge /> <div>a</div> text` keeps the paragraph, and `<Badge /> <div>a</div>` still has none because it holds only tags.

- [#1121](https://github.com/pngwn/MDsveX/pull/1121) [`2781cbe`](https://github.com/pngwn/MDsveX/commit/2781cbe6b697dd5f2a268de17bc6049b41eca5b6) Thanks [@pngwn](https://github.com/pngwn)! - A `children` handler of a directive, `'*'` included, runs for an element alone on its line however the document is parsed. Fed in pieces, such an element opens inside a paragraph that is taken away when the line ends, and the handler used to miss it, so a plugin saw one set of children for a whole document and another for a streamed one.

  ```js
  const plugin = {
  	box: {
  		children: {
  			html: (node, ctx) => {
  				node.attrs['data-index'] = ctx.index;
  			},
  		},
  	},
  };
  ```

  ```md
  :::box
  <Widget />

  text
  :::
  ```

  `<Widget />` gets its index in both. The handler also runs now for each of several elements on lines of their own with no blank line between them, which a whole parse missed as well.

- [#990](https://github.com/pngwn/MDsveX/pull/990) [`be86761`](https://github.com/pngwn/MDsveX/commit/be867619ed92fb0d7e9ef4294aa88afedc198683) Thanks [@pngwn](https://github.com/pngwn)! - A close tag in a table body cell no longer closes an element opened before the table. It is literal text, as it already was in a header cell, and the row, the table and the element carry on.

  ```md
  <div>

  | h          |
  | ---------- |
  | a </div> b |

  d

  </div>
  ```

  Before, the div ended inside the cell, the rest of the row became a paragraph outside the table and the real `</div>` was shown as text. Now the cell holds `a </div> b` and the div closes at its own close tag.

  A close tag on the line after the last row ends the table and closes the element without leaving an empty row behind. A close tag that ends the last row line, with no pipe after it, still closes the element, as it does at the end of a list item or a heading.

- [#989](https://github.com/pngwn/MDsveX/pull/989) [`354ab3c`](https://github.com/pngwn/MDsveX/commit/354ab3c6d672de2c8d5aa40e1e9d3da5ed4ae592) Thanks [@pngwn](https://github.com/pngwn)! - A subscript that ends just before a doubled tilde is now read the same wherever its line ends. `~{x}~~` was a subscript in a paragraph and in a table body cell with a space before the closing pipe, but literal text in a header cell, in a body cell with no space before the pipe, and as the last thing in the document. All of them now give a subscript around the expression followed by a literal `~`. It needed something other than plain text inside the subscript: an expression, a link or an element.

  A `~~` with nothing after it on its line no longer opens a strikethrough, so the end of the document and the pipe that ends a table cell behave like the end of a line. A trailing `~~` is now two text nodes of one tilde each in every position, where the end of the document and an unpadded cell gave one node of two. What it renders does not change.

- [#936](https://github.com/pngwn/MDsveX/pull/936) [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27) Thanks [@pngwn](https://github.com/pngwn)! - A `wrap_inner` called from a plugin's close callback on a node that is still open, such as the parent, takes that node's later children. They used to land beside the wrapper.

- [#1099](https://github.com/pngwn/MDsveX/pull/1099) [`d4bbd4d`](https://github.com/pngwn/MDsveX/commit/d4bbd4dfb193cb5f6bbf10ed9444bf343c58590d) Thanks [@pngwn](https://github.com/pngwn)! - A close tag whose `>` stands on the next line closes its element, as an open tag split over lines already opens one. This is how prettier writes an inline element when it may not add a space.

  ```md
  From <a href="/projects"

  > the projects page</a
  > . More text.
  ```

  The paragraph holds the link and the text `. More text.`. The `>` line used to start a block quote, and the link was left as literal text.

- [#950](https://github.com/pngwn/MDsveX/pull/950) [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2) Thanks [@pngwn](https://github.com/pngwn)! - A parse plugin that changes an emphasis, a link, an inline html element or another node the parser opens before it knows the node will stay no longer slows down the rest of the document. What the plugin did to such a node was kept in case of a revoke until the document ended, and every later node close went through the plugin dispatcher because of it. It is now dropped when the node closes, unless the parser still decides on the node.

- [#1094](https://github.com/pngwn/MDsveX/pull/1094) [`b214e6e`](https://github.com/pngwn/MDsveX/commit/b214e6e2f9596b9619b4e9d2bc43f9277c5d5395) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block closes only at a line of backticks with nothing but spaces or tabs after them, as in CommonMark. A line such as ` ``` b ` or ` ```js ` inside a fence is a line of code. It used to close the fence, and the text after the backticks was dropped from the output.

- [#1031](https://github.com/pngwn/MDsveX/pull/1031) [`7524ce7`](https://github.com/pngwn/MDsveX/commit/7524ce7de4cbdfd545c455fb8d1643031306b303) Thanks [@pngwn](https://github.com/pngwn)! - The indent of a continuation line is not code when a code span runs over it, as it is not text outside one. This holds in a paragraph, a list item and a block quote.

  ```md
  - x `a
  b`
  ```

  The code is `a`, a line end and `b`. It used to keep the two spaces that put the line inside the item.

- [#1096](https://github.com/pngwn/MDsveX/pull/1096) [`8e11a68`](https://github.com/pngwn/MDsveX/commit/8e11a689e5e00d92dd66ac92ea2f5f34be5963a1) Thanks [@pngwn](https://github.com/pngwn)! - A code span that holds only spaces keeps all of them, as in CommonMark. A span of three or more spaces used to lose one on each side as padding, so three spaces became one.

- [#1007](https://github.com/pngwn/MDsveX/pull/1007) [`ddf0d00`](https://github.com/pngwn/MDsveX/commit/ddf0d00c8313d9d314c71ad8592d6df7bc8f44ff) Thanks [@pngwn](https://github.com/pngwn)! - A code span ends where its paragraph ends outside a block quote too: at a heading, a thematic break, a fence, a list item, a block level tag, a svelte block boundary, a block directive or the close of a container directive. Its backticks are then literal text, as an unclosed `*` or `[` already is.

  ```md
  x `a

  # b`
  ```

  is a paragraph and a heading, where it was one paragraph holding a code span over both lines. A heading no longer takes the line after it into a code span it left open.

- [#1102](https://github.com/pngwn/MDsveX/pull/1102) [`ef131ac`](https://github.com/pngwn/MDsveX/commit/ef131aca6ad93a6803d18b43ce919089fd0039c6) Thanks [@pngwn](https://github.com/pngwn)! - A comment with text after it on its line is in the paragraph of that text, in every container, as it already was in a table cell. At the top of a document and in the other containers the comment used to be a block of its own, with the text in a paragraph after it.

  ```md
  <!-- note --> some text
  ```

  ```html
  <p>
  	<!-- note -->
  	some text
  </p>
  ```

  A comment alone on its line is still a block with no paragraph, and the line after it starts a block of its own.

- [#977](https://github.com/pngwn/MDsveX/pull/977) [`3bdc62e`](https://github.com/pngwn/MDsveX/commit/3bdc62eb6bd0ed4110d3af9b3485934ea996c19f) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed `*`, `_`, `~`, `^` or `[` inside an html element, a svelte block or a container directive now becomes literal text when its paragraph ends, as it does outside one. Before, it stayed open until a later list item or the end of the document.

  A streamed parse and a whole parse could split that text into different nodes. With a list after the paragraph whose first line closes the element, a whole parse gave `x `, `~`, `z `, `**w` and a streamed one `x `, `~`, `z `, `*`, `*w`:

  ```md
  <div>
  x ~z **w
  - a</div>
  ```

  Both now give the second, which is also what the same paragraph gives outside the element. The rendered output does not change.

  For a plugin, the delimiter is now revoked before its container closes. A bound handler's writes to `ctx.state` for it are undone before the close callback of the directive reads the state, so a count kept there no longer includes it. An html tag that never closes is still revoked after the container.

- [#1005](https://github.com/pngwn/MDsveX/pull/1005) [`c1ccbfd`](https://github.com/pngwn/MDsveX/commit/c1ccbfdc7fc7cc7e63587bedd7d4287932462d50) Thanks [@pngwn](https://github.com/pngwn)! - The indent of a continuation line is no longer part of its text in a list item or a block quote, as in a paragraph. `- a` followed by `  b` gives the text `b`, not `  b`, and a node that starts the line has no text node of spaces before it.

- [#1224](https://github.com/pngwn/MDsveX/pull/1224) [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114) Thanks [@pngwn](https://github.com/pngwn)! - The type declarations write `.js` on their relative imports, so they resolve under `moduleResolution: node16` and `nodenext` as well as `bundler`. A project on `node16` or `nodenext` used to get TS2834 errors from inside the packages, or with `skipLibCheck` on, `any` where the types should be.

- [#1074](https://github.com/pngwn/MDsveX/pull/1074) [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474) Thanks [@pngwn](https://github.com/pngwn)! - A link reference definition inside a block quote is read as a definition. It is written on one line there.

  ```md
  > [docs]: /docs

  See the [guide][docs].
  ```

- [#1069](https://github.com/pngwn/MDsveX/pull/1069) [`b73e460`](https://github.com/pngwn/MDsveX/commit/b73e4606a005f2093a90ac025cfe089e44c9a373) Thanks [@pngwn](https://github.com/pngwn)! - A link reference definition inside an HTML element is read as a definition, as it is at the top of a document.

  ```md
  <div>

  [docs]: /docs

  See the [guide][docs].

  </div>
  ```

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914) Thanks [@github-actions](https://github.com/apps/github-actions)! - A link reference definition inside a list item is read as a definition. It is written on one line there, as in a block quote.

- [#1149](https://github.com/pngwn/MDsveX/pull/1149) [`e16f89c`](https://github.com/pngwn/MDsveX/commit/e16f89c492542663079c4741d54727084f46b188) Thanks [@pngwn](https://github.com/pngwn)! - A link reference definition keeps working when the line after it starts like a title but goes on with text, as in CommonMark. The definition has no title and the line is a paragraph. The whole definition used to be dropped, so every link that used it was plain text.

  ```md
  [foo]: /url
  "title" ok

  [x][foo]
  ```

  `[x][foo]` is now a link to `/url`, and `"title" ok` is a paragraph.

- [#1119](https://github.com/pngwn/MDsveX/pull/1119) [`aa0a892`](https://github.com/pngwn/MDsveX/commit/aa0a89224d5781fba95fef0102d7b288af18a0d0) Thanks [@pngwn](https://github.com/pngwn)! - The title of a link reference definition written in parentheses may hold a `(` only when it is escaped, as in CommonMark. A line whose title holds a bare `(` is no definition, so it can no longer run on to a `)` on the next line and take that line with it.

  ```md
  [r]: /u '"t"
  1. a [b](/c "d"'
  ```

  The first line is a paragraph and the second a list item.

- [#1197](https://github.com/pngwn/MDsveX/pull/1197) [`69fe42e`](https://github.com/pngwn/MDsveX/commit/69fe42eb47883e7029530bf576c2fe09acb00628) Thanks [@pngwn](https://github.com/pngwn)! - A backslash before a space or a line end in a link destination is a literal backslash, and the destination ends after it. `[a]: /u\` at the end of a line defines `/u\` and leaves the next line alone, where it used to put the line end into the url and read the next line as more of it. The same definition in a block quote now works, an angle destination no longer runs over a line end, and an inline link `[x](/u\` with its `)` on the next line is text, as it is without the backslash.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - A plugin that gives a directive node `args` that are not strings gets a `TypeError` where it sets them, in the `attrs` of `wrap_inner`, `prepend`, `append` or `wrap_from`, or in `node.attrs.args = ...`. Such a node used to fail later in the renderer, or render with the args ignored.

- [#1067](https://github.com/pngwn/MDsveX/pull/1067) [`1b328e7`](https://github.com/pngwn/MDsveX/commit/1b328e7130927ac495f3d969d3d4f7f7b876c28d) Thanks [@pngwn](https://github.com/pngwn)! - A container directive holds the same blocks as the document. A Svelte block opens inside one, a line that holds only a comment or a `{@tag}` is no longer wrapped in a paragraph, and a line that starts with an autolink such as `<MAILTO:a@b.c>` is a link.

  ```md
  :::box
  {#if a}
  b
  {/if}

  <!-- note -->

  :::
  ```

- [#931](https://github.com/pngwn/MDsveX/pull/931) [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9) Thanks [@pngwn](https://github.com/pngwn)! - A doubled `**` or `__` opens two nested nodes before punctuation, a link, a code span or an expression, as it does before a letter. The outer pair is no longer left as literal text.

  ```md
  **(x)**, **[a](b)**, **`code`** and **"quoted"**
  ```

- [#931](https://github.com/pngwn/MDsveX/pull/931) [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9) Thanks [@pngwn](https://github.com/pngwn)! - A doubled `~~~~` nests two strikethroughs before punctuation, a link or a code span, as it does before a letter, and tildes with nothing between them stay literal text. Neither produces an empty strikethrough any more.

  ````md
  ```(x)~~~~ and a ~~~~ b

  ```
  ````

  ```

  ```

- [#1012](https://github.com/pngwn/MDsveX/pull/1012) [`3343943`](https://github.com/pngwn/MDsveX/commit/3343943f3907da8ce45488c2da3d78023bd68851) Thanks [@pngwn](https://github.com/pngwn)! - A leaf or container directive opens inside an html element, as it does at the root and in a block quote.

  ```md
  <div>

  :::note[]
  a
  :::

  </div>
  ```

  The div holds a `note` directive with the paragraph `a`. Before, the opening line was text and an inline directive, and the closing `:::` a paragraph. A container left open in the element ends at the element's close tag.

- [#1036](https://github.com/pngwn/MDsveX/pull/1036) [`0785cb7`](https://github.com/pngwn/MDsveX/commit/0785cb7950a81839e7dde22104f3f0bd704e0a29) Thanks [@pngwn](https://github.com/pngwn)! - An HTML element or a component that runs over lines opens inside a container directive, as it does everywhere else. Its tags used to be text in paragraphs.

  ```md
  :::note

  <div>
  a
  </div>
  :::
  ```

  The directive holds a `div` that holds the paragraph `a`. An element left open in a directive ends at the closing `:::` and its open tag is text, so it can not take the lines after the directive.

- [#1156](https://github.com/pngwn/MDsveX/pull/1156) [`c9a977a`](https://github.com/pngwn/MDsveX/commit/c9a977ad3dadd981ca7f8c66104fd38435306408) Thanks [@pngwn](https://github.com/pngwn)! - Lists parse faster. A list item that follows another, the common line of a list, is recognised in one step, which takes a document of list items from about 15% slower than it was before the parser was restructured to a little faster than it was then.

- [#959](https://github.com/pngwn/MDsveX/pull/959) [`9dd0099`](https://github.com/pngwn/MDsveX/commit/9dd00997dfafb1be89f0ee220269722eed83a535) Thanks [@pngwn](https://github.com/pngwn)! - Streamed output now matches the final output for HTML, components and `{@...}` tags at the start of a line. Feeding these in chunks built a different tree from parsing them whole:
  - An element holding a lone backtick before another block, as in the input below, was wrapped in a `<p>` when fed.
  - Spaces after a tag that is alone on its line were kept when fed and dropped when parsed whole. They are now kept in both, as they already were after a row of tags.
  - `> {@html x}` fed a character at a time was wrapped in a `<p>`.

  ```md
  ## <b>`</b>
  ```

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6) Thanks [@github-actions](https://github.com/apps/github-actions)! - A fence that is left open in a block quote or a list item ends where the quote or the item ends, as a fence left open in a document ends with the document. In a block quote it used to turn into a paragraph.

  ````md
  > ```
  > code
  > after the quote
  > ```
  ````

- [#1201](https://github.com/pngwn/MDsveX/pull/1201) [`10b2e4d`](https://github.com/pngwn/MDsveX/commit/10b2e4dd55f90c125fcc54765eac1a22cb9816d8) Thanks [@pngwn](https://github.com/pngwn)! - The indent of a fenced code block is no longer part of its code. Each line loses up to as many columns of leading whitespace as the opening fence is indented past where its container's content starts, as in CommonMark, so a fence indented as a whole at the top of a document or inside an HTML element, a Svelte block or a directive holds the same code as it does unindented. The rendered code, the highlighter, live code and the source map all read the trimmed code, and the source map points each line of it at its own source line.

- [#1032](https://github.com/pngwn/MDsveX/pull/1032) [`6a4c139`](https://github.com/pngwn/MDsveX/commit/6a4c1394d30e1b5c87ca63e96b3be6d5dfa10667) Thanks [@pngwn](https://github.com/pngwn)! - A line written as a footnote definition is no longer read as a link reference definition. `[^note]: Word` used to vanish from the output, because one word after the colon made it a definition for the label `^note`. It is now a paragraph with the text as written, as `[^note]: two words` already was, and a link reference label can not start with `^`.

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

- [#965](https://github.com/pngwn/MDsveX/pull/965) [`b14fe53`](https://github.com/pngwn/MDsveX/commit/b14fe5315d014096fb4e7d1d0c45152ee3eb3e0e) Thanks [@pngwn](https://github.com/pngwn)! - A backslash at the end of a line is a hard break only when the next line carries on the same paragraph. Before a blank line, a line that starts another block, or the end of the input it is a literal backslash, and the next line is parsed as its own block. A backslash at the end of a heading or a table row is literal too.

  ```markdown
  a\

  b
  ```

  This is two paragraphs, `a\` and `b`.

- [#1117](https://github.com/pngwn/MDsveX/pull/1117) [`58ca71c`](https://github.com/pngwn/MDsveX/commit/58ca71c76191f67c8215441f582f893e2cb7cdf6) Thanks [@pngwn](https://github.com/pngwn)! - A tag, a comment or a Svelte expression in a heading ends on the heading's line, as it does in a table row. One that is still open at the end of the line is literal text, and the next line is a block of its own.

  ```md
  # a <!--

  --> b
  ```

  The heading is `a <!--` and `--> b` is a paragraph. They used to be one heading over two lines.

- [#1189](https://github.com/pngwn/MDsveX/pull/1189) [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0) Thanks [@pngwn](https://github.com/pngwn)! - A heading is settled when it closes. An element, an emphasis or a link in it that never closed is text before the close callbacks of the heading run, where before it turned into text after them, and inside a container directive only once the container closed. So `node.text_content` in the close callback of `## The <head> element` holds `<head>`.

- [#1034](https://github.com/pngwn/MDsveX/pull/1034) [`37b0c66`](https://github.com/pngwn/MDsveX/commit/37b0c66b69197772f14722391d2affdd20295ff8) Thanks [@pngwn](https://github.com/pngwn)! - `node.text_content` of a heading is the text a reader sees, as it is for every other node. In a plugin run by `compile` or `parse_markdown_svelte` it used to be the source of the heading as written, markup included, and the flattened text only when the document was streamed.

  ```js
  // ## Two *words* and `code`
  node.text_content; // before: 'Two *words* and `code`', after: 'Two words and code'
  ```

- [#966](https://github.com/pngwn/MDsveX/pull/966) [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637) Thanks [@pngwn](https://github.com/pngwn)! - A heading that ends in a space or tab after an inline node, as in `# *a* ` or ``# `a` ``, no longer gets an empty text node at its end.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6) Thanks [@github-actions](https://github.com/apps/github-actions)! - An HTML element opens inside a block quote and a list item and holds blocks there, as it does at the top of a document. A line that leaves the quote or the item ends an element that was left open.

  ```md
  > <div>
  >
  > # a heading in the div
  >
  > </div>

  - <details>
    text
    </details>
  ```

- [#1103](https://github.com/pngwn/MDsveX/pull/1103) [`4efb7c1`](https://github.com/pngwn/MDsveX/commit/4efb7c130ebc6095fd9ead7a41cf043ffc1ef9c2) Thanks [@pngwn](https://github.com/pngwn)! - An inline element such as `<b>`, `<span>` or `<a>` that starts a line with content after its open tag starts a paragraph, also when it closes on a later line. It used to be read as a block there, so the text after its close tag was cut off into a paragraph of its own.

  ```md
  <b>bold over
  two lines</b> and text
  ```

  ```html
  <p><b>bold over two lines</b> and text</p>
  ```

  An element whose open tag ends its line still holds its lines as before, and so does a component or a block level element that stays open past its line.

- [#953](https://github.com/pngwn/MDsveX/pull/953) [`b966a44`](https://github.com/pngwn/MDsveX/commit/b966a447d4d32ee1868dc3a13653129b68f25235) Thanks [@pngwn](https://github.com/pngwn)! - The line after a leaf directive in a block quote or a list item is read as the line after any other block there. A quoted line no longer opens a nested block quote, and an unmarked or unindented line ends the quote or the list instead of joining it.

- [#961](https://github.com/pngwn/MDsveX/pull/961) [`911857b`](https://github.com/pngwn/MDsveX/commit/911857b811121fc1ca09f5e8effb21b7f937174a) Thanks [@pngwn](https://github.com/pngwn)! - An element at the start of a line whose close tag is not a real close tag now keeps its text in one paragraph. This is the case when the close tag is escaped, sits in a code span, a `<script>`, an expression, a comment or an attribute, or is malformed like `</b foo>`. The open tag is then literal text, so the line is a paragraph with a `<p>`, as it already was when the element came after other text.

  Before, the text after the open tag was left outside any paragraph, and streamed output could differ from the final output.

  ```md
  <b>\</b>
  ```

  This renders `<p>&lt;b&gt;&lt;/b&gt;</p>`. It used to render `<p>&lt;b&gt;</p>&lt;/b&gt;`.

  An element like `<b>\</b> x </b>`, which closes at a later close tag and has no text after it, no longer gets a `<p>`.

- [#1097](https://github.com/pngwn/MDsveX/pull/1097) [`9277618`](https://github.com/pngwn/MDsveX/commit/9277618c8e1e4a7278245a84c7210514cc55e834) Thanks [@pngwn](https://github.com/pngwn)! - A backslash escape in a link destination or a link title gives the character alone, as it does in link text. It works in inline links, images and link reference definitions.

  ```md
  [a](</u)b> 't " u')
  ```

  The link's `href` is `/u)b` and its `title` is `t " u`. Both used to keep the backslashes. An escaped brace (`\{`, `\}`) is a literal brace in the rendered attribute, where a bare one is a Svelte expression.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914) Thanks [@github-actions](https://github.com/apps/github-actions)! - A list item ends what it holds. A line that is not indented to the item ends a container directive or a Svelte block left open in it, and the line after a fence or a thematic break in an item is outside the item unless it is indented. A paragraph right under the item still continues onto a line that is not indented.

  ```md
  - :::note
    inside the directive
    outside the list
  ```

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914) Thanks [@github-actions](https://github.com/apps/github-actions)! - A list item holds the same blocks as the document. A Svelte block opens inside one, a line that holds only a comment, a component or a `{@tag}` has no paragraph around it, and a thematic break indented to the item is inside the item.

  ```md
  - {#if show}
    text
    {/if}
  - ## above
    below
  ```

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914) Thanks [@github-actions](https://github.com/apps/github-actions)! - A list marker right after a list marker opens a list inside the item. `- - a` is a list in a list item, where it used to be an empty item followed by a second item.

- [#1008](https://github.com/pngwn/MDsveX/pull/1008) [`6272e0d`](https://github.com/pngwn/MDsveX/commit/6272e0db220788f80f05463531a0ea0e1358ff0e) Thanks [@pngwn](https://github.com/pngwn)! - A `|` next to a `_`, `*` or `~` that stays literal text is text too. It is the intraword marker, and not rendered, only directly before a mark that opens and directly after one that closes.

  ```md
  x |\* y
  a\_|b
  fan|\_tas tic
  ```

  rendered `x * y`, `a_b` and `fan_tas tic` and now renders as written. `fan|_tas_|tic` is still `fan<em>tas</em>tic`.

  For a plugin, a node opened after a marker pipe starts at the pipe.

- [#923](https://github.com/pngwn/MDsveX/pull/923) [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41) Thanks [@pngwn](https://github.com/pngwn)! - An import statement can span several lines, `import {` runs until its braces close.

- [#1006](https://github.com/pngwn/MDsveX/pull/1006) [`b361600`](https://github.com/pngwn/MDsveX/commit/b361600c167cf1d53094cb2e1309768b4c8316e0) Thanks [@pngwn](https://github.com/pngwn)! - A code span padded with a space on each side loses that padding when it runs over a line, as it does on one line. `` ` a `` followed by `` b ` `` holds the code `a`, a line end and `b`, in and out of a block quote.

- [#958](https://github.com/pngwn/MDsveX/pull/958) [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002) Thanks [@pngwn](https://github.com/pngwn)! - A table cell no longer ends with an empty text node when padding follows an element, a code span, a link, an expression or a directive, as in `| <b>c</b> | d |`. Rendered output was not affected, but a parse plugin saw the empty node as the last child of the cell and its `text` handler ran for it. A tree built from the wire format never had it.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea) Thanks [@github-actions](https://github.com/apps/github-actions)! - A NUL character in a document is ordinary text, and the rest of the document parses as it would without it. It used to stop the parse there, so everything after it was missing from the output.

- [#1030](https://github.com/pngwn/MDsveX/pull/1030) [`2749b28`](https://github.com/pngwn/MDsveX/commit/2749b28e8d5f1e75e663a8485b521472020be143) Thanks [@pngwn](https://github.com/pngwn)! - Backticks around one space are a code span holding that space, as two spaces already were. ``a ` ` b`` used to leave both backticks as text, and a later backtick on the line closed the span instead.

- [#1118](https://github.com/pngwn/MDsveX/pull/1118) [`503a007`](https://github.com/pngwn/MDsveX/commit/503a007371d8cd60a4f7b2fec74c89c476196c39) Thanks [@pngwn](https://github.com/pngwn)! - An open tag split over lines in a block quote or a list item reads its attributes past the `>` marker and the indent of each line. The marker of the second line used to pass for the bracket that closes the tag.

  ```md
  > a <b
  > id="u">x</b> y
  ```

  The element has its `id`. A blank line, or a line that leaves the quote or the list item, now ends an open tag, so text such as `a <b` can no longer take in the paragraphs after it. A blank line inside an attribute expression is still part of the expression.

- [#956](https://github.com/pngwn/MDsveX/pull/956) [`78c552f`](https://github.com/pngwn/MDsveX/commit/78c552f8951c9186ec5b33934477d31e6028b627) Thanks [@pngwn](https://github.com/pngwn)! - A parse plugin that keeps a wrapper open no longer slows down the rest of the document. While a `wrap_from` wrapper was open (a section from one heading to the next, a step inside a steps directive), or a `wrap_inner` wrapper of a node that was still open, every node went through the plugin dispatcher on its way into the tree. Now only the direct children of the wrapped node do. The same holds inside a container directive with bound handlers. On a set of 20 real documents a parse with a plugin that wraps each heading and what follows it in a section took about 13% less time. The tree is unchanged.

  For a builder of your own, `PluginDispatcher.open_wants` now holds a parent index per node kind where it held a flag, and `PluginDispatcher.wants_open` is gone.

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The packages hold only what they run. Tests, fixtures, build config and intermediate build output are no longer published, which takes `@mdsvex/parse` from 2,337 files to 28.

- [#963](https://github.com/pngwn/MDsveX/pull/963) [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148) Thanks [@pngwn](https://github.com/pngwn)! - A single backtick in a two backtick code span that starts with a space no longer hides the character after it. A span like this with no closer now stops at the end of its table cell, at a blank line or at the end of the input, and its backticks are text.

  ```md
  | ``a` |
  | ---- |
  ```

  The cell holds its text as written, in header and body rows alike. A span that does close after such a backtick loses its padding spaces: ``` `` a ` `` ``` is the code ``a ` ``.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea) Thanks [@github-actions](https://github.com/apps/github-actions)! - A parse that stops moving through its input throws a `ParseStallError` with the `offset` it stopped at. It used to log `Infinite loop detected` and hand back a tree cut short at that point.

- [#1115](https://github.com/pngwn/MDsveX/pull/1115) [`89bf377`](https://github.com/pngwn/MDsveX/commit/89bf3776a22003ab42517b9b8a542507fce6f03b) Thanks [@pngwn](https://github.com/pngwn)! - The notes the parser keeps of where info strings are can be searched for two keys at once, which is how mdsvex finds `src=` and `run` without looking through every document.

- [#949](https://github.com/pngwn/MDsveX/pull/949) [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0) Thanks [@pngwn](https://github.com/pngwn)! - The parser notes when a document holds an image. mdsvex reads the note to import relative images without looking through every document for one.

- [#1042](https://github.com/pngwn/MDsveX/pull/1042) [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d) Thanks [@pngwn](https://github.com/pngwn)! - The parser notes where the info strings of a document's fences are. mdsvex reads the notes to find `src=` without looking through every document for one.

- [#950](https://github.com/pngwn/MDsveX/pull/950) [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2) Thanks [@pngwn](https://github.com/pngwn)! - With parse plugins, a node close that no plugin has anything for no longer goes through the plugin dispatcher, and a leaf node of a type no plugin handles is built in one step even while a `wrap_from` wrapper or a directive with bound handlers is open. Every close used to take a slower path as soon as a document had any plugin.

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

- [#950](https://github.com/pngwn/MDsveX/pull/950) [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2) Thanks [@pngwn](https://github.com/pngwn)! - A document parses faster when a parse plugin adds nodes with `wrap_inner`, `prepend`, `append` or `wrap_from`. The first added node used to put every later node of the document on a slower path in `TreeBuilder`. The tree is unchanged.

  This holds when the parser emits straight into the builder, as `parse_markdown_svelte` and `new PFMParser(new TreeBuilder(...))` do. With an emitter of your own between the two, the builder still falls back to the slower path once a plugin adds a node.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6) Thanks [@github-actions](https://github.com/apps/github-actions)! - The code of a fence, the text of a comment and the content of `<script>` and `<style>` no longer hold the `>` markers or the list indent of the lines they run over. A fence in a list item renders without the indent of the item in its code.

  ````md
  - ```js
    const a = 1;
    ```
  ````

  The code is `const a = 1;`, where it used to keep the two spaces before it. The parser stores this text on the node, and the node's value range still covers the source as written.

- [#991](https://github.com/pngwn/MDsveX/pull/991) [`2ecbf3d`](https://github.com/pngwn/MDsveX/commit/2ecbf3db4d5eb9a1d3fd01c041a3261eaa76a10c) Thanks [@pngwn](https://github.com/pngwn)! - A code span that runs over a line in a block quote no longer keeps the `>` of the next line in its code.

  ```md
  > x `a
  b` c
  ```

  rendered `<code>a &gt; b</code>` and now renders `<code>a b</code>`, as the same span does outside a quote.

  A code span in a block quote also ends where its paragraph ends: at a line with no marker, a marked blank line, a nested quote, a heading, a thematic break, a fence, the close of a container directive and a list item in a quoted list. Its backticks are then literal text, as an unclosed `*` or `[` already is. Before, the span ran on over those lines, so ``> `a`` then `` > > b` `` was one code span and no nested quote.

  For a plugin, the node's value range still covers the source as written and its text is the code without the markers.

- [#1073](https://github.com/pngwn/MDsveX/pull/1073) [`604ea57`](https://github.com/pngwn/MDsveX/commit/604ea571b652d236951b98be5be49296dbfcc0f4) Thanks [@pngwn](https://github.com/pngwn)! - A `>` at the left margin no longer continues a block quote that sits inside a list item. The line is outside the item, so it ends the list and starts a new quote.

  ```md
  - > inside the item
    > a new quote after the list
  ```

- [#993](https://github.com/pngwn/MDsveX/pull/993) [`d313802`](https://github.com/pngwn/MDsveX/commit/d31380241a1c9e096da42261a6025b6ff8b57521) Thanks [@pngwn](https://github.com/pngwn)! - A list item now ends a paragraph in a block quote, as it does everywhere else.

  ```md
  > x
  >
  > - a
  ```

  rendered one paragraph, `x` and `- a` with a line break between them, and now renders a paragraph and a list. The rule is the one a paragraph outside a quote follows: a bullet or `1.` with text after it starts a list, another number or a marker with nothing after it does not. Before, a list in a quote needed a blank `>` line before it.

- [#1009](https://github.com/pngwn/MDsveX/pull/1009) [`8882b5a`](https://github.com/pngwn/MDsveX/commit/8882b5af6820661b4eecff452b88fb4b8d7815b8) Thanks [@pngwn](https://github.com/pngwn)! - After a list item in a block quote that holds a thematic break, the `>` of the next line is the quote's own marker again. It was read as a nested block quote inside the item.

  ```md
  > - ***
  >
  > * a
  ```

  is a quote holding two lists, as the same lines are outside a quote.

- [#1074](https://github.com/pngwn/MDsveX/pull/1074) [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474) Thanks [@pngwn](https://github.com/pngwn)! - A paragraph in a block quote ends at the same lines as a paragraph outside one. A directive, a block level HTML tag and a Svelte block now end it, and so does a fence under the paragraph of a list item.

  ```md
  > text
  > ::toc
  ```

  The directive is no longer text of the paragraph. A line of only a tag or a comment in a container directive inside a block quote also loses its paragraph, as it does outside a quote.

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

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed html tag inside a wrapper a parse plugin made becomes a paragraph of its literal text, as it does without the wrapper. Inside a blockquote whose content a plugin had wrapped it became bare text.

- [#958](https://github.com/pngwn/MDsveX/pull/958) [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002) Thanks [@pngwn](https://github.com/pngwn)! - A tag or an inline directive that is never closed becomes text without the attributes of the node it started as. The text node kept the `tag` and `attributes` of the tag, or the `name` of the directive, in a paragraph, a heading, a list item and a table cell, and a parse plugin read them through `attrs` on what was only text. It now keeps nothing, which also drops anything a plugin wrote on the node before the parser gave up on it.

- [#1098](https://github.com/pngwn/MDsveX/pull/1098) [`4f1821d`](https://github.com/pngwn/MDsveX/commit/4f1821d6b94839b70904d63df154534cd0d44c4b) Thanks [@pngwn](https://github.com/pngwn)! - A tag that writes the same attribute twice keeps the first value in `attributes`, as HTML does, and every later one in a new `repeated` list on the node, in source order. The last value used to replace the first, which was then in the tree nowhere.

  ```md
  <img alt=first alt="">
  ```

  ```js
  { tag: 'img', attributes: { alt: 'first' }, repeated: [['alt', '']], self_closing: true }
  ```

- [#936](https://github.com/pngwn/MDsveX/pull/936) [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27) Thanks [@pngwn](https://github.com/pngwn)! - `CompilerSession` and the vite plugin keep their tree, plugin dispatcher and renderer from one document to the next when parse plugins are configured, as they already did without plugins. They are rebuilt when `parse_plugins` is a different array, so pass a new array to change the plugins.

  A plugin that keeps a `NodeView` after its document has compiled now gets an error when it uses the view once the next document has started. It would otherwise read and write the nodes of that document. `TreeBuilder.reset()` works on a builder with plugins, and resets its dispatcher.

- [#958](https://github.com/pngwn/MDsveX/pull/958) [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002) Thanks [@pngwn](https://github.com/pngwn)! - A `[`, `![` or `:name[` that turns out not to be a link, an image or a directive stays with the text around it when it follows an HTML tag that is never closed. `<span>[a] b` put the bracket in a paragraph of its own and rendered `<p>[a</p>] b` after the tag. The opcode stream and the wire format now revoke such a node once, where the parser sent a second revoke when its block ended.

- [#936](https://github.com/pngwn/MDsveX/pull/936) [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27) Thanks [@pngwn](https://github.com/pngwn)! - What a plugin did to a node survives when an ancestor of that node is revoked. In `_a *b* c` the unclosed `_` is revoked and the `*b*` inside it stays, and it now keeps the attrs and nodes a plugin gave it and still fires its close callbacks.

- [#1104](https://github.com/pngwn/MDsveX/pull/1104) [`a87bf30`](https://github.com/pngwn/MDsveX/commit/a87bf30a4ce04fba3ff18366b9b808b6338fd598) Thanks [@pngwn](https://github.com/pngwn)! - A component that closes on the line it opens on is inline in a paragraph also when it holds a self closing tag of its own name, or its own name in a code span. Such a line used to be read as a block that runs over lines, which cut the text after the close tag off into a paragraph of its own.

  ```md
  <Badge><Badge /></Badge> new today
  ```

  ```html
  <p>
  	<Badge><Badge /></Badge> new today
  </p>
  ```

- [#1068](https://github.com/pngwn/MDsveX/pull/1068) [`9dc77cf`](https://github.com/pngwn/MDsveX/commit/9dc77cf82fc9180fc2d2ca57fa4866b83141750d) Thanks [@pngwn](https://github.com/pngwn)! - A line that holds only an HTML comment inside a Svelte block is a comment with no paragraph around it, as it is at the top of a document.

- [#1074](https://github.com/pngwn/MDsveX/pull/1074) [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474) Thanks [@pngwn](https://github.com/pngwn)! - A Svelte block opens inside a block quote, and inside a container directive that is in one. It ends with the quote when it is left open.

  ```md
  > {#if show}
  > text
  > {/if}
  ```

- [#1035](https://github.com/pngwn/MDsveX/pull/1035) [`cc819e4`](https://github.com/pngwn/MDsveX/commit/cc819e40ae16f4c13ab164328ea3eee94f47446a) Thanks [@pngwn](https://github.com/pngwn)! - A container directive left open in a `{#if}` style block no longer stops the block from closing. The directive ends at the `{:else}` or `{/if}` of the block it was opened in, as it ends with the document, and what follows the block is outside both.

  ```md
  {#if x}
  :::note
  a
  {/if}

  after
  ```

  `after` is a paragraph of the document. It used to be inside the directive with the `{/if}` read as an expression.

- [#1010](https://github.com/pngwn/MDsveX/pull/1010) [`680e26f`](https://github.com/pngwn/MDsveX/commit/680e26f83eba5b0d2a74c44d24ca022ea3d699b3) Thanks [@pngwn](https://github.com/pngwn)! - A close tag on its own line for an element that holds a svelte block left open no longer leaves an empty paragraph in the block.

  ```md
  <div>
  {#if x}
  </div>
  ```

  The `</div>` closes the block and the element, and the branch holds no paragraph.

- [#1011](https://github.com/pngwn/MDsveX/pull/1011) [`707e616`](https://github.com/pngwn/MDsveX/commit/707e616f8672e51966ffcbd08bc8beb994910262) Thanks [@pngwn](https://github.com/pngwn)! - An element left open in a svelte block no longer stops the block from closing. Its open tag is literal text in a paragraph of the branch, and the next `{:else}` or `{/if}` is the block's own.

  ```md
  {#if x}
  <n>
  {/if}

  after
  ```

  The block ends at `{/if}` and `after` is a paragraph outside it. Before, `{/if}` was read as an expression and the rest of the document stayed inside the block.

- [#1148](https://github.com/pngwn/MDsveX/pull/1148) [`f3ee7ec`](https://github.com/pngwn/MDsveX/commit/f3ee7ecb9ac2f3b9711631776b3cabd0bc757924) Thanks [@pngwn](https://github.com/pngwn)! - The close token of a Svelte block only closes the block it is named for. `{/each}` used to close an `{#if}` block, and the name it was written with was dropped, so a document with mismatched blocks compiled. A close token of another name now closes nothing and stays in the output as written, where Svelte reports it at its position.

  ```md
  {#if ready}
  {#each items as item}
  {item}
  {/if}
  {/each}
  ```

  This is now an error from Svelte at `{/if}`. It used to compile, with `{/if}` closing the `each` and `{/each}` closing the `if`.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - Nodes made by a parse plugin are flagged. `NodeBuffer.synthetic_at(index)` and `Cursor.synthetic` are true for them and false for every node the parser made.

- [#957](https://github.com/pngwn/MDsveX/pull/957) [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64) Thanks [@pngwn](https://github.com/pngwn)! - An escaped pipe in a code span in a table body cell now stays in the code span, as it does in a header cell. Before, the cell ended at the pipe, the backtick became text and the rest of the row moved one column to the right.

  ```md
  | a      |
  | ------ |
  | `b\|c` |
  ```

- [#957](https://github.com/pngwn/MDsveX/pull/957) [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64) Thanks [@pngwn](https://github.com/pngwn)! - A code span with no closer in a table body cell now leaves the rest of the cell as inline content, as it already did in a header cell. Before, the rest of the cell was one text node, so emphasis in it was not parsed and a backslash escape kept its backslash.

  ```md
  | a          |
  | ---------- |
  | `b _c_ \*d |
  ```

- [#963](https://github.com/pngwn/MDsveX/pull/963) [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148) Thanks [@pngwn](https://github.com/pngwn)! - A pipe in the `#!` hint of a code span in a table body cell now ends the cell, as it does in a header cell. Before, the pipe became part of the hint and the row lost a cell. An escaped pipe still stays in the hint.

  ```md
  | a    | b    |
  | ---- | ---- |
  | `#!a | b c` |
  ```

- [#952](https://github.com/pngwn/MDsveX/pull/952) [`f62d613`](https://github.com/pngwn/MDsveX/commit/f62d6131d1b14a7876bc80a7a67cb08bb51acafa) Thanks [@pngwn](https://github.com/pngwn)! - An HTML element left open in a table cell no longer matches a closing tag in a later cell or row. The closing tag is now literal text. Before, the parser closed the table twice and put the content after the tag under the root.

  ```md
  | a <span>b | c</span> |
  | --------- | -------- |
  ```

- [#954](https://github.com/pngwn/MDsveX/pull/954) [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56) Thanks [@pngwn](https://github.com/pngwn)! - A delimiter (`*`, `**`, `_`, `~`, `~~` or `^`) with no text between it and the end of its table cell is now literal text. Before, the parser logged "Infinite loop detected", never closed the row and dropped the rest of the document.

  ```md
  | a   |
  | --- |
  | \*  |
  ```

- [#957](https://github.com/pngwn/MDsveX/pull/957) [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64) Thanks [@pngwn](https://github.com/pngwn)! - A pipe escaped in a code span in a table cell is now a plain pipe in the code, as in GFM. Before, the backslash was part of the code and showed in the page. A backslash before any other character stays, and so does `\|` in a code span outside a table.

  ```md
  | type               |
  | ------------------ |
  | `string \| number` |
  ```

  This renders the code `string | number`. A parse plugin reads the same from `text_content`. A custom emitter gets the code as a `text` attr before the node closes, and the value range still covers the source as written.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`2f8da0a`](https://github.com/pngwn/MDsveX/commit/2f8da0a6ef28a23e80c48627d7a25a30b6ea2ac8) Thanks [@github-actions](https://github.com/apps/github-actions)! - A table ends at any line that would end a paragraph. The line that closes a Svelte block or a container directive is no longer read as a table row, and neither is a directive, a list item, a Svelte block or a block level HTML tag on the line after the last row.

  ```md
  {#if show}
  | a |
  |---|
  | b |
  {/if}
  ```

- [#954](https://github.com/pngwn/MDsveX/pull/954) [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56) Thanks [@pngwn](https://github.com/pngwn)! - A closing tag in a table header cell no longer closes an HTML element opened before the table. It only matches an element opened in the same cell, and is literal text otherwise. Before, the parser closed the header cell twice and never closed the root. A closing tag in a body row still closes the table and then the element.

  ```md
  <div>

  | a </div> b |
  | ---------- |

  </div>
  ```

- [#954](https://github.com/pngwn/MDsveX/pull/954) [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56) Thanks [@pngwn](https://github.com/pngwn)! - An escaped pipe in a code span in a table header cell now stays in the code span. Before, the parser closed the header cell twice and never closed the root.

  ```md
  | `a\|b` |
  | ------ |
  ```

- [#974](https://github.com/pngwn/MDsveX/pull/974) [`06b466b`](https://github.com/pngwn/MDsveX/commit/06b466b326293b1cb1f12a69c93513f138f03774) Thanks [@pngwn](https://github.com/pngwn)! - A table header cell that starts with emphasis, a link or another inline node now keeps the whitespace after it. Before, the space was dropped and the words ran together. Body cells were not affected.

  ```md
  | _name_ of the option |
  | -------------------- |
  ```

  The header now reads "**name** of the option", it used to read "**name**of the option".

- [#1074](https://github.com/pngwn/MDsveX/pull/1074) [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474) Thanks [@pngwn](https://github.com/pngwn)! - A table opens inside a block quote, and a table inside a list item keeps its body rows. A row that is indented keeps its first cell.

  ```md
  > | a   | b   |
  > | --- | --- |
  > | c   | d   |

  - | a   | b   |
    | --- | --- |
    | c   | d   |
  ```

- [#1095](https://github.com/pngwn/MDsveX/pull/1095) [`182abbc`](https://github.com/pngwn/MDsveX/commit/182abbc20d5a942ada81867ec6c482f0d89117c6) Thanks [@pngwn](https://github.com/pngwn)! - In a table body row, an HTML tag, a comment, a Svelte expression or a `<script>` that does not end on its row is literal text, as it already is in a header row. It used to read on into the next line, and the rest of that line was dropped from the table.

  ```md
  | a   | b    |
  | --- | ---- |
  | c   | <!-- |
  | --> | d    |
  ```

  The second body row now has the cells `-->` and `d`.

- [#1160](https://github.com/pngwn/MDsveX/pull/1160) [`88b34e5`](https://github.com/pngwn/MDsveX/commit/88b34e5cd7c7549cd0bf0375131e4090ce060cf0) Thanks [@pngwn](https://github.com/pngwn)! - A long document of lines that start at an HTML tag, with no backtick in it, parses in time that grows with its length. It grew with the square of the length: 1.5MB of table cells took over a second and now takes about 30ms.

- [#1206](https://github.com/pngwn/MDsveX/pull/1206) [`6d96607`](https://github.com/pngwn/MDsveX/commit/6d9660796b1cff6e781bfb6b7b2d9af87edeadae) Thanks [@pngwn](https://github.com/pngwn)! - A fed parse keeps the paragraph of a line that starts with a tag and goes on with text when the feed stops inside that text more than 1024 characters into an element that is still open. The window trim moved past the start of the text the paragraph had yet to read, so it read the kept open tag line of the element instead, found no text and dropped the paragraph. The feed now reads that text before the trim drops it.

- [#964](https://github.com/pngwn/MDsveX/pull/964) [`00fe005`](https://github.com/pngwn/MDsveX/commit/00fe005adf2963908dcbf15b6c2986416345710f) Thanks [@pngwn](https://github.com/pngwn)! - A paragraph that starts at a tag, a component or a `{@...}` tag now decides its `<p>` from the elements that are really open in it. A tag that stays literal text counts as text, and a close tag closes the last open element of its name and everything opened inside it:
  - An element that never closes keeps its line in one `<p>`, as in the input below. Before, the `<p>` held only the literal open tag and the rest of the line was left outside it. A block level tag that never closes, as in `<Chart /> <div>new`, is literal text too and no longer unwraps the paragraph.
  - A close tag that closes nothing is text, so `<Chart /></b>` and a quoted `> </b>` get a `<p>`. Before, the close tag was left outside any paragraph. Tags closed in the wrong order end in such a close tag: in `<a><span>x</a></span>` the `</a>` closes both elements and the `</span>` is text, so that line now gets a `<p>`.
  - A close tag that closes two elements leaves neither open, so `<Chart /><b><i></b>` gets no `<p>`, as `<b><i></b>` alone on its line already had none. The same holds when the close tag of a surrounding element closes them.

  ```md
  <Chart /> <b>new</i>
  ```

  This renders `<p><Chart /> &lt;b&gt;new&lt;/i&gt;</p>`. It used to render `<Chart /> <p>&lt;b&gt;</p>new&lt;/i&gt;`.

- [#1100](https://github.com/pngwn/MDsveX/pull/1100) [`b26b0c4`](https://github.com/pngwn/MDsveX/commit/b26b0c4d5afd1db34e840878e7b352ddd3d9294f) Thanks [@pngwn](https://github.com/pngwn)! - A paragraph that starts at a tag keeps its `<p>` whenever it holds text outside its tags. It lost the wrapper, and left the text bare beside the element, when a link destination or an autolink in it held a `{` or a backtick, and when a `<script>` in a list item ended at the item's indent:

  ```md
  <Badge><ht:`></Badge>`
  ```

  The parser now decides from what it has read, so a document fed in chunks gets the same answer as one parsed whole.

- [#1151](https://github.com/pngwn/MDsveX/pull/1151) [`9b9fc0c`](https://github.com/pngwn/MDsveX/commit/9b9fc0c643423a48276582ef8e9b61c4d0f8c4e7) Thanks [@pngwn](https://github.com/pngwn)! - `node.text_content` in a parse plugin is the text a reader sees. The lines of a paragraph are joined with a space, where a soft break and a hard break used to add nothing, and the text of a comment inside the node is left out. A comment node still gives its own text.

  ```js
  // one
  // two <!-- hidden --> three
  paragraph: {
  	parse: (node) => () => node.text_content;
  }
  // was 'onetwo  hidden  three', now 'one two  three'
  ```

- [#988](https://github.com/pngwn/MDsveX/pull/988) [`6c73849`](https://github.com/pngwn/MDsveX/commit/6c73849b9d27d895795f32fcb6b8ae03a7a418af) Thanks [@pngwn](https://github.com/pngwn)! - A `|` outside a table is now rendered. Before, every pipe in a paragraph, heading, list item, block quote or inside emphasis was dropped from the output.

  ```md
  one | two | three
  ```

  rendered `<p>one  two  three</p>` and now renders `<p>one | two | three</p>`.

  The pipe is still the intraword emphasis marker, which is not rendered, when it sits directly before or after a `_`, `*` or `~`, as in `fan|_tas_|tic`. Tables, escaped pipes and the extended table markers are unchanged.

- [#958](https://github.com/pngwn/MDsveX/pull/958) [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002) Thanks [@pngwn](https://github.com/pngwn)! - An HTML tag that is never closed keeps its whole text when it ends a table cell. `| <span>|` in a body row left only the `<` in the cell. A document built from the wire format lost the rest of the tag for any unclosed tag in a cell, so `| <span>a |` came out as `<a`.

- [#960](https://github.com/pngwn/MDsveX/pull/960) [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2) Thanks [@pngwn](https://github.com/pngwn)! - A backslash escape written straight after a delimiter that never closes (`[`, `![`, `*`, `_`, `~`, `~~`, `^` or `:name[`) no longer shows its backslash. `[\*a` is the text `[*a`, as `x \*a` is `x *a`. This holds in paragraphs, headings, list items, block quotes and table cells. An escaped `&` there also keeps a character reference as written: `[\&amp;` is the text `[&amp;`. Trees built over the wire were already right.

  ```md
  [\*not a link

  | a    |
  | ---- |
  | [\*b |
  ```

- [#960](https://github.com/pngwn/MDsveX/pull/960) [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2) Thanks [@pngwn](https://github.com/pngwn)! - Outside a table a `|` gives a delimiter something to sit against and prints nothing. It now also prints nothing straight after a delimiter that never closes: `[|a` is the text `[a` and `*|` is `*`, as `x|a` is `xa`. Before, the pipe showed.

  ```md
  [|not a link
  ```

- [#960](https://github.com/pngwn/MDsveX/pull/960) [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2) Thanks [@pngwn](https://github.com/pngwn)! - An image opener with nothing after it keeps its bracket. `![` at the end of a paragraph or a table cell rendered `!`, and `![]` rendered `!]`.

  ```md
  An unfinished image ![
  ```

- [#947](https://github.com/pngwn/MDsveX/pull/947) [`a91c589`](https://github.com/pngwn/MDsveX/commit/a91c589eceab67c32767fbce7eb9061c2a1cdb22) Thanks [@pngwn](https://github.com/pngwn)! - An inline directive that never closes keeps its source text when a document is streamed over the wire format. `x :tabs[y z` came out as `x undefined`.

- [#992](https://github.com/pngwn/MDsveX/pull/992) [`817c168`](https://github.com/pngwn/MDsveX/commit/817c168a85bb7033a8c41a8037d5ed14919d35b3) Thanks [@pngwn](https://github.com/pngwn)! - An element left open inside another html element no longer leaves an empty paragraph behind when the outer element closes.

  ```md
  <div>
  <n>
  </div>
  ```

  rendered `<div><n><p></p></n></div>` and now renders `<div><n></n></div>`. With text before the close tag, `<p>x</p><p></p>` is now `<p>x</p>`.

- [#971](https://github.com/pngwn/MDsveX/pull/971) [`06b1c7f`](https://github.com/pngwn/MDsveX/commit/06b1c7f75479cb2f39fb91560fdb0322433315d7) Thanks [@pngwn](https://github.com/pngwn)! - A tag that is never closed at the start of a line, such as a stray `<span>`, is text in one paragraph with the rest of its line, and the text after it appears once. Text on the lines after such a tag keeps its paragraphs.

- [#1154](https://github.com/pngwn/MDsveX/pull/1154) [`5ba36ec`](https://github.com/pngwn/MDsveX/commit/5ba36ecea4c8008f0249fc105d86486a52621ddc) Thanks [@pngwn](https://github.com/pngwn)! - A tag that is left as text keeps all of its lines. When an attribute value ran over a line and a list or a block quote opened later in the document, the tag was cut at the end of its first line and the rest of it was lost.

  ```md
  <d>^<s c="
  q">

  - a
  ```

  The paragraph now holds `q">` again.

- [#931](https://github.com/pngwn/MDsveX/pull/931) [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9) Thanks [@pngwn](https://github.com/pngwn)! - Unicode punctuation and symbols count as punctuation beside emphasis, strong and strikethrough delimiters, as ASCII punctuation does. Curly quotes, dashes, ellipses, guillemets and CJK punctuation no longer leave the delimiters as literal text.

  ```md
  “_quoted_”, word—_aside_ and _重要_。
  ```

- [#1150](https://github.com/pngwn/MDsveX/pull/1150) [`2c06694`](https://github.com/pngwn/MDsveX/commit/2c0669413118ca19a8b97ba4e68bdda27f9a2d2d) Thanks [@pngwn](https://github.com/pngwn)! - A Svelte expression and an attribute value that run over lines in a block quote or a list item no longer hold the quote markers and the indent of those lines. They were passed to Svelte as part of the expression or the value.

  ```md
  > The total is {price +
  > tax} today.
  ```

  The expression is now `price +` and `tax` on two lines. It used to hold the `>` of the second line.

  An expression or an attribute value also stays inside its container. When one of its lines leaves the block quote or the list item, the opening brace or the tag is literal text, where it used to run on into the text after the container.

- [#928](https://github.com/pngwn/MDsveX/pull/928) [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d) Thanks [@pngwn](https://github.com/pngwn)! - `WireTreeBuilder.reset()` gives the next document its own strings and clears the plugin state of the last one. Text written after a reset used to go into an array shared by every buffer, and plugins kept reading the text of the document before the reset.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - Over the wire, a heading with trailing spaces whose content a plugin wrapped, as the autolink plugin does, shows its text once. `## A   ` rendered as `A   A`.

- [#966](https://github.com/pngwn/MDsveX/pull/966) [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637) Thanks [@pngwn](https://github.com/pngwn)! - A heading or table cell streamed over the wire keeps all of its text when it ends in a space. `# a\*b ` fed in chunks now arrives as `a*b`, it used to arrive as `*b`.

- [#946](https://github.com/pngwn/MDsveX/pull/946) [`db21435`](https://github.com/pngwn/MDsveX/commit/db214350aab84b0d5b91560d8eb4c5b7ec11728f) Thanks [@pngwn](https://github.com/pngwn)! - Text that follows an empty link or image, as in `x [] more`, is kept when a document is built from the wire format.

- [#928](https://github.com/pngwn/MDsveX/pull/928) [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d) Thanks [@pngwn](https://github.com/pngwn)! - A node wrapped more than once with `wrap_inner` sends its later children to the innermost wrapper. They used to land beside an empty wrapper when two plugins wrapped the same node or a plugin wrapped its own wrapper, and revoking one wrapper dropped the redirect of the others.

## 1.0.0-next.1

### Minor Changes

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

- [#899](https://github.com/pngwn/MDsveX/pull/899) [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619) Thanks [@pngwn](https://github.com/pngwn)! - Tables can have header columns and merged cells. A `||` in the delimiter row, matched by an empty `||` cell in the header row, turns the columns on its narrower side into row headers, and two `||` give headers on both sides. A cell holding only `>` merges into the cell to its left, and a cell holding only `^` merges into the cell above. Merged cells must form rectangles, and a marker that can't merge stays text.

  ```md
  | maybe || title |> |
  |-------||-------|---|
  | hello || text | b |
  |^ || more | c |
  ```

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Export `normalize_newlines` and `raw_offsets`, so tools that read parser positions can map them back to a source with `\r\n` line endings.

  ```ts
  const offsets = raw_offsets(source); // null when there is nothing to map
  const start = offsets ? offsets.to_raw(node_start) : node_start;
  ```

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Paragraphs around HTML, components and Svelte tags follow one rule:
  - A paragraph of only tags, components, `{@...}` tags and whitespace gets no `<p>`, and keeps its spaces and line breaks.
  - Any text outside the tags wraps the whole paragraph in a `<p>`, so `<X /> hello` renders `<p><X /> hello</p>` instead of splitting it.
  - A paragraph holding a block level element such as `<div>` or `<p>` is never wrapped.

  An element that opens and closes on the same line holds inline content, so `<div><p>hi</p></div>` no longer gets an extra `<p>` inside it. One that stays open past its line holds blocks as before, and an element like `<p>`, `<span>` or `<button>` never wraps its content in `<p>`.

  A `{#if}` style block opener at the start of a line now ends the paragraph before it.

  ```md
  <Chart />
  <Legend />

  <Badge>new</Badge> in this release
  ```

### Patch Changes

- [#864](https://github.com/pngwn/MDsveX/pull/864) [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff) Thanks [@pngwn](https://github.com/pngwn)! - A backtick followed by a space at the very end of the input stays literal text instead of becoming an unclosed code span.

- [#893](https://github.com/pngwn/MDsveX/pull/893) [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9) Thanks [@pngwn](https://github.com/pngwn)! - A code span holding only `#!` or `#!lang`, with no space and code after it, renders as ordinary inline code showing that text, and never takes a language hint.

  ```md
  Write `#!ts` or `#!` in prose.
  ```

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6) Thanks [@pngwn](https://github.com/pngwn)! - A closing tag of an enclosing HTML element or component on its own line now ends the paragraph or list item before it, so the line break and indentation before the tag no longer end up inside the paragraph.

  ```md
  <Card>
    - one
    - two
  </Card>
  ```

- [#880](https://github.com/pngwn/MDsveX/pull/880) [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4) Thanks [@pngwn](https://github.com/pngwn)! - A container directive inside a block quote parses its quoted body lines as normal content, and `> :::` closes it.

- [#878](https://github.com/pngwn/MDsveX/pull/878) [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781) Thanks [@pngwn](https://github.com/pngwn)! - Bullet and ordered lists inside a container directive (`:::name[]`) parse as lists instead of paragraphs.

- [#903](https://github.com/pngwn/MDsveX/pull/903) [`ebdb9fb`](https://github.com/pngwn/MDsveX/commit/ebdb9fb687933c69da0260eb50e8a4d2fae2bbca) Thanks [@pngwn](https://github.com/pngwn)! - Emphasis, strong, strikethrough, superscript and subscript close right after a Svelte expression, tag or code span, so `*{name}*` and ``_`code`_`` are no longer left as literal delimiters.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing markdown is much faster, up to about 3x, and incremental (streaming) parsing is faster as well. Parsing many documents in a row reuses one parser instead of creating a new one for each document.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block that ends at the end of the input no longer overwrites the label value of the container directive around it.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block whose opening line is the last line of the input is an empty code block with that info string, instead of taking the whole document as its value.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - Content after an unclosed `*`, `_`, `~`, `^`, `[` or HTML tag in a heading is no longer dropped. The heading ends at the line end and the next line is parsed as usual. The same holds for an unclosed `[` before a heading, list item, block quote, fence or rule, and a link can now continue across block quote lines.

- [#864](https://github.com/pngwn/MDsveX/pull/864) [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff) Thanks [@pngwn](https://github.com/pngwn)! - Trailing whitespace after an inline element at the end of a heading no longer leaves an empty text node in the heading.

  ```md
  # <b>
  ```

- [#854](https://github.com/pngwn/MDsveX/pull/854) [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a) Thanks [@pngwn](https://github.com/pngwn)! - Content after an HTML block that contained a list, blockquote, table or Svelte block is no longer dropped when the closing tag sits on the same line as that content.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after `^` or `~~` before deciding whether it opens superscript or strikethrough, so a `^` or `~~` at the end of a line stays text, the same as in a full parse.

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing now ends an unclosed code span at a blank line, like a full parse does, even when a chunk ends right after the line break before it.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing gives the same result as parsing the whole document when a chunk ends right after a `+` or `1.` list marker with no content yet, or inside an open tag whose attributes contain a `>`.

  ```md
  - x
    <C b={x > 1}>y</C>
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after a whole run of `#` before deciding whether a line starts a heading, so a line like `##text` that ends a chunk still continues the paragraph above, the same as in a full parse.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for enough of the next line before deciding whether a line break ends unclosed link text, directive text or an inline HTML element, so text like `*:x[` followed by `#]` on the next line gives the same tree as a full parse.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - A document that ends in a lone carriage return (`\r`) now parses the same way incrementally as it does in a single pass.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing recognises a fenced code block inside a block quote when a chunk boundary splits the quote markers, matching a full parse.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing recognises a `---`, `***` or `___` line inside an HTML block, a Svelte block or a directive container as a thematic break when it is the last line fed so far, instead of turning it into a paragraph.

  ```md
  ## <div>
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after a closing `~` or `~~` before closing subscript or strikethrough, so text like `~a~~` or `~~~~a` gives the same tree as a full parse.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6) Thanks [@pngwn](https://github.com/pngwn)! - List items indented by the same amount are siblings again. The first item's indent was measured after its leading whitespace had been skipped, so later items nested under it. This affected any indented list, including lists inside HTML elements and components.

  ```md
  <div>

      - one
      - two

  </div>
  ```

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Documents keep everything after a paragraph with more than a hundred or so unmatched `*`, `_`, `[`, `~~` or inline HTML tags, and after an unclosed `[` inside a table, instead of ending early.

  ```md
  ## ||

  [
  d
  ```

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Streaming a document with `feed()` stays fast when a single list, block quote or code fence is very large. An 8000 line list or code fence fed in 64 character chunks now parses in about 50ms instead of 3 to 6 seconds.

- [#851](https://github.com/pngwn/MDsveX/pull/851) [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing with `feed()` now takes time proportional to the input size, so streaming small chunks into a large document is no longer slower than parsing it in one go. A 3.8MB document fed in 64 character chunks parses in about 0.35s instead of 27s.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing stays linear for fenced code inside block quotes, long lines and list items inside block quotes, paragraphs with many brackets that are not links, and long tight lists of task boxes, links or inline html.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing time stays proportional to document size when a document has unmatched braces or stray `<word` text. Incremental parsing also stays linear inside long paragraphs, tables, pending emphasis and unclosed braces, frontmatter, comments, code spans or HTML and Svelte blocks, where it used to slow down with every chunk.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - Lines in a nested block quote stay at their own depth after a heading, thematic break, code fence or blank quoted line. A line with fewer `>` markers closes the deeper quotes instead of opening another one.

  ```md
  > > # heading
  > >
  > > stays in the inner quote
  > > back in the outer quote
  ```

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - `NodeBuffer` now stores all of a node's fields together in one typed array, so its raw per-field arrays such as `_kinds` and `_starts` no longer exist; read nodes through its accessor methods instead. Node ids passed to a custom emitter are now node buffer indices, so text nodes take an id too and the ids seen by `open` can skip numbers.

- [#853](https://github.com/pngwn/MDsveX/pull/853) [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55) Thanks [@pngwn](https://github.com/pngwn)! - Compiling several documents with one compiler session, as the vite plugin does, no longer lets a document that ends in an unfinished heading such as `` # ` `` make later documents lose the text after their first line.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block inside a block quote closes on a quoted closing line (` > ``` `) instead of running to the end of the document. Its value is the raw source of the content lines, so every line keeps its `>` markers.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - Content after a block quote is no longer dropped when the quote's last line ends with an unclosed HTML tag and the next line has no `>`.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - An extra `>` marker inside a block quote paragraph starts a nested quote, matching how `>` interrupts a paragraph outside a quote.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Sequential parse plugins visit every node added by an earlier handler, however large the document.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - `<svelte:head>`, `<svelte:window>` and other `svelte:` elements are parsed as elements instead of URI autolinks.

- [#901](https://github.com/pngwn/MDsveX/pull/901) [`430cf34`](https://github.com/pngwn/MDsveX/commit/430cf3493575c706b31b5e02b4c219f4b6ea0569) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed backtick followed by a space no longer runs past the cell's closing pipe or the end of the row, and in a paragraph it no longer spans a blank line.

- [#897](https://github.com/pngwn/MDsveX/pull/897) [`eefaff5`](https://github.com/pngwn/MDsveX/commit/eefaff563e6ce05026f92c03fce21b3ba4bd5e77) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed delimiter in a table cell, such as `^2`, `~2`, `*2`, `[2` or a lone code span backtick, stays literal text without picking up the cell's trailing whitespace.

- [#898](https://github.com/pngwn/MDsveX/pull/898) [`3f5bbbb`](https://github.com/pngwn/MDsveX/commit/3f5bbbb069ca12e16b3bb96afb60c41362161109) Thanks [@pngwn](https://github.com/pngwn)! - A table row with more cells than the header drops the extra cells instead of leaving their content as text directly inside the table.

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed `*`, `_`, `~~`, `~` or `^` followed by a line that starts a list item, blockquote, fence or HTML block stays literal text, and the rest of the document parses in full.

  ```md
  1. ~1
  2. -
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed delimiter keeps exactly its own characters as text. A `[` or `![` at the end of a line is no longer left as empty text, and `foo *_*` no longer repeats the `_`.

  ```md
  [
  \_
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed inline directive keeps its whole opener as text. Before, a line like `:name[` that was never closed kept only the `:`.

  ```md
  :name[

  # heading
  ```

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Inline HTML that is never closed and falls back to plain text now keeps its full original text, instead of a truncated or unrelated fragment.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed HTML tag now shows its text once. Content after it on the same line is no longer repeated, and a tag that spans lines keeps all of its text.

  ```md
  a <b>x
  ```

  renders as `<p>a &lt;b&gt;x</p>` rather than `<p>a &lt;b&gt;xx</p>`.

- [#849](https://github.com/pngwn/MDsveX/pull/849) [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727) Thanks [@pngwn](https://github.com/pngwn)! - Backticks with no closing run stay as literal text, including every backtick in a run of two or more, and a blank line after them still ends the paragraph.

## 1.0.0-next.0

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#808](https://github.com/pngwn/MDsveX/pull/808) [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb) Thanks [@pngwn](https://github.com/pngwn)! - Add named argument lists to generic directives (`:name[text](key=val, key2=val2)`) for inline, leaf, and container forms. Empty lists (`()`) are allowed but ignored; malformed lists degrade to literal text (inline) or a paragraph (block). The `[content]` brackets are now required for all directive forms - empty text must be explicit (`::name[]`). Directive text accepts simple inline constructs (emphasis, code spans, strikethrough, superscript, subscript) but links, images, and autolinks stay literal text, and unescaped square brackets must balance.

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

## 0.1.1

### Patch Changes

- [#359](https://github.com/pngwn/MDsveX/pull/359) [`07a3e6f`](https://github.com/pngwn/MDsveX/commit/07a3e6f8f7f163b91e1b7adc881957dac3825288) Thanks [@pngwn](https://github.com/pngwn)! - Split modules up, add new build approach with constant replacements.
