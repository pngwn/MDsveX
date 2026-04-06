import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
		include: [],

    server: {
      deps: {
        external: [/dist\/main\.js/],
      },
    },

  },
  benchmark: {
    include: ['benchmarks/**/*.bench.{js,mjs,ts}'],
    time: 3000,
    warmupTime: 500,
    reporters: ['default'],
  },
});
