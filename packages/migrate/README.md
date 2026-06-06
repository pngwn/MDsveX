# @mdsvex/migrate

Migrate **CommonMark / GFM** markdown to **Penguin-Flavoured Markdown (PFM)**.

The source document is parsed with the [remark](https://github.com/remarkjs/remark)
(unified) ecosystem into an `mdast` tree, then re-serialised under PFM's rules.

## Usage

```ts
import { migrate } from "@mdsvex/migrate";

const pfm = migrate("Hello\n=====\n\nSome *emphasis* and **strength**.");
// # Hello
//
// Some _emphasis_ and *strength*.
```

### Options

```ts
migrate(source, {
	bullet: "-", // unordered list marker: "-" (default), "+" or "*"
});
```

## What it changes

| CommonMark / GFM                       | PFM output                                            |
| -------------------------------------- | ----------------------------------------------------- |
| Setext headings (`===` / `---`)        | ATX headings (`#`)                                    |
| Indented code blocks                   | Fenced code blocks                                    |
| `*emph*` / `_emph_`                    | `_emph_` (emphasis is always `_`)                     |
| `**strong**` / `__strong__`            | `*strong*` (strong is always `*`)                     |
| Trailing-space hard breaks             | Backslash hard breaks (`\`)                           |
| Lazy blockquote continuation           | Every line explicitly prefixed with `>`               |
| Shortcut references (`[ref]`)          | Explicit collapsed references (`[ref][]`)             |
| Reference definitions                  | Hoisted to the top so they precede every use          |
| GFM tables, strikethrough, task lists  | Preserved                                             |

Superscript, subscript and the PFM table extensions have no CommonMark
equivalent, so nothing maps onto them; raw HTML is passed through untouched.

## Notes

- Reference **definitions are hoisted** to the top of the document, because PFM
  forbids forward references — a definition must appear before its first use.
- Migrated output is round-trip validated against [`@mdsvex/parse`](../parse) in
  the test suite to guarantee it is valid PFM.
