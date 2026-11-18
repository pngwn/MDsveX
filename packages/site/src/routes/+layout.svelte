<script>
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import Frame from "$lib/design/Frame.svelte";
import { provide_theme } from "$lib/design/theme.svelte";
import Nav from "$lib/Nav.svelte";

let { children } = $props();

// prerendered pages can't read the query, so ?theme is read once in the browser
const theme = provide_theme();
afterNavigate(({ to }) => to && theme.from(to.url));
</script>

<!-- the playground owns the viewport and draws the nav in its own bar -->
{#if page.route.id?.startsWith("/playground")}
	{@render children()}
{:else}
	<Frame theme={theme.value}>
		{#snippet nav()}
			{#if page.url.pathname.startsWith("/docs/")}<a class="skip" href="#docs-article">Skip to article</a>{/if}
			<Nav />
		{/snippet}

		{@render children()}
	</Frame>
{/if}

<style>
	.skip {
		position: absolute;
		z-index: 5;
		transform: translateY(-200%);
		padding: 0.5rem;
		color: var(--ink);
		background: var(--paper);
	}
	.skip:focus { transform: none; }
</style>
