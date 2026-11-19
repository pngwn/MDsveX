---
'mdsvex': minor
'@mdsvex/render': minor
---

Code blocks can hold live Svelte expressions. An `[!eval]` comment makes every top-level `{...}` group in its range live, and everything else stays text:

````md
```sh
{install_command} @pkg/my-pkg # [!eval]
```

```js
function my_func() {
	console.log({ a: {some_val} }) // [!eval ="{some_val}"]
}
```
````

`[!eval]` takes every twinkleplop argument form: bare for its own line, `+N`, `:N..M`, `="{x}"` with an optional `:*`, anchors and pairs. It is on by default and part of `default_annotations`. Values come from the document's script and `metadata` and render as text, so use `{@html}` for markup. A group that doesn't close on its line, or a block tag such as `{#if}`, fails the build with its line and column.

The `eval` fence flag means `[!eval]` on every line, on any fence, including ```` ```eval ```` for a fence with no language. It suits commands and config rather than brace-heavy code. A custom highlighter doesn't support it yet and warns.

A replaced `pre` gets `code` as a template literal with the live values in it, such as ``code={`${install_command} @pkg/my-pkg`}``, so a copy button copies what the reader sees. Each live expression gets its own source mapping.
