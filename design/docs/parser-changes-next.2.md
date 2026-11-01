## Parser changes on `next`

`1.0.0-next.2` reads some documents differently from `1.0.0-next.1`. If you are already on `next`, these are the changes that can show in your pages. Each is how the parser was meant to behave, and none has an option.

### Every container holds the same blocks

A block quote, a list item, an HTML element, a Svelte block and a container directive now hold whatever the document can hold. Before, several blocks were only read at the top level and came out as text inside a container.

```svx
> | a | b |
> | --- | --- |
> | 1 | 2 |
```

```html
<!-- before -->
<blockquote><p> a  b --- --- 1  2 </p></blockquote>

<!-- after -->
<blockquote><table>…</table></blockquote>
```

```svx
- {#if show}
  text
  {/if}
```

```svelte
<!-- before -->
<li>{#if show} text {/if}</li>

<!-- after -->
<li>{#if show}<p>text</p>{/if}</li>
```

The same goes for a block quote or a directive inside a `<div>`, a list item that ends a quoted paragraph, and a link reference definition in a quote or a list item.

### A pipe outside a table is text

Every `|` in a paragraph used to be dropped.

```svx
one | two | three
```

```html
<!-- before -->
<p>one  two  three</p>

<!-- after -->
<p>one | two | three</p>
```

A `|` directly beside a `_`, `*` or `~` is still the [intraword marker](https://mdsvex.pngwn.io/docs/learn/markdown#different-from-commonmark) and is not rendered.

### `<pre>` and `<textarea>` hold text

Their content was parsed as markdown. Now it is kept as written, as the content of `<script>` and `<style>` is.

```svx
<pre>
line one
  indented *x*

# line three
</pre>
```

```html
<!-- before -->
<pre><p>line one indented <strong>x</strong></p><h1>line three</h1></pre>

<!-- after -->
<pre>
line one
  indented *x*

# line three
</pre>
```

Expressions and elements inside still work, since the text goes to Svelte as it is. A `<pre>` that starts a line is now a block, so it ends a paragraph or a table above it.

### A block level element at the start of a line is a block

Text after its close tag used to sit bare beside it. Now that text starts a paragraph.

```svx
<div>one</div> two
```

```html
<!-- before -->
<div>one</div> two

<!-- after -->
<div>one</div><p>two</p>
```

An inline element such as `<b>` that starts a line starts a paragraph, also when it closes on a later line. Later in a line, a block level element no longer takes the `<p>` off its paragraph, so `<Badge /> <div>a</div> text` is one paragraph.

### A NUL is text, and a stall throws

A NUL character in a document stopped the parse, and everything after it was missing. It is now a character like any other.

A parse that stops moving through its input used to log `Infinite loop detected` and return a tree cut short. It now throws a `ParseStallError` with the `offset` it stopped at, so a build fails where it used to publish half a page. If you see one, it is a bug in the parser, please report the document.

### A fence closes only at a line of backticks

A line with anything after the backticks used to close the fence and lose that text. It is now a line of code, as in CommonMark.

````svx
```md
```js
let x;
```
````

```html
<!-- before -->
<pre><code class="language-md"></code></pre><p>let x;</p><pre><code></code></pre>

<!-- after -->
<pre><code class="language-md">```js
let x;</code></pre>
```

### A backslash before another block is a backslash

A backslash at the end of a line is a hard break only when the next line carries on the paragraph. Before a blank line, the end of the document or a line that starts another block, it used to make a break, and the block after it became text.

```svx
a\
# b
```

```html
<!-- before -->
<p>a<br /> # b</p>

<!-- after -->
<p>a\</p><h1>b</h1>
```

### `[^label]` is a footnote

Footnotes are read now. A `[^1]` in the text is a reference, and a line that starts `[^1]:` is its definition. Both were plain text.

```svx
Text[^1].

[^1]: A note.
```

```html
<!-- before -->
<p>Text[^1].</p><p>[^1]: A note.</p>

<!-- after -->
<p>Text<sup><a href="#fn-1" id="fnref-1" role="doc-noteref">1</a></sup>.</p>
<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">…</section>
```

A reference with no definition fails the build. So a `[^…]` in prose that was never a footnote, such as the regular expression class `[^abc]`, now stops the compile with a `FootnoteError`. Escape it as `\[^abc]` or put it in code. See [footnotes](https://mdsvex.pngwn.io/docs/reference/footnotes).

### Smaller changes

| you write | before | after |
| --- | --- | --- |
| `a \{1 + 1\} b` | an expression, `a 2 b` | the text `a {1 + 1} b` |
| `[a](/u\)b "t \" u")` | the backslashes stayed in the url and the title | `href="/u)b"` and `title="t &quot; u"` |
| `<div class="a" class="b">` | the first `class` was dropped | both are written, and Svelte reports the duplicate |
| an open tag over several lines, or `</a` and `>` on two lines | text | a tag |
| `<!-- note --> some text` | the comment, then a paragraph | one paragraph that holds both |
| `> _foo` then `> > bar_` | emphasis across the two quotes | `_foo`, then a quote with `bar_` |
| a code span over two lines of a block quote | the `>` of the second line was in the code | it is not |
| `- [x] done` | the text `[x] done` | a [task list](https://mdsvex.pngwn.io/docs/learn/markdown#task-lists) item |
| `这是*重要*的`, `“*quoted*”` | text | strong |
| `::toc`, `:::note` | text | a [directive](https://mdsvex.pngwn.io/docs/guides/directives#the-three-forms), write `\::toc` for the text |
| `---` with spaces after it, around frontmatter | a thematic break | the frontmatter fence |
| `import {` over several lines | the first line only | the whole import |
