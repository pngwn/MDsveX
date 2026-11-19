<script>
import { page } from "$app/state";
</script>

<svelte:head>
	<title>{page.status} · mdsvex</title>
</svelte:head>

<div class="prose">
	<h1>{page.status === 404 ? "Page not found" : "Something went wrong"}</h1>
	<p>Error {page.status}{page.status !== 404 && page.error?.message ? ` · ${page.error.message}` : ""}</p>
	<p><a href="/docs">Documentation</a> or <a href="/">Home</a>.</p>
</div>

<style>
	.prose {
		padding-top: clamp(2rem, 6vw, 5rem);
	}
</style>
