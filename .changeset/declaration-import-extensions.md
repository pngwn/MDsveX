---
'mdsvex': patch
'@mdsvex/parse': patch
'@mdsvex/render': patch
'@mdsvex/prettier-plugin': patch
'@mdsvex/language-core': patch
'@mdsvex/source-map': patch
---

The type declarations write `.js` on their relative imports, so they resolve under `moduleResolution: node16` and `nodenext` as well as `bundler`. A project on `node16` or `nodenext` used to get TS2834 errors from inside the packages, or with `skipLibCheck` on, `any` where the types should be.
