# MDsveX

_do ya think I'm svexy?_

A markdown preprocessor for Svelte components. Basically [MDX](https://github.com/mdx-js/mdx) for Svelte.

This preprocessor allows you use Svelte components in your markdown, or markdown in your svelte components.

[Try it](https://mdsvex.com/)

You can do this:

```jsx
<script>
  import { Chart } from '../components/Chart.svelte';
</script>

# Here’s a chart

The chart is rendered inside our MDsveX document.

<Chart />
```

## Install

mdsvex 1.0 is a rewrite with its own markdown parser. It needs Svelte 5 and Vite 6 or later.

```bash
npm i --save-dev mdsvex
```

mdsvex is a Vite plugin:

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [mdsvex({ extensions: ['.svx', '.md'] }), sveltekit()]
});
```

Coming from mdsvex 0.x, [`@mdsvex/migrate`](https://www.npmjs.com/package/@mdsvex/migrate) rewrites your config and your documents.

The documentation is at https://mdsvex.com/.
