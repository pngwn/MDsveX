# @mdsvex/plugin-code-blocks

Code blocks for [mdsvex](https://mdsvex.pngwn.io): a replaced `pre` with a copy button that says what it copies and announces the result, the title of the fence above the code and its caption below.

```bash
pnpm add --save-dev @mdsvex/plugin-code-blocks@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { code_blocks } from '@mdsvex/plugin-code-blocks';

export default {
	plugins: [mdsvex({ plugins: [code_blocks()] })],
};
```

It needs Svelte 5.

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

It wraps whatever renders the fence, the built in highlighter or your own. An export named `pre` from a `components` module or a template replaces this one. To build your own from it, it is exported as `@mdsvex/plugin-code-blocks/Pre.svelte`. Leave the stylesheet out with `code_blocks({ css: false })`. The custom properties `--code-block-line` and `--code-block-radius` are read from `.code-block`.

## How it is packaged

The component is shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too. With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-code-blocks/components`, and your bundler needs a Svelte plugin to resolve it.
