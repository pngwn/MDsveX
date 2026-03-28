# PFM Parser — Implementation Plan

> **Generated:** 2026-03-07 | **Updated:** 2026-03-09 | **Status:** WIP (Phase 5 in progress)

## Current State Summary

### Test Results (as of now)
- **Passing:** 329 | **Failing:** 0 | **Todo/Skipped:** 40
- **Total test examples:** 369
- **Progress:** Phase 5 continued. Lists: nesting, continuation content, tight/loose, code fences in items all working. Activated tests 316, 319. (305→329 passing, 0 failing)

### What's Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| **Paragraphs** | ✅ Working | 7/7 tests passing. Single/multi-line, leading spaces, double-newline separation. |
| **Fenced code blocks** | ⚠️ Mostly working | 15/17 passing, 2 skipped. Backtick fences, info strings, nested fences, unbalanced fences. Tilde fences treated as content (PFM spec). |
| **Code spans** | ⚠️ Mostly working | 18/21 passing, 6 skipped. Single/double backtick, leading space stripping, PFM info syntax (`\`#!lang code\``). |
| **Strong emphasis** (`*`) | ✅ Working | 125/131 passing, 6 skipped (need HTML/code-span-in-emphasis). PFM rules: `*` = strong emphasis, single delimiter only. Left-flanking: left=ws/punct, right=word/punct. Right-flanking: left=word/punct, right=ws/punct. Pending node + repair for unclosed. |
| **Emphasis** (`_`) | ✅ Working | Same flanking rules as `*`. `_` = emphasis. Intraword `_` rejected (prev must be ws/punct to open). `_foo_bar_baz_` correctly wraps all (inner `_` are intraword). |
| **Backslash escapes** | ✅ Working | 14/18 passing, 4 skipped (need HTML/tilde fences). `\` before ASCII punctuation prevents special interpretation. Backslash preserved in text value. |
| **Autolinks** | ✅ Working | 15/19 passing, 4 skipped (need HTML nodes). URI `<scheme:path>` and email `<user@domain>` produce `link` nodes with `text` children. Scheme must be 2-32 chars. |
| **Links** (`[text](url)`) | ✅ Working | 15/15 passing. Inline links produce `link` nodes with `href`/`title` metadata. URL parsing handles balanced parens, titles in quotes, empty URL/text. |
| **Images** (`![alt](url)`) | ✅ Working | 6/6 passing. Inline images produce `image` nodes with `src`/`title` metadata. Same URL parsing as links. |
| **Block quotes** (`>`) | ✅ Working | 20/22 passing, 2 skipped. Nesting (`> > >`), lazy continuation, `>` blank lines, paragraph interruption. Skipped: lists inside quotes, indented code inside quotes. |
| **Lists** (ordered/unordered) | ⚠️ Partial | 17/26 passing, 9 skipped. Tight/loose, multiple items, different markers, paragraph interruption, nesting (3 levels), continuation content, code fences in items, indented continuation, nested+paragraph continuation. Skipped: inconsistent indent (310/311), indent limit (312/313), block-level content in items (308/318/320/321), ref links in items (317). |
| **Link reference defs** | ⚠️ Partial | 4/4 passing. Reference definitions currently treated as text. Full `[text][ref]` and `[text][]` reference link resolution pending. |
| **Headings** (`#`) | ✅ Working | 23/23 tests passing. Depths 1-6, leading/trailing whitespace handling, heading detection within paragraphs, PFM-specific rules (no trailing `#` stripping, tolerates 4+ leading spaces). |
| **Thematic breaks** | ✅ Working | 17/24 tests passing, 7 skipped. `***`, `---`, `___` with spaces between markers, paragraph interruption. Skipped: indented code (48), paragraph continuation (49), emphasis (56), lists (57,60,61), setext headings (59). |
| **Blank lines** | ✅ Working | 5/5 tests passing. Blank lines emit `line_break` nodes at root level. Whitespace-only lines (`  \n`) and empty lines (`\n`) both detected. `is_blank_line_after()` helper for proper paragraph boundary detection with whitespace-only separators. |

