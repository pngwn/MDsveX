# svelte-parse

## 0.1.1

### Patch Changes

- [#637](https://github.com/pngwn/MDsveX/pull/637) [`9e8165f`](https://github.com/pngwn/MDsveX/commit/9e8165f981f52ef0b05cbb93335a7ac664d9e50c) Thanks [@pngwn](https://github.com/pngwn)! - fix layout path resolution

- Updated dependencies [[`9e8165f`](https://github.com/pngwn/MDsveX/commit/9e8165f981f52ef0b05cbb93335a7ac664d9e50c)]:
  - svast@0.2.1

## 0.1.0

### Minor Changes

- [`b5b526e`](https://github.com/pngwn/MDsveX/commit/b5b526e1a1e112969e9ea1463eae82aab3c0fec2) [#198](https://github.com/pngwn/MDsveX/pull/198) Thanks [@pngwn](https://github.com/pngwn)! - Add a new SVAST node `SvelteDynamicContent` in order to disambiguate positions of expressions due to them not always having opening and closing braces(#174).

  Ensure that unquoted attribute values are correctly parsed as separate values where appropriate(#178).

### Patch Changes

- Updated dependencies [[`b5b526e`](https://github.com/pngwn/MDsveX/commit/b5b526e1a1e112969e9ea1463eae82aab3c0fec2)]:
  - svast@0.2.0

## 0.0.5

### Patch Changes

- [`61d3be2`](https://github.com/pngwn/MDsveX/commit/61d3be2606c01efb2a786d53eef381a005beced1) [#193](https://github.com/pngwn/MDsveX/pull/193) Thanks [@pngwn](https://github.com/pngwn)! - Give comment nodes value field a string value. Convert literal into a generic to be utilised by other node types. Implements #173.

* [`b5dc16c`](https://github.com/pngwn/MDsveX/commit/b5dc16c503cd08474fefaff91a0e1dbd5a339ba3) [#176](https://github.com/pngwn/MDsveX/pull/176) Thanks [@halfnelson](https://github.com/halfnelson)! - Populate end position for shorthand properties and add position information for shorthand property expression values.

- [`07ed9ef`](https://github.com/pngwn/MDsveX/commit/07ed9ef28171f0847e92b629cb8e4436db1bb7f2) [#177](https://github.com/pngwn/MDsveX/pull/177) Thanks [@halfnelson](https://github.com/halfnelson)! - Fix typescript errors

* [`13a358c`](https://github.com/pngwn/MDsveX/commit/13a358ce6fb635b9df05f35848710aefff89dbf4) [#194](https://github.com/pngwn/MDsveX/pull/194) Thanks [@pngwn](https://github.com/pngwn)! - Correctly parse attribute modifiers with no value that are followed by other attributes. Fixes #181.

- [`3197d30`](https://github.com/pngwn/MDsveX/commit/3197d30632f2db8c3a9935c44ff81ed72decbd6e) [#195](https://github.com/pngwn/MDsveX/pull/195) Thanks [@pngwn](https://github.com/pngwn)! - Correctly track the positions of boolean attributes and shorthand directives. Fixes #179.

- Updated dependencies [[`61d3be2`](https://github.com/pngwn/MDsveX/commit/61d3be2606c01efb2a786d53eef381a005beced1)]:
  - svast@0.1.0

## 0.0.4

### Patch Changes

- 1f460e1: Publish ES and CJS builds and TypeScript definitions for svelte-parse.

## 0.0.3

### Patch Changes

- Updated dependencies [8008391]
  - svast@0.0.3

## 0.0.2

### Patch Changes

- 5949714: Update licences
- 142933b: Update Licenses
- 08f9963: Update licences
- a79e29f: Add full licenses.
- ca179e6: Update licenses.
- Updated dependencies [5949714]
- Updated dependencies [142933b]
- Updated dependencies [08f9963]
- Updated dependencies [a79e29f]
- Updated dependencies [ca179e6]
  - svast@0.0.2
