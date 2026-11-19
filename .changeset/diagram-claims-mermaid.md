---
'@mdsvex/plugin-diagram': minor
---

`diagram()` claims the `mermaid` language, so the build no longer warns once per file that there is no highlighter for it, with either engine. The highlighter never sees a mermaid fence, so the diagram's source renders as a plain `<pre><code class="language-mermaid">`, as it does with `highlight: false`, rather than an empty twinkleplop block.
