<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PFMDocument } from '@mdsvex/parse';

	let { doc }: { doc: PFMDocument | null } = $props();

	let container: HTMLDivElement;
	let app: any;
	let ready = $state(false);
	let pixiRenderer: any;

	onMount(() => {
		init();
	});

	onDestroy(() => {
		pixiRenderer?.reset();
		app?.destroy(true, { children: true });
	});

	async function init() {
		const { Application } = await import('pixi.js');
		const { PixiRenderer } = await import('@mdsvex/render/pixi');

		app = new Application();
		await app.init({
			resizeTo: container,
			background: '#0a0a0a',
			antialias: true,
			resolution: 1,
			autoDensity: true,
			preference: 'webgpu' as any,
		});
		container.appendChild(app.canvas);

		// Ensure layout is computed before reading dimensions
		await new Promise((r) => requestAnimationFrame(r));
		app.resize();

		pixiRenderer = new PixiRenderer(app.stage, {
			width: container.clientWidth || 600,
		});

		ready = true;
	}

	$effect(() => {
		if (ready && pixiRenderer && doc) {
			pixiRenderer.setWidth(container?.clientWidth ?? 600);
			pixiRenderer.reset();
			pixiRenderer.update(doc);
		}
	});
</script>

<div bind:this={container} class="pixi-container"></div>

<style>
	.pixi-container {
		width: 100%;
		height: 100%;
		min-height: 200px;
		overflow: hidden;
	}
</style>
