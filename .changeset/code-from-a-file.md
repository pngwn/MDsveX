---
'mdsvex': minor
---

A fence shows a file with `src=`. The path resolves as an import from the document would, `#L5-L20` picks lines, and a fence with no language takes it from the file name. The file is highlighted like any code, a replaced `pre` gets `src` as a prop, and in dev saving the file updates every page that shows it. A file that is missing, a slice past the end of the file, and a fence with `src=` and code of its own each fail the build at the fence.

````md
```ts src=./math.ts#L5-L20
```
````

`compile()` takes the text of each file in `sources`, and throws a `SourceError` for a file that is not there.

```js
compile(source, { sources: { './math.ts': text } });
```
