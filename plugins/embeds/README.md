# @mdsvex/plugin-embeds

Video embeds for [mdsvex](https://mdsvex.pngwn.io), each a leaf directive: a YouTube or Vimeo player named by its title.

```bash
pnpm add --save-dev @mdsvex/plugin-embeds@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { embeds } from '@mdsvex/plugin-embeds';

export default {
	plugins: [mdsvex({ plugins: [embeds()] })],
};
```

```md
::youtube[A conference talk](id=dQw4w9WgXcQ, start=30)

::vimeo[A short film](id=76979871)
```

```html
<div class="embed embed-youtube">
	<iframe
		src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"
		title="A conference talk"
		loading="lazy"
		allowfullscreen
		...
	></iframe>
</div>
```

It needs Svelte 5. The components load no script of their own.

- **The bracket text is the title of the frame**, which is what a screen reader announces for it. An `{expression}` in it is left out, as it is not known until the page runs. `(title=...)` sets it instead.
- **`id`** is the id of the video, the part after `v=` or `youtu.be/` on YouTube and after `vimeo.com/` on Vimeo. **`start`** is a time in seconds.
- **The player loads lazily** (`loading="lazy"`), from `youtube-nocookie.com`, which sets no cookie until the video plays, and from Vimeo with `dnt=1`.
- **The frame fills the width at 16:9.** Set `aspect-ratio` on `.embed` to change it.
- **Without an id** the title is rendered as a paragraph, so the text is not lost.

## What it warns about

The build reports these, with the line they are on, and still renders the page:

| code                  | when                                                              | what is rendered                                                          |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `embed_id`            | a `::youtube` or `::vimeo` with no id, or one that is no id there | the player, which shows the site's own error, or the title as a paragraph |
| `embed_without_title` | an embed with nothing in its brackets and no `title`              | a frame named "YouTube video" or "Vimeo video"                            |

## Styles

The components come with a small stylesheet. Every selector is inside `:where()`, so any rule of yours wins. The classes are `embed`, `embed-youtube` and `embed-vimeo`. To leave the stylesheet out:

```js
embeds({ css: false });
```

The stylesheet is also exported as `@mdsvex/plugin-embeds/embeds.css`.

## Your own components

Export a `youtube` or a `vimeo` from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the plugin's. It gets `label`, `id`, `title` and `start`, the title already read from the label. The plugin's own are exported as `@mdsvex/plugin-embeds/YouTube.svelte` and `@mdsvex/plugin-embeds/Vimeo.svelte`.

## How it is packaged

The components are shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too. With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-embeds/directives`, and your bundler needs a Svelte plugin to resolve it.
