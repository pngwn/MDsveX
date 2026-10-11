# @mdsvex/plugin-steps

Numbered steps for [mdsvex](https://mdsvex.pngwn.io). Each heading inside a `:::steps[]` container starts a step.

```bash
pnpm add --save-dev @mdsvex/plugin-steps@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { steps } from '@mdsvex/plugin-steps';

export default {
	plugins: [mdsvex({ plugins: [steps()] })],
};
```

````md
:::steps[]

## Install

```sh
pnpm add mdsvex
```

## Configure

Add it to the config.

:::
````

```html
<ol class="steps" role="list">
	<li class="step">
		<div class="step-title"><h2>Install</h2></div>
		<div class="step-body"><pre>...</pre></div>
	</li>
	<li class="step">
		<div class="step-title"><h2>Configure</h2></div>
		<div class="step-body"><p>Add it to the config.</p></div>
	</li>
</ol>
```

## Which headings start a step

- **The first heading written directly inside the container sets the depth.** If it is a `##`, every `##` directly inside starts a step. A heading of any other depth, deeper or shallower, is content of the step it is in.
- **`(level=3)` names the depth instead**: `:::steps[](level=3)` splits on `###` whatever the first heading is. A value that is not 1 to 6 is ignored.
- **Only headings written directly inside count.** A heading in a block quote, a list or another directive starts no step.
- **Content before the first heading is in no step.** It stays at the top of the list, where only list items belong. Put an introduction above the container, or in its brackets: `:::steps[Set up a project]` renders the text in a `<p class="steps-label">` ahead of the list.
- **A container with no headings** is a list with no steps in it.

Steps nest when the outer container uses more colons, and each container has its own depth and its own count:

```md
::::steps[]

## Write

:::steps[]

### Open a container

### Add headings

:::

::::
```

A step can also be written out, beside the ones headings make:

```md
::::steps[]

:::step[Install]
Run the installer.
:::

::::
```

The titles are still headings, so `heading_ids` and `@mdsvex/plugin-anchors` reach them.

## Styles

The components come with a small stylesheet. It hides the list markers and draws each number from a CSS counter, so nothing counts at runtime. Every selector is inside `:where()`, so any rule of yours wins, and these custom properties are read from `.steps`:

| property                    | default                |
| --------------------------- | ---------------------- |
| `--steps-marker-size`       | `1.75rem`              |
| `--steps-gap`               | `0.75rem`              |
| `--steps-marker-color`      | `inherit`              |
| `--steps-marker-background` | the text colour at 12% |
| `--steps-line`              | the text colour at 20% |

To leave it out:

```js
steps({ css: false });
```

The markup and class names stay the same, and without styles it is a plain numbered list. The stylesheet is also exported as `@mdsvex/plugin-steps/steps.css`, to copy from or to import where you choose.

## Your own components

Export a `steps` or a `step` from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the plugin's component. The plugin still splits the container, so yours gets the same props:

| prop       | `steps`                                              | `step`                   |
| ---------- | ---------------------------------------------------- | ------------------------ |
| `label`    | the bracket text of the container, when there is any | the heading              |
| `children` | the steps                                            | what follows the heading |

```svelte
<!-- src/lib/Step.svelte -->
<script>
	let { label, children } = $props();
</script>

<li class="step">
	<header>{@render label?.()}</header>
	{@render children?.()}
</li>
```

```js
// src/lib/directives.js
export { default as step } from './Step.svelte';
```

The plugin's components can be imported, to wrap one in yours:

```js
import Steps from '@mdsvex/plugin-steps/Steps.svelte';
import Step from '@mdsvex/plugin-steps/Step.svelte';
```

## How it is packaged

The components are shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too.

With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-steps/directives` (or `/directives/unstyled`), and your bundler needs a Svelte plugin to resolve it.
