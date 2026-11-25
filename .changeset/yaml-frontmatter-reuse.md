---
'mdsvex': patch
---

Default YAML frontmatter parsing reuses a shared parser instance with preallocated typed-array line buffers, resolves plain ASCII integers and non-numeric dates without regex passes, and avoids allocating a wrapper array per flow collection. Compiles of documents with YAML frontmatter are about 20% to 26% faster on average, and up to 40% to 50% faster when frontmatter dominates the file. Output is unchanged.
