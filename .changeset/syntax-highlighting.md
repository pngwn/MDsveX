---
'mdsvex': minor
'@mdsvex/render': minor
---

Fenced code and `` `#!lang code` `` spans are highlighted with [twinkleplop](https://twinkleplop.pngwn.at) by default in the Vite plugin. Every twinkleplop language loads the first time a document has code, along with the common aliases (`js`, `ts`, `sh`, `yml`, `md`, `py` and others). Lookup tries the exact name, then the lowercased one. A language mdsvex doesn't know renders as plain twinkleplop markup, with one warning per file. mdsvex adds no CSS, so import a theme yourself:

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

const highlight = create_highlight({ languages: await load_default_languages() });
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
