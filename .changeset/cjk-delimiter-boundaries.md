---
'@mdsvex/parse': minor
---

Han, kana and hangul characters count as a boundary on the outer side of a delimiter, so emphasis, strong and strikethrough work in CJK prose, which has no spaces, without the `|` marker. Other scripts written without spaces, such as Thai, still need the marker.

```md
这是*重要*的, これは_重要_です and 이것은~~중요~~합니다
```
