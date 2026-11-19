<script>
	let count = $state(0);
</script>

<button onclick={() => (count += 1)}>
	clicked {count} {count === 1 ? 'time' : 'times'}
</button>
