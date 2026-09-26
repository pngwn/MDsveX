# parse

## 1.0.0-next.1

### Minor Changes

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Export `normalize_newlines` and `raw_offsets`, so tools that read parser positions can map them back to a source with `\r\n` line endings.

  ```ts
  const offsets = raw_offsets(source); // null when there is nothing to map
  const start = offsets ? offsets.to_raw(node_start) : node_start;
  ```

### Patch Changes

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing now ends an unclosed code span at a blank line, like a full parse does, even when a chunk ends right after the line break before it.

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Streaming a document with `feed()` stays fast when a single list, block quote or code fence is very large. An 8000 line list or code fence fed in 64 character chunks now parses in about 50ms instead of 3 to 6 seconds.

- [#851](https://github.com/pngwn/MDsveX/pull/851) [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing with `feed()` now takes time proportional to the input size, so streaming small chunks into a large document is no longer slower than parsing it in one go. A 3.8MB document fed in 64 character chunks parses in about 0.35s instead of 27s.

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed `*`, `_`, `~~`, `~` or `^` followed by a line that starts a list item, blockquote, fence or HTML block stays literal text, and the rest of the document parses in full.

  ```md
  1. ~1
  2. -
  ```

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Inline HTML that is never closed and falls back to plain text now keeps its full original text, instead of a truncated or unrelated fragment.

- [#849](https://github.com/pngwn/MDsveX/pull/849) [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727) Thanks [@pngwn](https://github.com/pngwn)! - Backticks with no closing run stay as literal text, including every backtick in a run of two or more, and a blank line after them still ends the paragraph.

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
