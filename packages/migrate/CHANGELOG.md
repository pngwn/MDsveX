# @mdsvex/migrate

## 0.2.0-next.1

### Minor Changes

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - Migrating a document renames its frontmatter `layout` key to `template`, so `layout: blog` becomes `template: blog` and `layout: false` becomes `template: false`. To rename the key without converting the markdown, use `migrate_frontmatter`:

  ```ts
  import { migrate_frontmatter } from '@mdsvex/migrate';

  const { code, notes } = migrate_frontmatter(source);
  ```

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - `migrate_config` rewrites the mdsvex 0.x `layout` option in a config file to `templates`:

  ```ts
  // before
  mdsvex({ layout: { _: './src/Default.svelte', blog: './src/Blog.svelte' } });

  // after
  mdsvex({
  	templates: { default: './src/Default.svelte', blog: './src/Blog.svelte' },
  });
  ```

  Named layouts are no longer applied to documents in a folder of the same name, so the returned notes suggest a `select_template` that does the same. They also flag `layoutPropForwarding`, since templates always get the document's props.

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - `check_template` flags what a 0.x layout component needs changed to work as a template: `<slot />` becomes `{@render children()}`, and `$props`, `$restProps` and `{...$props}` become `$props()`.

### Patch Changes

- [#881](https://github.com/pngwn/MDsveX/pull/881) [`87166aa`](https://github.com/pngwn/MDsveX/commit/87166aaae8eb53a971830cddfea54eab49f61314) Thanks [@pngwn](https://github.com/pngwn)! - Migrating a document keeps its frontmatter as it is, instead of turning it into a thematic break and a heading.

## 0.2.0-next.0

### Minor Changes

- [#807](https://github.com/pngwn/MDsveX/pull/807) [`e4732d9`](https://github.com/pngwn/MDsveX/commit/e4732d97163d4454e3e43f8040f18b9ee9bf3d14) Thanks [@pngwn](https://github.com/pngwn)! - Add `@mdsvex/migrate`: converts CommonMark/GFM markdown to Penguin-Flavoured Markdown (PFM) using the remark (unified) ecosystem.
