---
'@mdsvex/parse': minor
---

A tree built by `TreeBuilder` while a document streams can show the line that is still being written. Call `show_open_text` after a feed and `hide_open_text` before the next one.

```ts
const tree = new TreeBuilder(128);
const parser = new PFMParser(tree);
parser.init();

for await (const chunk of chunks) {
	source += chunk;
	tree.hide_open_text();
	parser.feed(chunk);
	tree.show_open_text(source);
	render(tree.get_buffer(), source);
}
```
