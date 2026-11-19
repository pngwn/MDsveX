# @mdsvex/plugin-figures

Figures for [mdsvex](https://mdsvex.pngwn.io). A `:::figure` directive puts anything written inside it, an image, a code block, a table or a diagram, in a `<figure>` with the bracket text as its caption.

```bash
pnpm add --save-dev @mdsvex/plugin-figures@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { figures } from '@mdsvex/plugin-figures';

export default {
	plugins: [mdsvex({ unwrap_images: true, plugins: [figures()] })],
};
```

It needs Svelte 5. The component loads no script of its own.

```md
:::figure[Sales by month, 2026](id=fig:sales)

![A bar chart of sales by month](./chart.png)

:::
```

```html
<figure class="figure" id="fig:sales">
	<img src="/assets/chart.4f2a.png" alt="A bar chart of sales by month" />
	<figcaption class="figure-caption">Sales by month, 2026</figcaption>
</figure>
```

- **The bracket text is the caption**, with its inline markup, below the content. A figure without brackets has no caption.
- **`id` is optional** and stays on the `<figure>`, so a link to `#fig:sales` reaches it. It is an id you wrote, so a heading or footnote that already has it fails the build, as it would for any id you write twice.
- **With [`unwrap_images`](https://mdsvex.pngwn.io/docs#unwrap_images)** an image alone in the figure has no `<p>` around it. Without it the image keeps its paragraph, which is valid inside a figure.
- **The alt text describes the image and the caption is for every reader.** A screen reader reads both, so don't repeat one in the other.
- **A lone image is never a figure**, with a title or without. The title stays the image's `title`.
- **An empty figure warns**, as `empty_figure`.

## Numbers

A figure is unnumbered on its own. A numbering plugin numbers it through [plugin data](https://mdsvex.pngwn.io/docs#plugin-data): when the data of the plugin named `numbering` has a key `target:` followed by the figure's id, such as `target:fig:sales`, holding `{ kind, number, text }`, the caption starts with its `text`. The component reads the data from Svelte context, so while a document streams the number appears once it arrives:

```html
<figcaption class="figure-caption">
	<span class="figure-number">Figure 3</span>: Sales by month, 2026
</figcaption>
```

A numbered figure with no caption has the number alone as its caption, `<figcaption><span class="figure-number">Figure 2</span></figcaption>`, and one with neither has no `<figcaption>`.

The component gets `label`, `children` and `id`. Export a `figure` from a directives module to replace it, or wrap the plugin's, `@mdsvex/plugin-figures/Figure.svelte`. Leave the stylesheet out with `figures({ css: false })`.

## Styles

The component comes with a small stylesheet. Every selector is inside `:where()`, so any rule of yours wins. The classes are `figure`, `figure-caption` and `figure-number`. `figures({ css: false })` leaves it out, and it is also exported as `@mdsvex/plugin-figures/figures.css`.

## How it is packaged

The component is shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too. With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-figures/directives`, and your bundler needs a Svelte plugin to resolve it.
