## Character Processing Strategies

- Character-by-character scanning loops for complete token streams.
- Regex-driven tokenization pipelines that progressively slice input.
- Dedicated string “chomp” loops that walk delimiters and escapes without extra state
  transitions.
- Hand-inlined tokenizer variants that bypass helper lookups inside the hot loop.
- Head-to-head benchmarking between the original tokenizer and an optimized rewrite.

## Ambiguity & Probe Handling

- Probe-mode DFA traversal with backtracking and fallback routing for ambiguous constructs.
- Direct slash/identifier/whitespace scanners that skip probe logic entirely.
- Probe-state membership checks using both Set.has() and Uint8Array bit masks.
- Numeric deduplication keys for failed probe paths versus naive repeated attempts.
- Probe failure guards using set.size checks compared to cached boolean flags.
- Probe fallback resolution versus explicit failure marking when ambiguity cannot be resolved.

## Pattern Matching Techniques

- Per-state multi-character buckets ordered by longest-first matching before single-character
  tables.
- “Any” rule fallbacks stored in separate transition slots for unmatched characters.
- Generated match_within sub-states in place of regex-style substring captures.
- Pattern codepoint storage compared between number[] arrays and Uint16Array buffers.

## Character Classification

- ASCII lookup via dense Uint8Array tables.
- Direct comparison chains for character classes.
- Set-based membership checks for alphanumeric and whitespace categories.
- Map-based classification keyed by character codes.
- Non-ASCII dispatch through Map objects, plain objects, and sparse typed arrays.
- Char-map base computation evaluated with integer multiplication vs. bit shifting.

## Data Structures for Runtime State

- Token buffers implemented as flat Uint32 triplets.
- Arrays-of-objects storing token metadata.
- Structure-of-arrays layouts separating types, starts, and ends.
- Array-of-arrays storing [type, start, end].
- Token stacks sized with Uint8Array and Uint16Array variants for depth management.

## Comparative Highlighter Benchmarks

- Performance comparisons between Twinkleplop tokenization (with and without rendering) and
  external libraries: Shiki, Prism, highlight.js, and Starry Night.

## Additional Micro-Optimizations

- Evaluation of probe-mode fallbacks versus deterministic failure marking.
- Inline caching of per-state lookup pointers to trim repeated map access.
- Cached boolean flags for probe failure presence instead of dynamic size checks.
