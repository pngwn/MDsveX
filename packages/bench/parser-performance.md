# Parser Performance Playbook

This document distills the most impactful strategies from our benchmark suite so we can apply a consistent, performance-first approach when extending the parser. All recommendations cite the benchmark scenario that informed them, along with the observed speedup versus the baseline.

## Memory Management

- **Reuse a single arena allocator for parser lifetimes.** `benchmarks/arena-allocation.bench.mjs` shows arena reuse is **6.37× faster** than per-node allocation, making it the default choice for AST construction and transient parse artifacts.

## Error Handling

- **Collect sentinel indices instead of raising exceptions.** In `benchmarks/error-handling.bench.mjs`, using sentinel indices outperforms exception-based control flow in every workload:
  - Baseline (0% invalid): **1.02× faster**
  - Cold errors (1% invalid): **2.01× faster**
  - Hot errors (35% invalid): **36.36× faster**
    We should model error collection as data aggregation, deferring exception construction to reporting layers.

## JIT & Call-Site Stability

- **Prefer monomorphic numeric processing paths.** `benchmarks/jit-patterns.bench.mjs` highlights that monomorphic tokenizers remain **5.27× faster** than JIT-hostile variants and up to **49.59× faster** than polymorphic call patterns. Keep hot loops monomorphic by avoiding ad-hoc branching on token types inside arithmetic.
- **Avoid polymorphic dispatch in tight loops.** `benchmarks/monomorphic.bench.mjs` confirms monomorphic call sites edge out polymorphic alternatives by **~1.01×**, small but consistent; use type-stable helpers.

## AST Layout & Traversal

- **Adopt a packed struct-of-arrays AST layout.** `benchmarks/memory-layout.bench.mjs` finds this layout **4.88× faster** for storage and slightly ahead (**1.01×**) during traversal versus object-per-node models.
- **Preserve cache locality with struct-of-arrays traversal.** `benchmarks/memory-layout.bench.mjs` reports **1.40×** gains over array-of-objects traversal, reinforcing the packed representation.
- **Reserve array-of-objects traversal for ergonomic tooling.** `benchmarks/struct-of-arrays.bench.mjs` shows it is only **1.01× faster** than struct-of-arrays traversal, so we keep struct-of-arrays as the core representation unless we need object ergonomics.

## Tokenization & Scanning

- **Use the chomp-loop tokenizer.** In `benchmarks/string-scanning.bench.mjs`, the chomp loop matches hand-inlined code and stays ahead of higher-level approaches:
  - Hand-inlined tokenizer: parity (**1.00× faster**)
  - Character stream tokenizer: **1.07× faster**
  - Regex pipeline tokenizer: **1.20× faster**
- **Classify whitespace with direct charCode checks.** The same suite shows direct checks beating regex (**1.30×**), ASCII lookup tables (**2.85×**), and `Set` membership (**5.94×**).
- **Favor indexOf search for span detection.** `benchmarks/span-detection-two.bench.mjs` demonstrates indexOf is **4× faster** than stick regex and **37× faster** then character scanning when locating spans.

## Parser Execution Strategy

- **Lean on charCode-optimized parsing.** `benchmarks/parser-strategies.bench.mjs` indicates charCode-driven parsing is **1.06× faster** than manual scanning, **2.07× faster** than hybrid strategies, and **23.62× faster** than regex-assisted parsing.

## Dispatch Strategy

- **Implement a large switch with inlined math for token dispatch.** `benchmarks/switch-dispatch.bench.mjs` shows this variant outperforms function tables (**1.24×**), small-switch dispatch (**2.43×**), and dynamic dispatch on small token sets (**4.57×**).

## Recommended Implementation Order

1. Build the tokenizer around the chomp loop with direct charCode whitespace classification and sticky regex span detection, keeping hot paths monomorphic.
2. Feed tokens into a charCode-optimized parser that populates a struct-of-arrays AST inside a reusable arena allocator.
3. Aggregate parse errors as sentinel indices during traversal, materializing rich error objects only at reporting boundaries.
4. Use a large, inlined-math switch statement for dispatch, and audit hot loops to ensure call-site stability.

Following this playbook keeps our parser aligned with the fastest strategies uncovered in the benchmark suite and provides a reference baseline for future performance work.
