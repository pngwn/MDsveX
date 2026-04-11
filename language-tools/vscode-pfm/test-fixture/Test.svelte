<script lang="ts">
	import { T } from 'vitest/dist/chunks/reporters.d.79o4mouw';
	import Test from './Test.svelte';
	export let value: number;
	export let label: string = 'Count';
	export let count: number = 0;
	export let onClick: () => void = () => {};
</script>

{#if value > 0}
	<p>{label}: {value}</p>
{:else}
	<p>No {label.toLowerCase()} yet.</p>
{/if}

<Test value={'value'} label={1} />
