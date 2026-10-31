# @mdsvex/language-server

## 0.1.0-next.4

### Patch Changes

- Updated dependencies [[`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147)]:
  - @mdsvex/language-core@0.1.0-next.4

## 0.1.0-next.3

### Patch Changes

- Updated dependencies [[`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a)]:
  - @mdsvex/language-core@0.1.0-next.3

## 0.1.0-next.2

### Patch Changes

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The `pfm-language-server` command starts. It failed as soon as it was run, with `require is not defined in ES module scope`, so an editor other than VS Code could not start the server from the package.

- [#1214](https://github.com/pngwn/MDsveX/pull/1214) [`b28cc8f`](https://github.com/pngwn/MDsveX/commit/b28cc8fae9fae6dd96cbe9cd5e5b4e72c7df4a22) Thanks [@pngwn](https://github.com/pngwn)! - The packages publish JavaScript with type declarations, so they import from Node. Their entries were TypeScript source, which only a bundler that compiles TypeScript could load. Their types come from `mdsvex/compile`, so checking them needs no Vite.

  `@mdsvex/language-server` exports `start()`, which starts the server on the connection the process was given. Importing the package starts nothing. The `pfm-language-server` command runs the built server directly.

- [#1224](https://github.com/pngwn/MDsveX/pull/1224) [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114) Thanks [@pngwn](https://github.com/pngwn)! - `typescript` is a peer dependency. The declarations import its types, and the server, through `svelte2tsx`, loads it when it starts, but neither package asked for it.

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The packages hold only what they run. Tests, fixtures, build config and intermediate build output are no longer published, which takes `@mdsvex/parse` from 2,337 files to 28.

- Updated dependencies [[`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27), [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114), [`edaaa59`](https://github.com/pngwn/MDsveX/commit/edaaa59bda7e388248428eb7b6459442c7ddd216), [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5), [`cb4782f`](https://github.com/pngwn/MDsveX/commit/cb4782f8bbb11adb02d682702e00f75f2900cda7), [`6a5ea43`](https://github.com/pngwn/MDsveX/commit/6a5ea43e8614d3ca370132d1af4def079c8cf926), [`7dfb9c9`](https://github.com/pngwn/MDsveX/commit/7dfb9c9c7301e96e4780c03ff45b04dbee6e92c4), [`636d9b9`](https://github.com/pngwn/MDsveX/commit/636d9b9c065a29007e9581151be1f6c061f256e4), [`ad07ded`](https://github.com/pngwn/MDsveX/commit/ad07dedac075a42ed0f41c9ea1b8e156ff317cf5), [`b28cc8f`](https://github.com/pngwn/MDsveX/commit/b28cc8fae9fae6dd96cbe9cd5e5b4e72c7df4a22), [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114), [`50e0b8c`](https://github.com/pngwn/MDsveX/commit/50e0b8ccc97885e0ca7eed53c075bfaed7969b23), [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368), [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba)]:
  - @mdsvex/language-core@0.1.0-next.2

## 0.1.0-next.1

### Minor Changes

- [#887](https://github.com/pngwn/MDsveX/pull/887) [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67) Thanks [@pngwn](https://github.com/pngwn)! - The editor now knows your templates, replacement components and directives. The Vite plugin writes what it resolved to `node_modules/.mdsvex/manifest.json` and the editor reads it, falling back to an `mdsvex.config.json` like the playground's:

  ```json
  {
  	"templates": { "docs": "#lib/templates/Docs.svelte" },
  	"components": "#lib/markdown.ts"
  }
  ```

  Hovering a replaced element or directive shows its component, and go to definition opens it. The frontmatter `template` key is typed as your template names or `false`. Completions offer template names, the template's props as frontmatter keys and their literal values, and a directive's props as args with their values. Directive args and the frontmatter of a templated document are type-checked against the component's props, and `metadata` is typed by the same YAML parser `compile()` uses. Compile errors such as an unknown template show on their line, and `.svx` files are supported alongside `.pfm`.

### Patch Changes

- Updated dependencies [[`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80)]:
  - @mdsvex/language-core@0.1.0-next.1

## 0.1.0-next.0

### Minor Changes

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/language-core@0.1.0-next.0
