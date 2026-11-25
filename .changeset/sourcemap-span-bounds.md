---
'@mdsvex/render': patch
---

Sourcemap encoding collects and sorts spans before building line start tables, returning immediately when there are no spans and bounding the generated line scan by the end of the last mapped span instead of walking trailing unmapped output. Sourcemap generation is 3% to 8% faster on code, table and list workloads. Output is unchanged.
