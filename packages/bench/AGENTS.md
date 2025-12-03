# Repository Guidelines

## Project Structure & Module Organization

Work happens inside `packages/bench`. Each scenario lives in `benchmarks/*.bench.mjs` and uses Vitest’s bench API. Keep workloads self-contained inside the file—fixtures, helper classes, and benchmark calls should all live together so filtering by file remains trivial. Shared config resides in `vitest.config.mjs`; avoid global helpers unless multiple suites truly need them.

## Build, Test, and Development Commands

Run `npm run bench` to execute the whole suite through `node --expose-gc ./node_modules/vitest/vitest.mjs bench`. Scope work with `npm run bench -- <path-or-pattern>` or `--run <name-fragment>` when iterating on a single scenario. The project assumes Node 18+ and relies on the `--expose-gc` flag for GC-sensitive measurements—do not drop it from local runs or scripts.

## Coding Style & Naming Conventions

Use modern ESM with relative imports and `const` bindings. Group related benchmarks with `describe(...)` and name individual `bench()` invocations using the `✅`/`❌` prefixes so output stays comparable. Keep indentation at two spaces inside blocks and prefer descriptive helper names (for example, `runHostileTokenizer`). Shared fixtures should be explicitly created in `beforeAll` hooks when reused across tasks.

## Testing Guidelines

Vitest bench output is the source of truth—there is no parallel unit-test suite. Run `npm run bench` before raising a PR, and keep local baselines of relevant suites when tuning numbers. If you need additional instrumentation, prefer wrapping code in temporary `bench('debug …')` entries or using `--watch` instead of mutating committed files.

## Commit & Pull Request Guidelines

Stick to short, imperative commit subjects (e.g., `Switch to Vitest bench`) and include GitHub references as `(#123)` when applicable. Pull requests should call out the scenarios touched, include before/after benchmark snapshots (or explain why measurements are skipped), and mention any changes to required Node flags or toolchain settings.
