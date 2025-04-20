<script>
	import './mono.css';
	import './prism.css';
	import './style.css';
</script>

<nav class="menu">
	<div class="inner">
		<a href="/preprocess">preprocess</a>
		<a href="/compile">compile-server</a>
		<a href="/compile-browser">compile-browser</a>
	</div>
</nav>
<main>
	<slot />
</main>

<style>
	.inner {
		font-size: 0.8rem;
	}

	main {
		padding: 2rem;
	}
</style>
