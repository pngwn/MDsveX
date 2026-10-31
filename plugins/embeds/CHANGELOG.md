# @mdsvex/plugin-embeds

## 0.1.0-next.0

### Minor Changes

- [#1226](https://github.com/pngwn/MDsveX/pull/1226) [`16a0b29`](https://github.com/pngwn/MDsveX/commit/16a0b294f788ec2b43938cd1a02fb97e92986c73) Thanks [@pngwn](https://github.com/pngwn)! - New package: `::youtube[Title](id=...)` and `::vimeo[Title](id=...)`, lazy video players named by their title, from `youtube-nocookie.com` and from Vimeo with `dnt=1`.

  ```js
  import { embeds } from '@mdsvex/plugin-embeds';

  mdsvex({ plugins: [embeds()] });
  ```

### Patch Changes

- Updated dependencies [[`ba7f8dd`](https://github.com/pngwn/MDsveX/commit/ba7f8dd3d8441edfeb529b34b07dac80058de35a), [`eddbaa4`](https://github.com/pngwn/MDsveX/commit/eddbaa482c7ae775020f147e9a10ecdccb81025a), [`22e8562`](https://github.com/pngwn/MDsveX/commit/22e85628a68e3557707a5b34488822d5ceb63657), [`6f92236`](https://github.com/pngwn/MDsveX/commit/6f9223665b799344096fedfb050f8dd6db9b9e8c)]:
  - mdsvex@1.0.0-next.3