### What's NOT Implemented (from PFM spec + CommonMark baseline)

#### Block-level
- [x] **ATX headings** — `# heading` (fully implemented, 23 tests)
- [x] **Blank lines** — semantic blank line handling (5 tests)
- [x] **Block quotes** — `>` prefix (20 tests, 2 skipped pending lists/indented code)
- [x] **Lists** — ordered and unordered, loose/tight (9 tests, 17 skipped pending nesting/continuation/block-content)
- [x] **Thematic breaks** — `---`, `***`, `___` (17 tests, 7 skipped pending other features)
- [ ] **HTML blocks** — raw HTML passthrough

#### Inline-level
- [x] **Emphasis** (`_`) — PFM uses `_` for emphasis, `*` for strong (125 tests, 6 skipped pending HTML/code-span-in-emphasis)
- [ ] **Hard line breaks** — backslash `\` before newline (PFM drops trailing-space variant)
- [ ] **Soft line breaks** — single newline in paragraph
- [x] **Backslash escapes** — `\*`, `\[`, etc. (14 tests, 4 skipped pending HTML/tilde fences)
- [x] **Links** — `[text](url)` treated as plain text in PFM (9 tests)
- [x] **Link reference definitions** — `[ref]: url` treated as plain text in PFM (4 tests)
- [x] **Images** — `![alt](url)` treated as plain text in PFM (5 tests)
- [x] **Autolinks** — `<url>` produces link nodes (15 tests, 4 skipped pending HTML nodes)
- [ ] **Raw HTML** — inline HTML tags

#### PFM Extensions (not in CommonMark)
- [ ] **Superscript** — `^TM^`
- [ ] **Subscript** — `~1~` (syntax TBD)
- [ ] **Strikethrough** — `~~text~~`
- [ ] **Tables** — GFM-style pipe tables (with PFM extensions)
- [ ] **Generic directives** — `:inline[content]`, `::leaf[content]`, `:::container`

#### Svelte Integration
- [ ] **Mustache expressions** — `{expression}` (was in backup_main, not in current)
- [ ] **Svelte components** — `<Component />` in markdown
- [ ] **HTML/Svelte blocks** — `{#if}`, `{#each}`, etc.

### Known Bugs (Failing Tests)

None! All active tests passing.

### Code Architecture Notes

- **backup_main.ts** — Previous functional-style parser (flat token stream, separate arena). Has working heading/HTML/mustache parsing but different API. Could be reference for reimplementing those features.
- **introspector.ts** — Debug tool for tracing state transitions, not integrated yet.
- **Dead code in main.ts** — `chomp_text()` and `consume_code_fence()` functions at bottom are unused (leftover from refactor).
- **Shared `metadata` object** — Single `Record<string, any>` reused across states. Will collide as more features use it. Consider per-state metadata or a stack.
- **`node_buffer.grow()`** — ~~Doesn't grow all arrays~~ Fixed: now resizes all typed arrays.

## Suggested Implementation Order

### Phase 1: Fix Existing Bugs ✅ COMPLETE
1. ~~Fix `node_buffer.grow()` to resize all typed arrays~~ ✅
2. ~~Fix code span edge cases (332, 334, pfm_328_3)~~ ✅
3. ~~Fix fenced code block edge cases (127, 145)~~ ✅
4. ~~Fix paragraph boundary detection for emphasis tests (354, 366, 367, 368)~~ ✅
   - ✅ Fixed excessive state nesting that prevented paragraph boundary detection
   - ✅ Fixed node_stack cleanup when paragraphs end
   - ✅ Paragraph boundaries now properly detected for double newlines
   - ✅ Implemented clean state bubbling approach (each state pops itself, lets signal bubble up naturally)
   - ✅ Maintained inline element nesting capability for complex markdown
   - ✅ Fixed text node merging in `handle_repair` — single text child now merges with converted delimiter
5. ~~Fix or update the `get_node` unit test~~ ✅ Updated to reflect merge behavior, added multi-child test

### Phase 2: Core Block Structure
6. ~~**ATX headings** — Reactivate from stub, reference backup_main.ts~~ ✅ Implemented inline in root state (no separate heading_marker state needed). 23 tests covering all 18 PFM fixtures + 5 additional edge cases.
7. ~~**Blank lines** — Proper semantic handling~~ ✅ Implemented. Blank/whitespace-only lines emit `line_break` nodes. Added `is_blank_line_after()` for paragraph boundary detection with whitespace-only separators.
8. ~~**Thematic breaks** — `---`, `***`, `___`~~ ✅ Implemented in root state with paragraph boundary detection. 17 active tests (7 skipped pending lists/setext/emphasis/indented code).
9. **Hard line breaks** — `\` before newline

### Phase 3: Emphasis (PFM Rules) ✅ COMPLETE
10. ~~**Emphasis** (`_`) — PFM's simplified rules: `_em_`, `*strong*`~~ ✅ Implemented. `_` = emphasis, `*` = strong emphasis (single delimiters only, no `**`/`__`). Same flanking rules for both: opening requires left=ws/punct + right=word/punct; closing requires left=word/punct + right=ws/punct.
11. **Intraword emphasis via `~_text_~` syntax** — Not yet implemented (Phase 6 with other PFM extensions)
12. ~~Complete the 120 todo emphasis tests~~ ✅ 112 tests activated (8 remain todo pending links/images/autolinks/HTML support)

### Phase 4: Links & References
13. **Backslash escapes**
14. **Autolinks** — `<url>`
15. **Links** — `[text](url)`
16. **Link reference definitions** — `[ref]: url`, explicit `[ref][]`
17. **Images** — `![alt](url)`

### Phase 5: Extended Blocks
18. ~~**Block quotes** — `>`~~ ✅ Implemented. `block_quote` state acts as container, dispatches inner content like root. Handles `>` stripping, lazy continuation, nesting, paragraph interruption. 20 tests (2 skipped pending lists/indented code).
19. ~~**Lists** — ordered/unordered, loose/tight~~ ⚠️ Basic lists implemented (9/26 tests). Nesting, continuation content, and block-level items pending.
20. **HTML blocks** — raw HTML passthrough
21. **Raw HTML** — inline

### Phase 6: PFM Extensions
22. **Strikethrough** — `~~text~~`
23. **Superscript** — `^text^`
24. **Subscript** — syntax TBD
25. **Tables** — pipe tables
26. **Generic directives** — inline/leaf/container

### Phase 7: Svelte Integration
27. **Mustache expressions** — `{expr}`
28. **Svelte components** — `<Component />`
29. **Svelte blocks** — `{#if}`, `{#each}`, `{@html}`

### Phase 8: Cleanup
30. Remove dead code (old functions at bottom of main.ts)
31. Remove/integrate backup_main.ts
32. Per-state metadata handling
33. Stringifier (AST → markdown/HTML)
34. Public API stabilization

## Files Reference

```
packages/parse/
├── src/
│   ├── main.ts           # Core parser (state machine)
│   ├── utils.ts          # node_buffer, error_collector, node_kind enum
│   ├── types.ts          # Type definitions
│   ├── constants.ts      # ASCII char codes
│   ├── introspector.ts   # Debug state tracer (unused)
│   └── backup_main.ts    # Previous parser version (reference)
├── test/
│   ├── paragraphs.spec.ts
│   ├── fenced_code_blocks.spec.ts
│   ├── code_spans.spec.ts
│   ├── emphasis.spec.ts
│   ├── atx_headings.spec.ts
│   ├── thematic_breaks.spec.ts
│   ├── blank_lines.spec.ts
│   ├── block_quotes.spec.ts
│   ├── lists.spec.ts
│   ├── paragraphs.spec.skip.ts
│   ├── parse_markdown_svelte.spec.skip.ts
│   └── utils.ts          # Test helpers
└── package.json

packages/pfm-tests/tests/   # Fixture files (24 categories)
packages/bench/              # Performance benchmarks & architecture docs
```
