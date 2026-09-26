# parse

## 1.0.0-next.0

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#808](https://github.com/pngwn/MDsveX/pull/808) [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb) Thanks [@pngwn](https://github.com/pngwn)! - Add named argument lists to generic directives (`:name[text](key=val, key2=val2)`) for inline, leaf, and container forms. Empty lists (`()`) are allowed but ignored; malformed lists degrade to literal text (inline) or a paragraph (block). The `[content]` brackets are now required for all directive forms - empty text must be explicit (`::name[]`). Directive text accepts simple inline constructs (emphasis, code spans, strikethrough, superscript, subscript) but links, images, and autolinks stay literal text, and unescaped square brackets must balance.

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

## 0.1.1

### Patch Changes

- [#359](https://github.com/pngwn/MDsveX/pull/359) [`07a3e6f`](https://github.com/pngwn/MDsveX/commit/07a3e6f8f7f163b91e1b7adc881957dac3825288) Thanks [@pngwn](https://github.com/pngwn)! - Split modules up, add new build approach with constant replacements.
