---
'@mdsvex/parse': minor
'mdsvex': minor
---

A link reference no longer needs its definition above it. `[text][ref]`, `[ref][]` and `![alt][ref]` are a link or an image by their syntax alone, as a footnote reference is, and the definition supplies the url wherever it is written:

```md
See [the guide][guide].

[guide]: https://example.com/guide
```

A reference with no definition used to stay literal text. It is now a link with no `href`, and in mdsvex a `LinkReferenceError` with the line of the reference. Two pairs of brackets in prose that are not a reference, `m[0][1]`, are escaped as `m\[0][1]` or put in code.

On the wire the `href` or `src` of a reference whose definition comes later arrives as an attr on a node that has closed. `undefined_references` in `@mdsvex/parse/buf-utils` lists the references of a tree that have no definition.
