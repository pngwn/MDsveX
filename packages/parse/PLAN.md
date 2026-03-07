# PFM Parser — Implementation Plan

> **Generated:** 2026-03-07 | **Status:** WIP

## Current State Summary

### Test Results (as of now)
- **Passing:** 76 | **Failing:** 2 | **Todo/Skipped:** 128
- **Total test examples:** 206
- **Progress:** Fixed 7 additional tests! 🎉 (69→76 passing)

### What's Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| **Paragraphs** | ✅ Working | 7/7 tests passing. Single/multi-line, leading spaces, double-newline separation. |
| **Fenced code blocks** | ⚠️ Mostly working | 15/17 passing, 2 skipped. Backtick fences, info strings, nested fences, unbalanced fences. Tilde fences treated as content (PFM spec). |
| **Code spans** | ⚠️ Mostly working | 18/21 passing, 6 skipped. Single/double backtick, leading space stripping, PFM info syntax (`\`#!lang code\``). |
| **Strong emphasis** (`*`) | ⚠️ Partially working | 7/11 active tests passing. Basic `*foo bar*` works. Pending node + repair pattern for unclosed delimiters. |
| **Emphasis** (`_`) | ❌ Not implemented | State enum exists but no case in the switch. 120 tests todo. |
| **Headings** (`#`) | ❌ Stubbed | `OCTOTHERP` case in root hits `continue` (no-op). `heading_marker` state is mostly commented out. Skipped test file exists. |

### What's NOT Implemented (from PFM spec + CommonMark baseline)

#### Block-level
- [ ] **ATX headings** — `# heading` (stubbed, not functional)
- [ ] **Blank lines** — semantic blank line handling
- [ ] **Block quotes** — `>` prefix
- [ ] **Lists** — ordered and unordered, loose/tight
- [ ] **Thematic breaks** — `---`, `***`, `___`
- [ ] **HTML blocks** — raw HTML passthrough

#### Inline-level
- [ ] **Emphasis** (`_`) — PFM uses `_` for emphasis, `*` for strong
- [ ] **Hard line breaks** — backslash `\` before newline (PFM drops trailing-space variant)
- [ ] **Soft line breaks** — single newline in paragraph
- [ ] **Backslash escapes** — `\*`, `\[`, etc.
- [ ] **Links** — `[text](url)` and `[text][ref]`
- [ ] **Link reference definitions** — `[ref]: url`
- [ ] **Images** — `![alt](url)`
- [ ] **Autolinks** — `<url>`
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

1. **`utils.spec.ts` — `get_node` end default:** `push()` sets `end = 0xFFFFFFFF` but test expects `0`. The `push` signature accepts `parent` as 3rd arg, not `end` — test may be outdated or API changed.

2. **Code spans 332, 334, pfm_328_3:** Single-space code spans (`\` a\``) parsed as text instead of code_span. Looks like the leading-space detection path has an off-by-one or doesn't handle the single-character case.

3. **Fenced code blocks 127:** Unclosed fence with content — `value_end` is `0` instead of `14`. The `code_fence_info` → `code_fence_content` transition doesn't set `value_end` for the EOF case.

4. **Fenced code blocks 145:** Info string containing ` ``` ` — value content is empty when it should be `foo`. Likely the fence-closing detection is matching inside the info string.

5. **Emphasis 354:** Multi-paragraph input with `*$*` — paragraph boundaries not detected correctly, first paragraph spans entire input.

6. **Emphasis 366, 367:** Trailing newline included in paragraph content — paragraph `end` is off by one when input ends with `\n`.

7. **Emphasis 368:** Extra text child node — `*(*foo)` produces 4 children instead of 3, likely the `(` is triggering an extra text node.

### Code Architecture Notes

- **backup_main.ts** — Previous functional-style parser (flat token stream, separate arena). Has working heading/HTML/mustache parsing but different API. Could be reference for reimplementing those features.
- **introspector.ts** — Debug tool for tracing state transitions, not integrated yet.
- **Dead code in main.ts** — `chomp_text()` and `consume_code_fence()` functions at bottom are unused (leftover from refactor).
- **Shared `metadata` object** — Single `Record<string, any>` reused across states. Will collide as more features use it. Consider per-state metadata or a stack.
- **`node_buffer.grow()`** — Doesn't grow `parents`, `next_siblings`, `prev_siblings`, `children_starts`, or `pending_nodes` arrays. Will crash on large inputs.

## Suggested Implementation Order

### Phase 1: Fix Existing Bugs
1. ~~Fix `node_buffer.grow()` to resize all typed arrays~~ ✅
2. ~~Fix code span edge cases (332, 334, pfm_328_3)~~ ✅
3. ~~Fix fenced code block edge cases (127, 145)~~ ✅
4. Fix paragraph boundary detection for emphasis tests (354, 366, 367, 368) ✅ **MAJOR BREAKTHROUGH**
   - ✅ Fixed excessive state nesting that prevented paragraph boundary detection
   - ✅ Fixed node_stack cleanup when paragraphs end
   - ✅ Paragraph boundaries now properly detected for double newlines
   - ✅ Implemented clean state bubbling approach (each state pops itself, lets signal bubble up naturally)
   - ✅ Maintained inline element nesting capability for complex markdown
   - 🚧 Minor remaining: text node counting edge cases (2 tests remaining)
5. Fix or update the `get_node` unit test

### Phase 2: Core Block Structure
6. **ATX headings** — Reactivate from stub, reference backup_main.ts
7. **Blank lines** — Proper semantic handling
8. **Thematic breaks** — `---`, `***`, `___`
9. **Hard line breaks** — `\` before newline

### Phase 3: Emphasis (PFM Rules)
10. **Emphasis** (`_`) — PFM's simplified rules: `_em_`, `*strong*`
11. Intraword emphasis via `~_text_~` syntax
12. Complete the 120 todo emphasis tests

### Phase 4: Links & References
13. **Backslash escapes**
14. **Autolinks** — `<url>`
15. **Links** — `[text](url)`
16. **Link reference definitions** — `[ref]: url`, explicit `[ref][]`
17. **Images** — `![alt](url)`

### Phase 5: Extended Blocks
18. **Block quotes** — `>`
19. **Lists** — ordered/unordered, loose/tight
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
│   ├── atx_headings.spec.skip.ts
│   ├── paragraphs.spec.skip.ts
│   ├── parse_markdown_svelte.spec.skip.ts
│   └── utils.ts          # Test helpers
└── package.json

packages/pfm-tests/tests/   # Fixture files (24 categories)
packages/bench/              # Performance benchmarks & architecture docs
```
