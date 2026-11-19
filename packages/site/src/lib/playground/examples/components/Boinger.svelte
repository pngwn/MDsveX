<script>
	let { color = 'pink' } = $props();

	let boing = $state(false);
</script>

<button
	class:boing
	style:background={color}
	onclick={() => (boing = !boing)}
	aria-label="boing"
></button>

<style>
	button {
		width: 60px;
		height: 60px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.3s cubic-bezier(0.5, 2, 0.5, 0.75);
	}

	.boing {
		transform: translateY(-20px) scale(1.2);
	}
</style>
