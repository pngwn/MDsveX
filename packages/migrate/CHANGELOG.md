# @mdsvex/migrate

## 0.2.0-next.3

### Patch Changes

- [#1232](https://github.com/pngwn/MDsveX/pull/1232) [`974d940`](https://github.com/pngwn/MDsveX/commit/974d9404d23db0c98fa83fbe9ac27f83291c909d) Thanks [@pngwn](https://github.com/pngwn)! - The note left for `rehype-figure`, `remark-figure-caption`, `rehype-mermaid`, `remark-mermaidjs`, `remark-youtube` and `remark-kbd` names the plugin that replaces it: `@mdsvex/plugin-figures`, `@mdsvex/plugin-diagram`, `@mdsvex/plugin-embeds` or `@mdsvex/plugin-elements`. A figure plugin also turns on `unwrap_images`, so an image alone in a figure has no paragraph around it.

- [#1237](https://github.com/pngwn/MDsveX/pull/1237) [`bd7f9dd`](https://github.com/pngwn/MDsveX/commit/bd7f9dd49467d24250b5bc581e8020c5ac6e0431) Thanks [@pngwn](https://github.com/pngwn)! - The note left for `remark-abbr`, `remark-flexible-markers`, `remark-mark-highlight` and `remark-ins` names `@mdsvex/plugin-elements`, and says to write `:abbr[...](title=...)`, `:mark[...]` or `:ins[...]`.

## 0.2.0-next.2

### Minor Changes

- [#1136](https://github.com/pngwn/MDsveX/pull/1136) [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47) Thanks [@pngwn](https://github.com/pngwn)! - A footnote definition is migrated whole. Its first block is written on the line of its label and every later line is indented by four spaces, so a definition that holds several paragraphs, a list or a fence stays one footnote.

- [#1135](https://github.com/pngwn/MDsveX/pull/1135) [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4) Thanks [@pngwn](https://github.com/pngwn)! - Footnotes are migrated to PFM footnotes, where they used to be kept as escaped text. Each reference is written with the label of its definition, since PFM matches labels exactly, and a label loses the characters PFM does not allow in one. The blocks after the first paragraph of a definition follow it as blocks of the document.

  A definition that starts with a list or a fence stays escaped text with its references, as does a second definition of a label. A `[^...]` that was no footnote is still escaped, which now matters: PFM reads every `[^label]` as a reference.

- [#1128](https://github.com/pngwn/MDsveX/pull/1128) [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738) Thanks [@pngwn](https://github.com/pngwn)! - `migrate` takes `math: true` for a project that used `remark-math`. The document is read as `remark-math` read it, `$x# @mdsvex/migrate is written as inline math and `$x$`as a`math` fence, and the LaTeX is copied as it is, where it used to be escaped as markdown.

  ```js
  migrate('Euler: $e^{i\\pi} + 1 = 0$\n\n$\n\\frac{a}{b}\n$', { math: true });
  ```

  ````md
  Euler: # @mdsvex/migratee^{i\pi} + 1 = 0`$

  ```math
  \frac{a}{b}
  ```
  ````

  Two prices are left alone: `it costs $5 and $10` comes out as written, though `remark-math` reads `5 and ` as math there. Without the option a dollar stays a dollar. In both modes a code span that had a dollar on each side gets its first dollar escaped, so it does not turn into math.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` reads `remarkPlugins` and `rehypePlugins`. mdsvex runs no remark or rehype plugins now, so each plugin in the lists gets a note that says what replaces it: core syntax, an option, a first-party plugin, a component, or nothing yet. The lists stay in the config under a `TODO(mdsvex-migrate)` comment.

  ```js
  import { mdsvex } from 'mdsvex';
  import slug from 'rehype-slug';
  import autolink from 'rehype-autolink-headings';

  mdsvex({ rehypePlugins: [slug, autolink] });
  ```

  ```
  5:26 `rehype-slug` does not run now. The `heading_ids` option makes the same ids. `heading_ids: true` was added.
  5:32 `rehype-autolink-headings` does not run now. Install `@mdsvex/plugin-anchors` and add `anchors()` to `plugins`, with `heading_ids: true`.
  ```

  `rehype-slug`, `remark-slug`, `remark-unwrap-images` and `rehype-unwrap-images` turn their option on in the config, unless the plugin had options of its own. The notes have the new kind `plugin`.

- [#1081](https://github.com/pngwn/MDsveX/pull/1081) [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` moves the `smartypants` option of mdsvex 0.x to `smart_punctuation`. Smart punctuation was on by default in 0.x and is off by default now, so a config that never set it gains `smart_punctuation: true`, and `smartypants: false` is removed.

  `migrate` takes the old option as `smartypants` and rewrites the dashes and backtick quotes of a document, so that it renders what it did. With the 0.x default two hyphens were an em dash, which now takes three.

  ```js
  migrate('a -- b', { smartypants: true }); // 'a --- b'
  ```

### Patch Changes

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - A bare url, which GFM links and mdsvex does not, is written as an autolink: `https://example.com` becomes `<https://example.com>`. It used to be written twice, as `[https://example.com](https://example.com)`.

- [#1185](https://github.com/pngwn/MDsveX/pull/1185) [`b9d7cae`](https://github.com/pngwn/MDsveX/commit/b9d7cae13e399b8351727d8569f24bafb0671b3f) Thanks [@pngwn](https://github.com/pngwn)! - `rehype-citation` is now pointed at `@mdsvex/plugin-citations`.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` rewrites the `extension` option of mdsvex 0.x, so `extension: '.md'` becomes `extensions: ['.md']`. It flags `frontmatter.marker` and `frontmatter.type`, which are gone: frontmatter is always fenced with `---`.

- [#1042](https://github.com/pngwn/MDsveX/pull/1042) [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d) Thanks [@pngwn](https://github.com/pngwn)! - `file=` on a fence with no code, as remark-code-import has it, becomes `src=`.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - Inline code that holds backticks is written as a span mdsvex reads. Code with two backticks in a row used to be wrapped in three, which is plain text in mdsvex.

  ````js
  migrate('```a``b```'); // '`a``b`'
  ````

  A span of one backtick holds any run but one, and a span of two holds any run but two. Code that has a run of each is written as a `<code>` element.

- [#927](https://github.com/pngwn/MDsveX/pull/927) [`eb03822`](https://github.com/pngwn/MDsveX/commit/eb038221945a2db6e97d73e8a7cd8a1ed70872ff) Thanks [@pngwn](https://github.com/pngwn)! - Footnotes are kept as literal text. A reference becomes `\[\^label\]` and a definition becomes `\[\^label\]: ...` followed by the rest of its blocks, where both used to be dropped from the output.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - `migrate` keeps the Svelte in a document as written. An expression such as `{items[0].a_b}` used to get its brackets, underscores and asterisks escaped as markdown, `<svelte:head>` became a link, and a `{/each}` after a list joined its last item.

  ```js
  migrate('Hello {user.first_name}, you have **{items[0]}**.');
  // 'Hello {user.first_name}, you have *{items[0]}*.'
  ```

  Expressions, `{#if}` blocks, `{@html}` tags, `svelte:` elements, `<script>`, `<style>` and tags with attributes such as `on:click|once={go}`, `{...props}` and `--gap="1rem"` all pass through unchanged, and the markdown around and inside them is still converted.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` tells a 0.x config that `rel="nofollow"` is gone. mdsvex 0.x put it on every link to another site and had no option for it, and links are now written as they are. The note, of the new kind `external_links`, says how to keep it with `@mdsvex/plugin-external-links`.

- [#1081](https://github.com/pngwn/MDsveX/pull/1081) [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` writes valid JavaScript when the option it removes is the only one and has a trailing comma, such as `mdsvex({ layout: false, })`. The comma used to stay behind in an empty object.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - Text that only looked like markup stays text. An escaped or encoded `<`, `{`, `}` or `&`, such as `\<b>`, `&lt;b&gt;` and `&#123;x&#125;`, is written with a backslash. It used to be written bare, so the migrated document had a real `<b>` element or a Svelte expression where the old one showed the characters.

- [#1138](https://github.com/pngwn/MDsveX/pull/1138) [`27d954c`](https://github.com/pngwn/MDsveX/commit/27d954c929c2e5d4a8846dd60bcd2fa147869737) Thanks [@pngwn](https://github.com/pngwn)! - A document with Windows line endings is migrated like any other. Svelte after the first code fence of such a document was not recognised, so its expressions were escaped as markdown. The output is written with linefeeds.

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The packages hold only what they run. Tests, fixtures, build config and intermediate build output are no longer published, which takes `@mdsvex/parse` from 2,337 files to 28.

## 0.2.0-next.1

### Minor Changes

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - Migrating a document renames its frontmatter `layout` key to `template`, so `layout: blog` becomes `template: blog` and `layout: false` becomes `template: false`. To rename the key without converting the markdown, use `migrate_frontmatter`:

  ```ts
  import { migrate_frontmatter } from '@mdsvex/migrate';

  const { code, notes } = migrate_frontmatter(source);
  ```

- [#892](https://github.com/pngwn/MDsveX/pull/892) [`59bbad3`](https://github.com/pngwn/MDsveX/commit/59bbad3d1905ea378b8745d916af0dca3e63b042) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` rewrites the mdsvex 0.x `highlight` option. `alias` becomes `languages`, and `optimise` is removed:

  ```ts
  // before
  mdsvex({
  	highlight: { alias: { yavascript: 'javascript' }, optimise: false },
  });

  // after
  mdsvex({ highlight: { languages: { yavascript: 'javascript' } } });
  ```

  `highlight: false` is kept. A `highlighter` function can't be rewritten safely, so it gets a `// TODO(mdsvex-migrate)` comment linking to the migration guide and a `highlighter` note. An `escapeSvelte` import gets an `escape_svelte` note, and an alias to a Prism language twinkleplop doesn't have gets a `highlight_language` note.

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` rewrites the mdsvex 0.x `layout` option in a config file to `templates`:

  ```ts
  // before
  mdsvex({ layout: { _: './src/Default.svelte', blog: './src/Blog.svelte' } });

  // after
  mdsvex({
  	templates: { default: './src/Default.svelte', blog: './src/Blog.svelte' },
  });
  ```

  Named layouts are no longer applied to documents in a folder of the same name, so the returned notes suggest a `select_template` that does the same. They also flag `layoutPropForwarding`, since templates always get the document's props.

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - `check_template` flags what a 0.x layout component needs changed to work as a template: `<slot />` becomes `{@render children()}`, and `$props`, `$restProps` and `{...$props}` become `$props()`.

### Patch Changes

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - Migrating a document keeps its frontmatter as it is, instead of turning it into a thematic break and a heading.

- [#899](https://github.com/pngwn/MDsveX/pull/899) [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619) Thanks [@pngwn](https://github.com/pngwn)! - A table cell holding only `>` migrates as `\>`, so it stays text and doesn't merge into the cell to its left.

## 0.2.0-next.0

### Minor Changes

- [#807](https://github.com/pngwn/MDsveX/pull/807) [`e4732d9`](https://github.com/pngwn/MDsveX/commit/e4732d97163d4454e3e43f8040f18b9ee9bf3d14) Thanks [@pngwn](https://github.com/pngwn)! - Add `@mdsvex/migrate`: converts CommonMark/GFM markdown to Penguin-Flavoured Markdown (PFM) using the remark (unified) ecosystem.
