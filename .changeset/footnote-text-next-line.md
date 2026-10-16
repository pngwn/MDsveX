---
'@mdsvex/parse': patch
'mdsvex': patch
'vscode-pfm': patch
---

A footnote definition may start its text on the next line, indented by four spaces, which is how Prettier formats a long one. It is the same footnote as one written with its text after the label:

```md
[^1]:
    To add line breaks within a footnote,
    add a second line.
```

A definition with no text, `[^1]:` with no indented line after it, fails the build with a `FootnoteError` whose code is `footnote_empty`.
