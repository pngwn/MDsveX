---
'mdsvex': minor
'@mdsvex/render': minor
---

Markdown images are optimised when `@sveltejs/enhanced-img` is installed. With `enhancedImages()` in the Vite plugins, `import_images` imports every image enhanced-img can optimise (avif, gif, heif, jpeg, jpg, png, tiff, webp) with `?enhanced`, and the image renders as the `<picture>` enhanced-img would give it: a `<source>` for each format, then an `<img>` with the `width` and `height` of the file and the image's `alt` and `title`. A replaced `img` gets the imported picture as its `src` prop. An `.svg`, an image with a query of its own such as `?url`, a root url and a remote url are left as they are. Without enhanced-img nothing changes.

The image now sits inside a `<picture>`, so CSS such as `p > img` no longer matches it, and the first build is slower while sharp makes the formats. `import_images: { enhanced: false }` keeps plain imports, and `{ enhanced: true }` fails at startup when `enhancedImages()` is missing. `compile()` takes `{ enhanced: true }` too, off by default. A `UrlSource` of `@mdsvex/render` can be `{ type: 'picture', value }`.
