---
'@mdsvex/parse': minor
---

Add named argument lists to generic directives (`:name[text](key=val, key2=val2)`) for inline, leaf, and container forms. Empty lists (`()`) are allowed but ignored; malformed lists degrade to literal text (inline) or a paragraph (block). The `[content]` brackets are now required for all directive forms - empty text must be explicit (`::name[]`). Directive text accepts simple inline constructs (emphasis, code spans, strikethrough, superscript, subscript) but links, images, and autolinks stay literal text, and unescaped square brackets must balance.
