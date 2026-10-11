---
'@mdsvex/parse': patch
---

A paragraph that starts at a tag, a component or a `{@...}` tag now decides its `<p>` from the elements that are really open in it. A tag that stays literal text counts as text, and a close tag closes the last open element of its name and everything opened inside it:

- An element that never closes keeps its line in one `<p>`, as in the input below. Before, the `<p>` held only the literal open tag and the rest of the line was left outside it. A block level tag that never closes, as in `<Chart /> <div>new`, is literal text too and no longer unwraps the paragraph.
- A close tag that closes nothing is text, so `<Chart /></b>` and a quoted `> </b>` get a `<p>`. Before, the close tag was left outside any paragraph. Tags closed in the wrong order end in such a close tag: in `<a><span>x</a></span>` the `</a>` closes both elements and the `</span>` is text, so that line now gets a `<p>`.
- A close tag that closes two elements leaves neither open, so `<Chart /><b><i></b>` gets no `<p>`, as `<b><i></b>` alone on its line already had none. The same holds when the close tag of a surrounding element closes them.

```md
<Chart /> <b>new</i>
```

This renders `<p><Chart /> &lt;b&gt;new&lt;/i&gt;</p>`. It used to render `<Chart /> <p>&lt;b&gt;</p>new&lt;/i&gt;`.
