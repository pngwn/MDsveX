<script>
	import { page } from '$app/stores';
</script>

<style>
	h1, p {
		margin: 0 auto;
	}

	h1 {
		font-size: 2.8em;
		font-weight: 700;
		margin: 0 0 0.5em 0;
	}

	p {
		margin: 1em auto;
	}

	@media (min-width: 480px) {
		h1 {
			font-size: 4em;
		}
	}
</style>

<svelte:head>
	<title>{$page.status}</title>
</svelte:head>

<h1>{status}</h1>

{#if $page.error.message}
	<p class="error">{status}: {$page.error.message}</p>
{:else}
	<p class="error">Encountered a {$page.status} error</p>
{/if}
