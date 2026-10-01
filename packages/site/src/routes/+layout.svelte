<script>
import { page } from "$app/state";
import Nav from "../components/Nav.svelte";

let { children } = $props();
</script>

{#if !page.route.id?.startsWith("/playground")}
	<Nav />
{/if}

{@render children()}
