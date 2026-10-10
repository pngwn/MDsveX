# @mdsvex/language-server

## 0.1.0-next.2

### Patch Changes

- Updated dependencies [[`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba)]:
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
