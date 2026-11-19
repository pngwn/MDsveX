---
'mdsvex': minor
---

With SvelteKit 3, the `mdsvex()` Vite plugin registers its extensions with SvelteKit, so they no longer need repeating in `sveltekit({ extensions })`.

```js
export default defineConfig({
	plugins: [mdsvex({ extensions: ['.svx'] }), sveltekit()],
});
```

Without SvelteKit, the build fails with an error naming the missing extensions until they are added to `svelte({ extensions })`.
