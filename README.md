# mdsvex

A Markdown preprocessor for Svelte. Markdown in Svelte.

[mdsvex.com](https://mdsvex.com)



## Packages

This is a monorepo containing `mdsvex` and any supporting packages. Each repo has it's own readme with more details.

- [site](https://github.com/pngwn/MDsveX/tree/master/packages/site) - The documentation website.
- [mdsvex](https://github.com/pngwn/MDsveX/tree/master/packages/mdsvex) - `mdsvex` itself.
- [svelte-parse](https://github.com/pngwn/MDsveX/tree/master/packages/svelte-parse) - Generate a svast AST from a Svelte components.
- [svast](https://github.com/pngwn/MDsveX/tree/master/packages/svast) - An AST specification with accompanying TypeScript definitions.
- [svast-stringify](https://github.com/pngwn/MDsveX/tree/master/packages/svast-stringify) - Turn a svast AST into a Svelte component.
- [svast-utils](https://github.com/pngwn/MDsveX/tree/master/packages/svast-utils) - Utilities for working with a svast tree.



## Contributing

Contributions are welcome. This repo uses [changesets](https://github.com/atlassian/changesets) to manage changelogs and versioning. All pull requests need an accompanying changeset file (PRs to the documentation website do not need a changeset file). If you know how changesets work then feel free to add one with the appropriate packages, versions and a description of the change. If you don't know how changesets work, don't worry about it, I am happy to add one (a little robot will also add some details to the PR when you open it as well, if you want to learn more).
