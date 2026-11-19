---
'@mdsvex/migrate': minor
---

`check_template` flags what a 0.x layout component needs changed to work as a template: `<slot />` becomes `{@render children()}`, and `$$props`, `$$restProps` and `{...$$props}` become `$props()`.
