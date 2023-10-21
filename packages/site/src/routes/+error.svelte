<script>
	import { dev } from '$app/environment';

	export let status;
	export let error;
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
	<title>{status}</title>
</svelte:head>

<h1>{status}</h1>

{#if error.message}
	<p class="error">{status}: {error.message}</p>
{:else}
	<p class="error">Encountered a {status} error</p>
{/if}

{#if dev && error.stack}
	<pre>{error.stack}</pre>
{/if}
