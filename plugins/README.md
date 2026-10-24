# First-party plugins

Each directory here is one npm package, `@mdsvex/plugin-<name>`, that exports a function returning a plugin for the `plugins` option of `mdsvex()` and `compile()`.

| package                         | directory                            | what it adds                                                                        |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `@mdsvex/plugin-steps`          | [`steps`](./steps)                   | numbered steps, one for each heading inside `:::steps`                              |
| `@mdsvex/plugin-tabs`           | [`tabs`](./tabs)                     | tabs and code groups, one tab for each heading or fence inside `:::tabs`            |
| `@mdsvex/plugin-kit`            | [`kit`](./kit)                       | directives for details, accordions, keys, ruby, badges and embeds, and figures      |
| `@mdsvex/plugin-anchors`        | [`anchors`](./anchors)               | a link to itself on every heading that has an id                                    |
| `@mdsvex/plugin-external-links` | [`external-links`](./external-links) | `rel` and `target` on every link that leaves the site                               |
| `@mdsvex/plugin-toc`            | [`toc`](./toc)                       | the headings of a document as data, and a `::toc` that lists them                   |
| `@mdsvex/plugin-page-data`      | [`page-data`](./page-data)           | a reading time, an excerpt, an inferred title, an edit url and a last modified date |
| `@mdsvex/plugin-emoji`          | [`emoji`](./emoji)                   | emoji shortcodes, `:tada:` becomes the emoji, with an optional label                |
| `@mdsvex/plugin-references`     | [`references`](./references)         | links for `@user`, `#123`, `owner/repo#123`, commits and bare urls                  |
| `@mdsvex/plugin-citations`      | [`citations`](./citations)           | `:cite[key]` from a CSL JSON bibliography, and a `::bibliography` that lists them   |

The other files in this directory are the audit of the remark and rehype plugins these replace. [`PLUGIN_AUDIT.md`](./PLUGIN_AUDIT.md) says, for each thing those plugins did, whether mdsvex has it and where.

## Adding a plugin

Copy [`anchors`](./anchors) for a plugin that is only handlers, or [`steps`](./steps) for one that ships Svelte components. Change the name, description, `repository.directory` and keywords in `package.json`, set the version to `0.0.1`, and add a row above and a section to the Plugins part of `packages/site/src/routes/_docs.svtext`. The workspace, the root build, the root test run, preview builds, dependabot and the release already cover `plugins/*`, so nothing outside the new directory needs wiring.

### What every plugin package has

- **`src/index.ts`** exports one function named after the plugin, which takes an options object and returns a `Bundle`.
- **`mdsvex` is a peer dependency with an explicit range**, such as `^1.0.0-next.2`, and a dev dependency, `workspace:^`. The floor of the range is the first mdsvex release that has what the plugin uses, and is raised by hand when the plugin starts needing a newer mdsvex feature. It is not `workspace:^` because changesets gives a package a major bump whenever a workspace peer of it gets a minor, and with `bumpVersionsWithWorkspaceProtocolOnly` it leaves a range written out alone. Types come from `mdsvex` (`Bundle`, `NodeView`, `DirectiveContext`, `ParsePlugin`), never from a path into another package's `src`, and never from `@mdsvex/parse` directly, which the user did not install.
- **`exports` points into `dist`**, and `files` is `["dist"]`. The root entry has a `default` condition, because a `vite.config.js` imports it in Node.
- **Tests import the package by its name**, which resolves through `exports` to `dist`, so build before testing. `pnpm test:run` at the root does both. To run one package:

```bash
pnpm --filter @mdsvex/plugin-anchors build
```

```bash
pnpm --filter @mdsvex/plugin-anchors test:run
```

- **`../test/app.ts`** writes a throwaway app with the package copied into its `node_modules` as npm would publish it (`package.json` and what `files` lists). Use it to check that what is published is what `exports` names, and to run a dev server against the installed package.
- **A handler reports and hands data back through its context**: `ctx.warn` for a problem in the document, `ctx.set` and `ctx.add` for what a page will want, such as a table of contents. Both are in The Context of [`packages/parse/PLUGINS.md`](../packages/parse/PLUGINS.md), with what a revoke takes back.
- **The tree a handler builds is tested on every parser path** with `expect_parity` from `packages/parse/test/plugin_harness.ts`: both builders, whole and fed in chunks.
- **A `README.md`** with install and usage, and a changeset for every change a user can see.

### Only handlers

Built like `@mdsvex/parse` and `mdsvex`: `tsc` into `tsc/`, then `vite build --config vite.config.build.ts` into `dist/`, then the declarations are copied over. Entry points are listed by hand in `vite.config.build.ts` and in `exports`. `mdsvex`, `@mdsvex/*` and `svelte` are external.

### With Svelte components

Built with [`svelte-package`](https://svelte.dev/docs/kit/packaging), after `tsc` has checked the types. It writes each file of `src` to `dist`: TypeScript becomes JavaScript with declarations, and `.svelte` and `.css` files are copied as they are, with a `.svelte.d.ts` beside each component. The components are compiled by the Svelte of the app that uses them.

- **`svelte` is a peer dependency.**
- **The bundle's `module` is a subpath of the package**, such as `@mdsvex/plugin-steps/directives`. That file exports one component for each directive, under the directive's name. In `exports` it has a `svelte` condition and no `default`, as the Svelte packaging guide asks, so vite-plugin-svelte treats the package as a component library and compiles it for the server too. The Vite plugin resolves `module` from the Vite root, so the user's install is the one used.
- **Write components in JavaScript with JSDoc types.** `svelte-package` only strips TypeScript from a component when a preprocessor is configured, and there is none.
- **Relative imports carry their extension**, `./unstyled.js` and `./Steps.svelte`, since the files are not bundled.
- **Styles go in a `.css` file the module imports**, not in a `<style>` block, so a user can leave them out or replace them. List it in `sideEffects`, with the module that imports it.
- **Keep a component free of state, effects and context** if it could be rendered at build time later (static directives in `design/plugin-directives.md`).

## Releasing

Releases are changesets in prerelease mode, published from `.github/workflows/release.yml` with npm trusted publishing. A package that has never been published needs a one-time setup by a maintainer **before** the release that first includes it, because trust can only be registered on a package that exists:

```bash
npm login
```

```bash
node scripts/setup-trusted-publishing.mjs --dry-run @mdsvex/plugin-kit
```

```bash
node scripts/setup-trusted-publishing.mjs @mdsvex/plugin-kit
```

`@mdsvex/plugin-kit` is the one package here that is not on npm yet, the other nine were first released as `0.1.0-next.0`. Name only the packages that have never been published.

The dry run lists what it would do. The real run publishes a `0.0.0` placeholder of each package that is not on npm, then registers `pngwn/MDsveX` with `release.yml` as its trusted publisher. Run it with `node`, not through `pnpm run`, so the 2FA prompt reaches the terminal. It finds packages with `pnpm -r ls`, which covers `plugins/*`, and skips private ones, so a new package must not be `private` and must have a version other than `0.0.0`.

After that the release needs nothing by hand: the version PR bumps the package and merging it publishes under the `next` tag. The placeholder holds the `latest` tag until the first stable release, so install instructions say `@next`.
