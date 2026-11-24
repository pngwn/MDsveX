<script>
	// an attribute arrives as a string
	let { count = '0' } = $props();
	let value = $state(Number(count) || 0);
</script>

<button onclick={() => value++}>clicked {value} {value === 1 ? 'time' : 'times'}</button>

<style>
	button {
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--line-comp);
		border-radius: 0;
		color: var(--name-comp);
		background: none;
		font: inherit;
		cursor: pointer;
	}
</style>
