---
'@mdsvex/parse': patch
---

Streaming a document with `feed()` stays fast when a single list, block quote or code fence is very large. An 8000 line list or code fence fed in 64 character chunks now parses in about 50ms instead of 3 to 6 seconds.
