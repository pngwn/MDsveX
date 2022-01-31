# mdsvex

## 0.10.4

### Patch Changes

- [#407](https://github.com/pngwn/MDsveX/pull/407) [`7dee856`](https://github.com/pngwn/MDsveX/commit/7dee856ea2e577dae3c32b1039e26d32c1a08847) Thanks [@pngwn](https://github.com/pngwn)! - make it work

## 0.10.3

### Patch Changes

- [#405](https://github.com/pngwn/MDsveX/pull/405) [`9d98465`](https://github.com/pngwn/MDsveX/commit/9d98465dce438efd520b069ae90b75fafe0f65db) Thanks [@pngwn](https://github.com/pngwn)! - Delete globals.d.ts

* [#403](https://github.com/pngwn/MDsveX/pull/403) [`5349992`](https://github.com/pngwn/MDsveX/commit/5349992078dbc9f3116089570465aec383934432) Thanks [@pngwn](https://github.com/pngwn)! - Revert 401 feat/defineconfig

## 0.10.2

### Patch Changes

- [#401](https://github.com/pngwn/MDsveX/pull/401) [`e3d6228`](https://github.com/pngwn/MDsveX/commit/e3d6228851d1e75f073687a4f7fa4ad72fcd246b) Thanks [@PuruVJ](https://github.com/PuruVJ)! - expose types, and defineMDSveXConfig

## 0.10.1

### Patch Changes

- [#399](https://github.com/pngwn/MDsveX/pull/399) [`814e8f6`](https://github.com/pngwn/MDsveX/commit/814e8f6f712fe6499c3fb71d895fe5f4430522ab) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Fix globals.d.ts location

## 0.10.0

### Minor Changes

- [#396](https://github.com/pngwn/MDsveX/pull/396) [`c0cdf71`](https://github.com/pngwn/MDsveX/commit/c0cdf71915314c3c709cb616b7822c20f2954666) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add ambient Typings

## 0.9.8

### Patch Changes

- [#274](https://github.com/pngwn/MDsveX/pull/274) [`b253bb0`](https://github.com/pngwn/MDsveX/commit/b253bb0e402d109a62f8ad33f96943672d65cc1e) Thanks [@pngwn](https://github.com/pngwn)! - Custom highlight functions now receive the metastring as an additional argument.

## 0.9.7

### Patch Changes

- [#265](https://github.com/pngwn/MDsveX/pull/265) [`d1c1b4f`](https://github.com/pngwn/MDsveX/commit/d1c1b4f0a2b70fb09d3efb5f391ca12f717a0474) Thanks [@wlach](https://github.com/wlach)! - Escape code chunks in browser builds

## 0.9.6

### Patch Changes

- [#256](https://github.com/pngwn/MDsveX/pull/256) [`492b7a4`](https://github.com/pngwn/MDsveX/commit/492b7a4ad0eaf4274bdc83e629816644e56de643) Thanks [@pngwn](https://github.com/pngwn)! - Props passed to mdsvex documents will now be forwarded to layout files.

## 0.9.5

### Patch Changes

- [#253](https://github.com/pngwn/MDsveX/pull/253) [`8dc7900`](https://github.com/pngwn/MDsveX/commit/8dc790039a6b8f5f31f3e71bfc09c8d7a968cc95) Thanks [@pngwn](https://github.com/pngwn)! - There is now an ESM browser build in addition to UMD.

## 0.9.4

### Patch Changes

- [#251](https://github.com/pngwn/MDsveX/pull/251) [`3d8b400`](https://github.com/pngwn/MDsveX/commit/3d8b40039f3b096b609cdd358f3d56f9961c63e4) Thanks [@pngwn](https://github.com/pngwn)! - UMD build now works in the browser.

## 0.9.3

### Patch Changes

- [`2af50ee`](https://github.com/pngwn/MDsveX/commit/2af50ee80aeda5ca007b1046a8bb04523963ddc9) [#239](https://github.com/pngwn/MDsveX/pull/239) Thanks [@brev](https://github.com/brev)! - Standalone compile() function not returning headmatter attributes. Also export all types.

## 0.9.2

### Patch Changes

- [`0567e15`](https://github.com/pngwn/MDsveX/commit/0567e151ea29ea531b8f71496c46871add43dcbb) [#237](https://github.com/pngwn/MDsveX/pull/237) Thanks [@pngwn](https://github.com/pngwn)! - Fix "Cannot find module 'prism-svelte'" error.

## 0.9.1

### Patch Changes

- [`f458229`](https://github.com/pngwn/MDsveX/commit/f458229033aaee7a86bbba6004053f65441ac25c) [#234](https://github.com/pngwn/MDsveX/pull/234) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now exposes an `escapeSvelte` utility to help with escaping Svelte syntax in custom highlight functions.

* [`fe9b437`](https://github.com/pngwn/MDsveX/commit/fe9b43782d3cf5ea74b13d69aa82fbf0b0db4837) [#233](https://github.com/pngwn/MDsveX/pull/233) Thanks [@pngwn](https://github.com/pngwn)! - Language definitions for fenced code-blocks are now case insensitive.

- [`8c905ce`](https://github.com/pngwn/MDsveX/commit/8c905ce380e0a8fb0b755f9b3ed23224b0ed4866) [#231](https://github.com/pngwn/MDsveX/pull/231) Thanks [@pngwn](https://github.com/pngwn)! - Svelte syntax is now highlighted by default when using the default code highlighter.

## 0.9.0

### Minor Changes

- [`99da8fe`](https://github.com/pngwn/MDsveX/commit/99da8fe17882d55ecb7ec0d5a64ee6a592fc17bc) [#207](https://github.com/pngwn/MDsveX/pull/207) Thanks [@pngwn](https://github.com/pngwn)! - User-provided remark plugins that modify code nodes now run before the builtin in code highlighting, allowing for custom code transformations.

* [`aa8d825`](https://github.com/pngwn/MDsveX/commit/aa8d825a241b02a4387e2b034038b68d76ebe1b6) [#209](https://github.com/pngwn/MDsveX/pull/209) Thanks [@pngwn](https://github.com/pngwn)! - Asynchronous custom highlight functions are now supported.

## 0.8.9

### Patch Changes

- [`a4806af`](https://github.com/pngwn/MDsveX/commit/a4806af06edf2c756a0777cb42eb73edcd12abe7) [#187](https://github.com/pngwn/MDsveX/pull/187) Thanks [@wlach](https://github.com/wlach)! - Various small fixes to compile typechecking

* [`94d5c3e`](https://github.com/pngwn/MDsveX/commit/94d5c3ed6b09565319168e1befd4ca80c4a2b2eb) [#185](https://github.com/pngwn/MDsveX/pull/185) Thanks [@wlach](https://github.com/wlach)! - Fix calling mdsvex.compile with no options

## 0.8.8

### Patch Changes

- 5949714: Update licences
- 142933b: Update Licenses
- 08f9963: Update licences
- a79e29f: Add full licenses.
- ca179e6: Update licenses.
