# @mdsvex/plugin-page-data

Facts about each [mdsvex](https://mdsvex.pngwn.io) document, for its template and for pages that list documents: a reading time and word count, an excerpt, a title read from the first heading, and an edit url.

```bash
pnpm add --save-dev @mdsvex/plugin-page-data@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { page_data } from '@mdsvex/plugin-page-data';

export default {
	plugins: [
		mdsvex({
			plugins: [
				page_data({ edit_url: 'https://github.com/you/site/edit/main/' }),
			],
		}),
	],
};
```

```md
# Moving to runes

Signals changed how I write components. Here is what I learned.

## State

...
```

```js
import Post, { plugin_data } from './moving-to-runes.svx';

plugin_data.page;
// {
//   title: 'Moving to runes',
//   excerpt: 'Signals changed how I write components. Here is what I learned.',
//   words: 842,
//   minutes: 5,
//   edit_url: 'https://github.com/you/site/edit/main/src/routes/blog/moving-to-runes.svx',
// }
```

Everything is under one key, `plugin_data.page`, and each part can be turned off. A key is only there when its part is on and found something. It reaches a page the three ways all [plugin data](https://mdsvex.pngwn.io/docs#plugin-data) does: the `plugin_data` export of the document, the `plugin_data` prop of its template, and a `?data` import. The package types the key, by adding to the `PluginData` interface of mdsvex. That is in effect once TypeScript sees an import of the package, which a `vite.config.ts` gives it. With a config it does not check, add `import type {} from '@mdsvex/plugin-page-data';` to a declaration file such as `src/app.d.ts`.

`metadata` is not touched. It stays exactly the frontmatter.

## Options

```ts
page_data({
	reading_time: boolean | { words_per_minute: number }, // true, 200
	excerpt: boolean | { max_length: number, ellipsis: string }, // true, no limit, '…'
	title: boolean, // true
	edit_url:
		string |
		{ base: string, root: string } |
		((filename: string) => string | undefined), // off
});
```

An option of the wrong shape throws a `PageDataError` when the plugin is made.

## Reading time

`words` is the number of words in the prose of the document, and `minutes` is the time to read them.

- **Prose is the text a reader reads**: headings, paragraphs, list items, block quotes, table cells, footnotes, the labels of directives, and what an element, a component or a `{#if}` block holds.
- **Not counted**: code blocks, the alt of an image, comments, `{expressions}`, HTML attributes, link urls and titles, `<script>` and `<style>`.
- **Code in a sentence is counted**, since `` `npm install` `` is read as part of it.
- **A word is a run of characters between spaces**, so `well-known` is one word, and markup inside a word does not split it.
- **Chinese, Japanese and Korean are written without spaces, so each of their characters is a word**: every Han ideograph, hiragana and hangul syllable. The punctuation after one is not a word. Katakana is not counted this way, a run of it is one word, as loan words are. This is the rule of the [`reading-time`](https://www.npmjs.com/package/reading-time) package, which `remark-reading-time` counts with.
- **`minutes` is rounded the way `reading-time` shows it**: `words / words_per_minute`, to two decimals, then up to a whole minute. One word is 1 minute, 200 words are 1, and 202 are 2. A document with no words has 0.

Unlike `remark-reading-time`, code blocks are left out, and the last word of a block and the first of the next are two words, not one.

```js
page_data({ reading_time: { words_per_minute: 250 } });
```

`count_words(text)` is exported, to count some other text by the same rule.

## Excerpt

`excerpt` is the first paragraph of the document, or everything before a `<!-- more -->` comment when the document has one.

```md
# Title

This paragraph is the excerpt.

This one is not.
```

```md
# Title

With the comment below, this paragraph

and this one are the excerpt.

<!-- more -->

This one is not.
```

- **It is plain text.** A parse plugin sees the document before it is rendered, so there is no HTML to give. Emphasis, links and code are their text, a character reference such as `&amp;` is its character, and the lines of a paragraph are joined with a space. For a rendered excerpt, render the start of the document in the template instead.
- **The first paragraph** is the first one with text that is not inside a block quote, a list, a table, a footnote, a container directive or a Svelte block. A paragraph that only holds an image, a component or an expression is passed over.
- **Before `<!-- more -->`** it is every block of prose, joined with spaces. Headings, code blocks, tables and footnotes are left out. The comment can be on a line of its own or inside a paragraph, which is then cut there. Only the first one counts.
- **`max_length`** is the most characters the excerpt has. A longer one is cut where a word ends and gets the `ellipsis`, which counts toward the length. Text with no spaces, such as Japanese, is cut between two characters.

```js
page_data({ excerpt: { max_length: 160 } });
```

## Title

`title` is the text of the first `#` heading, for a document whose frontmatter has no `title`:

```svelte
<script>
	let { title, plugin_data, children } = $props();
</script>

<svelte:head>
	<title>{title ?? plugin_data?.page?.title}</title>
</svelte:head>
```

- It is only set when the frontmatter has no `title`, or an empty one. A title you wrote is in `metadata` and is never copied.
- The heading is one that is not inside a block quote, a list or a container directive.
- The text is what a reader sees, without markup. A heading that is only an expression, such as `# {title}`, has no text and is passed over.

## Edit url

`edit_url` is where the source of the document can be edited. It is off until you give it a base:

```js
page_data({ edit_url: 'https://github.com/you/site/edit/main/' });
// /home/you/site/src/routes/blog/post.svx
// https://github.com/you/site/edit/main/src/routes/blog/post.svx
```

- **The path is the file of the document relative to `root`**, which is the working directory by default. In a monorepo, where the app is not at the root of the repository, name the root, or put the directory of the app in the base:

```js
page_data({
	edit_url: {
		base: 'https://github.com/you/repo/edit/main/',
		root: fileURLToPath(new URL('../..', import.meta.url)),
	},
});
```

- **A function** gets the path of the document and returns the url, or nothing for no url.
- A document outside the root has no `edit_url`, and the build warns `outside_root`. With `compile()` and no `filename` there is none either, and the warning is `no_filename`.

**The date a document was last changed is not here.** It comes from git or the file system, and a parse plugin can read neither: its handlers are synchronous and are given the path of the document, not a way to read around it. Read it where you list the documents instead, in a `+page.server.js` or a Vite plugin.

## An index page

A `?data` import parses a document and runs its plugins without rendering it, so a list of posts does not load every post:

```svelte
<!-- src/routes/blog/+page.svelte -->
<script>
	const posts = import.meta.glob('./*/+page.svx', { query: '?data', eager: true });
</script>

<ul>
	{#each Object.entries(posts) as [path, { metadata, plugin_data }] (path)}
		<li>
			<a href="/blog/{path.split('/')[1]}">{metadata?.title ?? plugin_data?.page?.title}</a>
			<span>{plugin_data?.page?.minutes} min read</span>
			<p>{plugin_data?.page?.excerpt}</p>
		</li>
	{/each}
</ul>
```

## With `compile`

```js
import { compile } from 'mdsvex';

const { data } = compile(source, {
	filename: '/home/you/site/post.svx',
	plugins: [page_data()],
});
data?.page;
```

An empty document has no `page` key. The data is the same from a tree built over the wire format.
