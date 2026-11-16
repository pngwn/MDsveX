# PFM for VS Code

Language support for [mdsvex](https://github.com/pngwn/MDsveX) documents, the `.pfm` and `.svx` files written in PFM (Penguin-Flavoured Markdown).

- Highlighting that follows the parser: marks, tables, footnotes, math, directives, Svelte tags and code fences in their own language.
- Errors and warnings from the mdsvex compiler, where they are written.
- Completions, hover and go to definition in the script, in Svelte expressions and for directive arguments.
- `.pfm` and `.svx` imports typed in TypeScript and Svelte files, through `@mdsvex/typescript-plugin`.

With an `mdsvex.config.json` in the project, the editor reads templates, components and plugins the way the build does.

Report bugs and requests at [pngwn/MDsveX](https://github.com/pngwn/MDsveX/issues).
