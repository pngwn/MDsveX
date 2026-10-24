# @mdsvex/plugin-kit

Components most [mdsvex](https://mdsvex.pngwn.io) sites want: details, accordions, keys, ruby, badges, video embeds and figures, each written as a directive, code blocks with a copy button, and mermaid diagrams.

```bash
pnpm add --save-dev @mdsvex/plugin-kit@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { kit } from '@mdsvex/plugin-kit';

export default {
	plugins: [mdsvex({ plugins: [kit()] })],
};
```

It needs Svelte 5.20 or later. The directives load no script of their own, and each works without JavaScript.

| directive                          | renders                                            |
| ---------------------------------- | -------------------------------------------------- |
| `:::details[Summary]`              | a `<details>` with the bracket text as its summary |
| `:::accordion`                     | a `<details>` for each heading written inside it   |
| `:kbd[Ctrl]`                       | a `<kbd>`                                          |
| `:ruby[漢字](rt=かんじ)`           | a `<ruby>` with its reading                        |
| `:badge[new]`                      | a `<span class="badge">`, with an optional tone    |
| `::youtube[Title](id=dQw4w9WgXcQ)` | a YouTube player, named by its title               |
| `::vimeo[Title](id=76979871)`      | a Vimeo player, named by its title                 |

A document imports only the components it uses.

## Details

```md
:::details[Why _two_ builds?](open=true)

One for the server, one for the browser.

:::
```

```html
<details class="details" open>
	<summary class="details-summary">Why <strong>two</strong> builds?</summary>
	<div class="details-body">
		<p>One for the server, one for the browser.</p>
	</div>
</details>
```

- **The bracket text is the summary**, with its inline markup. Without it the browser writes its own, "Details" in the reader's language.
- **`(open=true)`** opens it on load. Any value but `false` does.
- **`(name=...)`** is the `name` of the element: of the details on a page that share a name, one is open at a time.

A `<details>` is a disclosure the browser already makes accessible: the summary is a button in the tab order that <kbd>Enter</kbd> and <kbd>Space</kbd> toggle, and screen readers announce whether it is expanded. Find in page opens one that holds what the reader searched for, in Chromium.

## Accordions

Each heading written directly inside `:::accordion` starts an item, a `details` with the text of the heading as its summary and what follows, up to the next such heading, as its body:

```md
:::accordion[Questions](name=faq)

## Is it free?

Yes.

## Does it work without JavaScript?

Every part of it.

:::
```

- **The first heading sets the depth.** A heading of any other depth is content of the item it is in. A heading in a block quote, a list or another directive starts no item.
- **A summary is not a heading in the page.** It gets no id from `heading_ids`, no anchor and no place in a table of contents, since a summary is read as a control, and some screen readers drop a heading inside one.
- **`(name=faq)`** gives every item that name, so opening one closes the one that was open. Two accordions with the same name on one page are one set, as two details with the same name are.
- **A `:::details` written directly inside is an item too**, and gets the name of the accordion unless it has its own.
- **`:::accordion[Questions]`** renders the bracket text in a `<p class="accordion-label">` above the items.

## Keys, ruby and badges

```md
Press :kbd[Ctrl]+:kbd[C] to copy. :ruby[漢字](rt=かんじ) is read _kanji_. :badge[new](tone=tip)
```

- **`:kbd[...]`** is a `<kbd class="kbd">`. Write a chord as one key after another.
- **`:ruby[base](rt=reading)`** is a `<ruby>` with the reading in `<rt>`, and the `<rp>` parentheses a browser without ruby shows around it.
- **`:badge[...]`** is a `<span class="badge">`. `(tone=note)`, `tip`, `warning` and `danger` tint it, and any other tone is a `data-tone` attribute for your own styles. A tone is only colour: write what the badge means in its text.

## Video embeds

```md
::youtube[A conference talk](id=dQw4w9WgXcQ, start=30)

::vimeo[A short film](id=76979871)
```

- **The bracket text is the title of the frame**, which is what a screen reader announces for it. An `{expression}` in it is left out, as it is not known until the page runs. `(title=...)` sets it instead.
- **`id`** is the id of the video, the part after `v=` or `youtu.be/` on YouTube and after `vimeo.com/` on Vimeo. **`start`** is a time in seconds.
- **The player loads lazily** (`loading="lazy"`), from `youtube-nocookie.com`, which sets no cookie until the video plays, and from Vimeo with `dnt=1`.
- **The frame fills the width at 16:9.** Set `aspect-ratio` on `.embed` to change it.

## Figures

`figures()` is a plugin of its own in the same package. It adds a `:::figure` directive, which puts anything written inside it, an image, a code block, a table or a diagram, in a `<figure>` with the bracket text as its caption:

```js
import { figures, kit } from '@mdsvex/plugin-kit';

mdsvex({ unwrap_images: true, plugins: [kit(), figures()] });
```

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

### Numbers

A figure is unnumbered on its own. A numbering plugin numbers it through [plugin data](https://mdsvex.pngwn.io/docs#plugin-data): when the data of the plugin named `numbering` has a key `target:` followed by the figure's id, such as `target:fig:sales`, holding `{ kind, number, text }`, the caption starts with its `text`. The component reads the data from Svelte context, so while a document streams the number appears once it arrives:

```html
<figcaption class="figure-caption">
	<span class="figure-number">Figure 3</span>: Sales by month, 2026
</figcaption>
```

A numbered figure with no caption has the number alone as its caption, `<figcaption><span class="figure-number">Figure 2</span></figcaption>`, and one with neither has no `<figcaption>`.

The component gets `label`, `children` and `id`. Export a `figure` from a directives module to replace it, or wrap the kit's, `@mdsvex/plugin-kit/Figure.svelte`. Leave the stylesheet out with `figures({ css: false })`.

## Code blocks

`code_blocks()` replaces `pre` with a code block that has a copy button:

```js
import { code_blocks } from '@mdsvex/plugin-kit';

mdsvex({ plugins: [code_blocks()] });
```

````md
```sh title="Install" caption="Then restart the dev server."
pnpm add mdsvex
```
````

```html
<div class="code-block" data-language="sh">
	<div class="code-block-title">Install</div>
	<div class="code-block-body">
		<div class="code-block-actions">
			<span class="code-block-status" role="status"></span>
			<button
				type="button"
				class="code-block-copy"
				aria-label="Copy code of Install"
			>
				Copy
			</button>
		</div>
		<pre class="twinkleplop language-sh">...</pre>
	</div>
	<div class="code-block-caption">Then restart the dev server.</div>
</div>
```

- **It copies the code a reader sees**, without code directives and with [live values](https://mdsvex.pngwn.io/docs#live-code) in place.
- **The button says what it copies.** Its name is "Copy code", or "Copy code of" and the title of the fence. It comes before the code, so it is reached first, and it sits over the top corner of the code.
- **The result is announced.** A `status` region next to the button reads "Copied", or "Copy failed" where the page has no clipboard, such as a page served over plain http. It clears after two seconds.
- **The title and caption of the fence** are rendered above and below the code. In a code group of `@mdsvex/plugin-tabs` the tab already shows the title, so the stylesheet hides it.
- **`nocopy` in the fence meta** leaves the button out of that block.
- **Without JavaScript** the stylesheet hides the button, which could not copy. This uses the `scripting` media query.

It wraps whatever renders the fence, the built in highlighter or your own. An export named `pre` from a `components` module or a template replaces this one. To build your own from it, it is exported as `@mdsvex/plugin-kit/Pre.svelte`. Leave the stylesheet out with `code_blocks({ css: false })`. The custom properties `--code-block-line` and `--code-block-radius` are read from `.code-block`.

## Mermaid diagrams

`mermaid()` draws each `mermaid` fence as a diagram in the browser. It needs the `mermaid` package, an optional peer dependency, so install it beside the kit:

```bash
pnpm add --save-dev mermaid
```

```js
import { mermaid } from '@mdsvex/plugin-kit';

mdsvex({ plugins: [mermaid()] });
```

````md
```mermaid title="How a page is built" caption="Each step runs once per file."
graph LR
  accTitle: How a page is built
  A[Markdown] --> B{Parse} --> C[Svelte]
```
````

```html
<figure class="mermaid">
	<figcaption class="mermaid-title">How a page is built</figcaption>
	<div class="mermaid-diagram">
		<svg role="graphics-document document" ...></svg>
	</div>
	<details class="mermaid-source">
		<summary>Diagram source</summary>
		<pre>...</pre>
	</details>
	<div class="mermaid-caption">Each step runs once per file.</div>
</figure>
```

- **The server renders the code**, as it renders any fence, through the highlighter and the `pre` of your site or of `code_blocks()`. Once the page has mounted, the component imports the mermaid library and draws the diagram in place of the code, which moves into a closed "Diagram source" disclosure. Without JavaScript the reader sees the code.
- **The library is loaded lazily**, on a page that has a diagram, and never on the server. Only `mermaid()` imports it, so a site that uses the rest of the kit without it does not need it installed.
- **A diagram that doesn't parse shows its code**, under "The diagram could not be drawn, its source follows.", and the error is logged in the console.
- **Name the diagram for screen readers** with mermaid's own `accTitle:` and `accDescr:` lines, which become the title and description of the SVG. The `title` of the fence is the caption of the figure.
- **The theme follows the reader's colour scheme**, `dark` or `default`. `mermaid({ theme: 'neutral' })` sets one for every diagram. Diagrams render with mermaid's `securityLevel: 'strict'`.
- **The fence is wrapped, not replaced.** The plugin puts each `mermaid` fence inside a `mermaid` directive, so it works with any `pre` and inside a code group of `@mdsvex/plugin-tabs`. The directive's component gets `code`, `title`, `caption` and `theme`, and is exported as `@mdsvex/plugin-kit/Mermaid.svelte` to use in a component of your own.

The built in highlighter has no grammar for mermaid, so the code renders plain and the build warns once per file that there is no highlighter for the language.

## What it warns about

The build reports these, with the line they are on, and still renders the page:

| code                        | when                                                              | what is rendered                                                                              |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `no_items`                  | a `:::accordion` with no heading and no details directly inside   | the content                                                                                   |
| `content_before_first_item` | anything written before the first heading of an accordion         | it stays above the items. Move it above the container, or into its brackets                   |
| `item_without_label`        | an empty heading in an accordion                                  | the summary the browser writes                                                                |
| `ruby_without_rt`           | a `:ruby` with no `rt`                                            | the base text without a reading                                                               |
| `embed_id`                  | a `::youtube` or `::vimeo` with no id, or one that is no id there | the player, which shows the site's own error, or the title as a paragraph when there is no id |
| `embed_without_title`       | an embed with nothing in its brackets and no `title`              | a frame named "YouTube video" or "Vimeo video"                                                |

## Styles

The components come with a small stylesheet. Every selector is inside `:where()`, so any rule of yours wins. The classes are `details`, `details-summary`, `details-body`, `accordion`, `accordion-label`, `kbd`, `ruby`, `badge`, `embed`, `embed-youtube`, `embed-vimeo`, from `figures()`, `figure`, `figure-caption` and `figure-number`, from `mermaid()`, `mermaid`, `mermaid-title`, `mermaid-diagram`, `mermaid-source`, `mermaid-error` and `mermaid-caption`, and from `code_blocks()`, `code-block`, `code-block-title`, `code-block-body`, `code-block-actions`, `code-block-status`, `code-block-copy` and `code-block-caption`, and these custom properties are read:

| property         | on                       | default                                    |
| ---------------- | ------------------------ | ------------------------------------------ |
| `--kit-line`     | `.details`, `.accordion` | the text colour at 20%                     |
| `--kit-radius`   | `.details`, `.accordion` | `0.375rem`                                 |
| `--kit-padding`  | `.details`, `.accordion` | `0.5rem 0.75rem`                           |
| `--kit-kbd-line` | `.kbd`                   | the text colour at 30%                     |
| `--badge-color`  | `.badge`                 | the text colour, or the colour of its tone |

To leave the stylesheet out:

```js
kit({ css: false });
```

The markup and class names stay the same. The stylesheet is also exported as `@mdsvex/plugin-kit/kit.css`, to copy from or to import where you choose.

## Your own components

Export a component under the name of a directive from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the kit's. The plugin still splits accordions and names embeds, so yours gets the same props:

| directive   | props                                   |
| ----------- | --------------------------------------- |
| `details`   | `label`, `children`, `open`, `name`     |
| `accordion` | `label`, `children` (the items), `name` |
| `kbd`       | `children`                              |
| `ruby`      | `children`, `rt`                        |
| `badge`     | `children`, `tone`                      |
| `youtube`   | `label`, `id`, `title`, `start`         |
| `vimeo`     | `label`, `id`, `title`, `start`         |

Every prop but `label` and `children` is a string. Each component is also exported on its own, to wrap:

```js
import Details from '@mdsvex/plugin-kit/Details.svelte';
```

## How it is packaged

The components are shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too.

With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-kit/directives` (or `/directives/unstyled`), and your bundler needs a Svelte plugin to resolve it.
