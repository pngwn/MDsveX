<script lang="ts">
import "../../app.css";
// import '../../highlight-styles.css';

let { children } = $props();
</script>

<div class="app">
	<main class="main">
		<div class="container">
			{@render children?.()}
		</div>
	</main>
</div>

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 0;
	}

	.container {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 0rem 2rem 1rem;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
