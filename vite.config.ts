import { defineConfig } from 'vite';

export default defineConfig({
	test: {
		name: 'client',
		environment: 'node',
		clearMocks: true,
		include: ['**/*.spec.ts'],
		exclude: ['src/lib/server/**', '**/node_modules/**'],
	},
});
