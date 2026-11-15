# @mdsvex/plugin-callouts

## 0.1.0-next.0

### Minor Changes

- [#1256](https://github.com/pngwn/MDsveX/pull/1256) [`66bdb8d`](https://github.com/pngwn/MDsveX/commit/66bdb8d89274417537ba021f91ec2f733bda1ee4) Thanks [@pngwn](https://github.com/pngwn)! - New package: callouts. `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution`, GitHub's five alerts as container directives, with the bracket text as a custom title. The component renders at build time and ships no JavaScript.

  ```js
  import { callouts } from '@mdsvex/plugin-callouts';

  mdsvex({ plugins: [callouts()] });
  ```

  A callout is a `<div role="note">` with its title in a `<p>`, and its kind is never shown by colour alone. `titles` sets the default title of each kind, for a site in another language, and `css: false` leaves the stylesheet out. A `?text` import reads the title.

### Patch Changes

- Updated dependencies [[`66bdb8d`](https://github.com/pngwn/MDsveX/commit/66bdb8d89274417537ba021f91ec2f733bda1ee4), [`09100bf`](https://github.com/pngwn/MDsveX/commit/09100bf02b7aa771c8bea99b61fa4b40508c8147), [`15fe6dc`](https://github.com/pngwn/MDsveX/commit/15fe6dce507dac7abee4be14ed608df90a408f1c), [`cabe59c`](https://github.com/pngwn/MDsveX/commit/cabe59ce286d42306de75c4f650ffc589758eda8)]:
  - mdsvex@1.0.0-next.4
