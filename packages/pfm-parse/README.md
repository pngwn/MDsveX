# Performance-First JS Parser — Architecture & Best Practices

## Goals

- Throughput (chars/s), latency (time-to-first-token), predictability (no GC hiccups), and small bundle (faster parse/compile by the browser).

## Core Principles (Hot Path)

- Monomorphic call sites: each call location should target one function identity.
- Stable data shapes: keep objects/arrays/typed arrays consistent in layout and types.
- Minimise allocations: prefer arenas, ring buffers, and struct-of-arrays over per-node objects.
- Predictable control flow: big switches and tight loops; move rare paths out.

## Data Layout

- Struct-of-arrays (SoA) for tokens/AST:
- types[], starts[], ends[], firstChild[], nextSibling[], plus per-kind payload slots.
- Use typed arrays (Uint16Array, Uint32Array, Float64Array) for dense, stable storage.
- Handles not objects: node = integer index; pass indices between phases.
- Intern tables for strings/numbers; store indices in nodes.
- If objects are needed, use a ring buffer or object pool with fixed fields.

## Control Flow & Dispatch

- Scanner: while (i < n) { c = input.charCodeAt(i); switch (c) { … } }
- Engines build jump tables; branches stay predictable.
- Avoid dynamic dispatch: no handler = table[state]; handler(ctx).
- If you need “states,” use numeric state + switch, or split call sites (if (state===A) sA(); else if (state===B) sB(); …).
- No exceptions on the hot path: signal errors via return codes/flags; throw from cold helpers.

## Functions & Inlining

- Small, pure helpers that take/return primitives inline well.
- Stable arity and argument types.
- Keep hot functions tiny; push debugging and slow features into separate (cold) functions.

## Strings & Input Handling

- Fast scan: charCodeAt(i) over a JS string is the baseline.
- Slice lazily: carry (start,end); avoid building substrings unless required.
- For byte-oriented grammars, consider a one-time conversion to Uint8Array.

## Memory & GC

- Arenas: linear index allocator (const id = next++), no per-node new.
- Ring buffers/object pools for temporary objects if you must expose object nodes.
- No holes / mixed types in arrays; don’t mutate shapes after creation.

## JIT-Friendly Do/Don’t

Do:

- Numeric enums for kinds/tags.
- Parallel typed arrays; pre-size in chunks and grow infrequently.
- Keep property access monomorphic (same keys, same order).

Don’t:

- Create fresh closures in the loop.
- Use obj[prop] where prop varies widely (megamorphic loads).
- Mix numbers/strings/null in the same slot.

## Error Handling & Recovery

- Parse-time checks return error codes or set fields on a side structure.
- Defer formatting/throwing to a cold reporter function outside the loop.

## Benchmarking & Guardrails

- Metrics: throughput (chars/s), allocations per MB, time-to-first-token, peak RSS.
- Datasets: real-world corpora; include small/large and “evil” cases.
- Profiling: verify ICs aren’t megamorphic; look for deopts; ensure hot frames are tiny.
- Budgets: set max allocations/MB and minimum chars/s; fail CI if regressions exceed thresholds.

⸻

Quick Checklist

- Monomorphic call sites; no dynamic handler calls
- Numeric kind/state; big switch in hot loops
- Struct-of-arrays + typed arrays; arena allocation
- Lazy substrings; indices everywhere
- Errors routed to cold paths; no throws in hot loop
- No fresh closures/objects in hot loop
