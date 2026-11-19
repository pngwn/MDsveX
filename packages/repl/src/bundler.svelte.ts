import type { BundleResult } from './types';
import type { BundleOptions } from './workers/workers';
import type { File } from './workspace.svelte';

let uid = 1;

export default class Bundler {
	#worker: Worker;

	result = $state.raw<BundleResult | null>(null);

	constructor({
		svelte_version,
		onstatus,
		onversion,
		onerror,
	}: {
		svelte_version: string;
		onstatus: (val: string | null) => void;
		onversion?: (version: string, supports_async: boolean) => void;
		onerror?: (message: string) => void;
	}) {
		this.#worker = new Worker(
			new URL('./workers/bundler/index.ts', import.meta.url),
			{
				type: 'module',
			}
		);

		/** the newest bundle with a result, statuses from older bundles are stale */
		let settled = 0;

		this.#worker.onmessage = (event) => {
			if (event.data.type === 'status') {
				if (event.data.uid === undefined || event.data.uid > settled) {
					onstatus(event.data.message);
				}
				return;
			}

			if (event.data.type === 'version') {
				onversion?.(event.data.version, event.data.supports_async);
				return;
			}

			if (event.data.type === 'error') {
				onerror?.(event.data.message);
				return;
			}

			settled = Math.max(settled, event.data.uid);
			onstatus(null);
			this.result = event.data;
		};

		this.#worker.postMessage({ type: 'init', svelte_version });
	}

	destroy() {
		this.#worker.terminate();
	}

	bundle(files: File[], options: BundleOptions) {
		this.#worker.postMessage({
			uid,
			type: 'bundle',
			files,
			options,
		});

		uid += 1;

		return new Promise<void>((resolve) => {
			const destroy = $effect.root(() => {
				let first = true;
				$effect.pre(() => {
					this.result;
					if (first) {
						first = false;
					} else {
						destroy();
						// a later bundle call can supersede this one, so this is only the next result
						resolve();
					}
				});
			});
		});
	}
}
