# mdsvex

A Markdown preprocessor for Svelte. Markdown in Svelte.

[mdsvex.com](https://mdsvex.com)

## Packages

This is a monorepo. `next` is the development branch, and holds a rewrite that is published under the `next` tag on npm.

- [`mdsvex`](https://github.com/pngwn/MDsveX/tree/next/packages/mdsvex), the compiler and the Vite plugin.
- [`@mdsvex/parse`](https://github.com/pngwn/MDsveX/tree/next/packages/parse), the markdown parser. The markdown it reads is described in [`PFM.md`](https://github.com/pngwn/MDsveX/blob/next/PFM.md).
- [`@mdsvex/render`](https://github.com/pngwn/MDsveX/tree/next/packages/render), the renderer.
- [`@mdsvex/migrate`](https://github.com/pngwn/MDsveX/tree/next/packages/migrate), which moves a project from mdsvex 0.x.
- [`plugins`](https://github.com/pngwn/MDsveX/tree/next/plugins), the first-party plugins, each an `@mdsvex/plugin-*` package.
- [`language-tools`](https://github.com/pngwn/MDsveX/tree/next/language-tools), the language server, the TypeScript plugin and the VS Code extension.
- [`site`](https://github.com/pngwn/MDsveX/tree/next/packages/site), the documentation website and the playground.

## Contributing

Contributions are welcome. This repo uses [changesets](https://github.com/atlassian/changesets) to manage changelogs and versioning. All pull requests need an accompanying changeset file (PRs to the documentation website do not need a changeset file). If you know how changesets work then feel free to add one with the appropriate packages, versions and a description of the change. If you don't know how changesets work, don't worry about it, I am happy to add one (a little robot will also add some details to the PR when you open it as well, if you want to learn more).
