<script>
	let { start = 0 } = $props();
	let count = $state(start);
</script>

<button onclick={() => count++}>clicked {count} times</button>
