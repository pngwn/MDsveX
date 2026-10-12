// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// what the plugins of this app leave in ctx.data, by plugin name
declare module "mdsvex" {
	interface PluginData {
		reading_time: { words: number; minutes: number };
	}
}

export {};
