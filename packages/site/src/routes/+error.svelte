<script>
import { page } from "$app/state";
</script>

<svelte:head>
	<title>{page.status} · mdsvex</title>
</svelte:head>

<div class="prose">
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? `Encountered a ${page.status} error`}</p>
	<p><a href="/docs">The docs</a> or <a href="/">the start</a>.</p>
</div>

<style>
	.prose {
		padding-top: clamp(2rem, 6vw, 5rem);
	}
</style>
