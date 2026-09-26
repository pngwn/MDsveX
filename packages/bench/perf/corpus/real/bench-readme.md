# Performance-First Parser Benchmarks

This package contains micro-benchmarks that illustrate the performance-first architecture principles outlined in `packages/pfm-parse/README.md`. Each scenario is now implemented as a [Vitest](https://vitest.dev/guide/bench.html) benchmark suite so you can run, filter, and compare tasks with the standard `vitest bench` tooling.

## 🚀 Quick Start

```bash
# Install dependencies (run from repository root)
npm install

# Full benchmark suite
npm run bench

# Focus on a single scenario
npm run bench -- --run benchmarks/monomorphic.bench.mjs

# Watch mode while iterating
npm run bench -- --watch
```

Benchmarks require Node 18+ and execute via `node --expose-gc` so garbage-collection sensitive cases remain accurate.

## 📊 Benchmark Highlights

Each suite compares a performance-first technique against a more conventional alternative:

1. **Monomorphic vs Polymorphic Call Sites**, Monomorphic dispatch runs ~10× faster.
2. **Struct-of-Arrays vs Array-of-Objects**, TypedArray storage halves traversal time.
3. **Arena Allocation vs Per-Node Allocation**, Arena reuse reduces allocation overhead by ~5×.
4. **JIT-Friendly vs JIT-Hostile Patterns**, Stable shapes and predictable control flow preserve optimizer wins.
5. **Switch Statements vs Dynamic Dispatch**, Inlined switches bias the optimizer and avoid indirect calls.
6. **String Scanning Methods**, `charCodeAt` scanning stays the baseline; `for...of` is the slowest variant.
7. **Error Handling: Hot vs Cold Paths**, Formatting on cold paths avoids catastrophic slowdowns at high error rates.
8. **Memory Layout Patterns**, Packed Struct-of-Arrays with string interning offers both speed and RAM savings.

## 🔬 Benchmark Infrastructure

- **Vitest bench runner** – Unified workflow with reporters, filters, and watch mode.
- **node --expose-gc** – Ensures deterministic GC-sensitive comparisons.
- **Reusable fixtures** – Each `.bench.mjs` file exports self-contained workloads.
- **TypedArray-heavy scenarios** – Mirror real parser memory layouts.

## 🧪 Running Individual Benchmarks

Bench files live in `benchmarks/*.bench.mjs`. You can run or filter them like this:

```bash
# Run only the struct-of-arrays suite
npm run bench -- --include benchmarks/struct-of-arrays.bench.mjs

# Filter by benchmark name using a regexp
npm run bench -- --run "Struct-of-arrays"
```

Vitest’s output already includes comparative statistics; no custom reporter plumbing is required.

## 📚 References

- [Performance-First Parser Architecture](../pfm-parse/README.md)
- [MDN: Optimizing JavaScript Performance](https://developer.mozilla.org/en-US/docs/Web/Performance)
- [V8 Performance Tips](https://v8.dev/blog/elements-kinds)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)

---

_Vitest’s bench runner keeps these scenarios easy to maintain while preserving the insights that guided the original performance-first parser work._
