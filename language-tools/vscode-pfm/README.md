# mdsvex for VS Code

Language support for [mdsvex](https://github.com/pngwn/MDsveX) documents, the `.pfm` and `.svx` files written in PFM (Penguin-Flavoured Markdown).

- Highlighting that follows the parser: marks, tables, footnotes, math, directives, Svelte tags and code fences in their own language.
- Errors and warnings from the mdsvex compiler, where they are written.
- Completions, hover and go to definition in the script, in Svelte expressions and for directive arguments.
- `.pfm` and `.svx` imports typed in TypeScript and Svelte files, through `@mdsvex/typescript-plugin`.

With an `mdsvex.config.json` in the project, the editor reads templates, components and plugins the way the build does.

## Migrating from mdsvex 0.x

**mdsvex: Migrate File from mdsvex 0.x** in the command palette migrates the file in the editor, as `npx @mdsvex/migrate <file>` would. Undo puts it back.

- A `.md` or `.svx` document is written as PFM.
- A config, `.js` or `.ts`, has its `layout`, `highlight`, `smartypants`, `extension` and plugin options rewritten.
- A `.svelte` layout is checked for what a template needs changed, and never rewritten.

What to check by hand is listed in the **mdsvex migrate** output panel, at its line in the file before the migration. Set `mdsvex.migrate.smartypants` to your 0.x `smartypants` option, `true` if your config never set it, and `mdsvex.migrate.math` to `true` if you used `remark-math`, and documents are rewritten to render as they did.

Report bugs and requests at [pngwn/MDsveX](https://github.com/pngwn/MDsveX/issues).
