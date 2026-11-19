# @mdsvex/plugin-elements

Directives for [mdsvex](https://mdsvex.pngwn.io) over plain HTML elements: details, accordions, keys, ruby, badges, marks, insertions and abbreviations.

```bash
pnpm add --save-dev @mdsvex/plugin-elements@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { elements } from '@mdsvex/plugin-elements';

export default {
	plugins: [mdsvex({ plugins: [elements()] })],
};
```

It needs Svelte 5. No component loads a script, and each works without JavaScript. For video players see [`@mdsvex/plugin-embeds`](../embeds).

| directive                | renders                                            |
| ------------------------ | -------------------------------------------------- |
| `:::details[Summary]`    | a `<details>` with the bracket text as its summary |
| `:::accordion`           | a `<details>` for each heading written inside it   |
| `:kbd[Ctrl]`             | a `<kbd>`                                          |
| `:ruby[漢字](rt=かんじ)` | a `<ruby>` with its reading                        |
| `:badge[new]`            | a `<span class="badge">`, with an optional tone    |
| `:mark[text]`            | a `<mark>`                                         |
| `:ins[text]`             | an `<ins>`, with an optional `datetime` and `cite` |
| `:abbr[HTML](title=...)` | an `<abbr>` with its expansion as the `title`      |

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

## Marks, insertions and abbreviations

```md
The build is :mark[twice as fast].

:ins[It needs Node 22.](datetime=2026-10-28)

:abbr[CSS](title="Cascading Style Sheets") styles it.
```

```html
<p>The build is <mark class="mark">twice as fast</mark>.</p>
<p><ins class="ins" datetime="2026-10-28">It needs Node 22.</ins></p>
<p><abbr class="abbr" title="Cascading Style Sheets">CSS</abbr> styles it.</p>
```

- **`:mark[...]`** is a `<mark class="mark">`, text highlighted for its relevance.
- **`:ins[...]`** is an `<ins class="ins">`, text added to the document. `(datetime=...)` is when, as a date or a date and time, and `(cite=...)` a url that says why. Both are the attributes of the element.
- **`:abbr[...](title=...)`** is an `<abbr class="abbr">` with what it stands for in `title`. A title with a space or a comma in it needs quotes, without them the args are text and the build warns.

Most screen readers read a `<mark>` or an `<ins>` as plain text and say nothing of the highlight or the insertion, so the text itself has to carry what matters, as with a badge. Nothing is hidden in the page to announce them. A `title` is shown on hover with a mouse, and only some screen readers read it, so spell out an abbreviation in the text the first time it is used when the reader needs it.

## What it warns about

The build reports these, with the line they are on, and still renders the page:

| code                        | when                                                            | what is rendered                                                            |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `no_items`                  | a `:::accordion` with no heading and no details directly inside | the content                                                                 |
| `content_before_first_item` | anything written before the first heading of an accordion       | it stays above the items. Move it above the container, or into its brackets |
| `item_without_label`        | an empty heading in an accordion                                | the summary the browser writes                                              |
| `ruby_without_rt`           | a `:ruby` with no `rt`                                          | the base text without a reading                                             |
| `abbr_without_title`        | an `:abbr` with no `title`                                      | the text without an expansion                                               |

## Styles

The components come with a small stylesheet. Every selector is inside `:where()`, so any rule of yours wins. The classes are `details`, `details-summary`, `details-body`, `accordion`, `accordion-label`, `kbd`, `ruby`, `badge`, `mark`, `ins` and `abbr`, and these custom properties are read:

| property             | on                       | default                                    |
| -------------------- | ------------------------ | ------------------------------------------ |
| `--elements-line`    | `.details`, `.accordion` | the text colour at 20%                     |
| `--elements-radius`  | `.details`, `.accordion` | `0.375rem`                                 |
| `--elements-padding` | `.details`, `.accordion` | `0.5rem 0.75rem`                           |
| `--kbd-line`         | `.kbd`                   | the text colour at 30%                     |
| `--badge-color`      | `.badge`                 | the text colour, or the colour of its tone |
| `--mark-color`       | `.mark`                  | `#d4a72c`, as a tint behind the text       |

A mark keeps the colour of the text, so it reads on a dark page too. An insertion and an abbreviation look as the browser draws them, underlined and dotted.

To leave the stylesheet out:

```js
elements({ css: false });
```

The markup and class names stay the same. The stylesheet is also exported as `@mdsvex/plugin-elements/elements.css`, to copy from or to import where you choose.

## Your own components

Export a component under the name of a directive from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the plugin's. The plugin still splits accordions, so yours gets the same props:

| directive   | props                                   |
| ----------- | --------------------------------------- |
| `details`   | `label`, `children`, `open`, `name`     |
| `accordion` | `label`, `children` (the items), `name` |
| `kbd`       | `children`                              |
| `ruby`      | `children`, `rt`                        |
| `badge`     | `children`, `tone`                      |
| `mark`      | `children`                              |
| `ins`       | `children`, `datetime`, `cite`          |
| `abbr`      | `children`, `title`                     |

Every prop but `label` and `children` is a string. Each component is also exported on its own, to wrap:

```js
import Details from '@mdsvex/plugin-elements/Details.svelte';
```

## How it is packaged

The components are shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too.

With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-elements/directives` (or `/directives/unstyled`), and your bundler needs a Svelte plugin to resolve it.
