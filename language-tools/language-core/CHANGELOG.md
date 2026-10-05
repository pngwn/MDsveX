# @mdsvex/language-core

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

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - The editor reads live expressions in code as references, so type errors, hover, rename and the unused check work on them. It highlights code as the Vite plugin does unless the plugin renders code plain, and `mdsvex.config.json` takes `highlight: false`. A half-typed live expression is an error on that fence rather than on the whole document.

### Patch Changes

- Updated dependencies [[`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9), [`c81604f`](https://github.com/pngwn/MDsveX/commit/c81604f77f7e2662f42db2dcfb1c2a29a594e726), [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`fa297f9`](https://github.com/pngwn/MDsveX/commit/fa297f9b3fda7cc11c3f4274ba0b0cc27acedf9a), [`311902d`](https://github.com/pngwn/MDsveX/commit/311902de7c606430e3899440d37def14f5190b6c), [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87), [`6c64d8b`](https://github.com/pngwn/MDsveX/commit/6c64d8b7c13c876dc03668123a9dbfcc9520b885), [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80), [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`8bd14fe`](https://github.com/pngwn/MDsveX/commit/8bd14fe77aed1ff532757a06e934fa6238ecb2da), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`045aca9`](https://github.com/pngwn/MDsveX/commit/045aca94077183b8b58bb59c45813f0aa4f33cde), [`59bbad3`](https://github.com/pngwn/MDsveX/commit/59bbad3d1905ea378b8745d916af0dca3e63b042), [`f2ff5fe`](https://github.com/pngwn/MDsveX/commit/f2ff5fe144a9009a79e0aa7a6f08f1bed5a7696c), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`4c55f5e`](https://github.com/pngwn/MDsveX/commit/4c55f5eea023e687202fa97626b401f09bffd6f7), [`e708e1d`](https://github.com/pngwn/MDsveX/commit/e708e1d4c66478efd8606fa2e1ff2fee40e0732a), [`4927fd8`](https://github.com/pngwn/MDsveX/commit/4927fd87ef00ae106f081cf4315e425ec71a790c), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9), [`266f24d`](https://github.com/pngwn/MDsveX/commit/266f24d652a2bf03795b5397696790eb016890b4), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`b35c5ff`](https://github.com/pngwn/MDsveX/commit/b35c5ff2011f9b35515edd24a11027c7a410ba56), [`1dceed1`](https://github.com/pngwn/MDsveX/commit/1dceed1b863e202066c943d7b3e463db7e8fdb05), [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80), [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239)]:
  - @mdsvex/render@1.0.0-next.1
  - mdsvex@1.0.0-next.1
  - @mdsvex/source-map@0.1.0-next.1

## 0.1.0-next.0

### Minor Changes

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e), [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9), [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/render@1.0.0-next.0
  - @mdsvex/source-map@0.1.0-next.0
