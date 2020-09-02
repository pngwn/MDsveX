<script>
	export let segment;
</script>

<style>
	nav {
		/* background-color: rgba(255, 102, 0, 0.05); */
		border-bottom: 1px solid #ff6600;
		color: var(--fg-light);
		font-weight: 300;
		padding: 0 1em;
	}

	.icon {
		display: block;
		width: 1em;
		height: 1em;
		float: left;
		font-size: 2em;
		position: relative;
		top: 0.4em;
		box-sizing: border-box;
		margin: 0 0.5em 0 0;
	}

	ul {
		margin: 0;
		padding: 0;
	}

	ul::after {
		content: '';
		display: block;
		clear: both;
	}

	li {
		display: block;
		float: left;
	}

	.about {
		float: right;
	}

	.selected {
		position: relative;
		display: inline-block;
		color: var(--fg);
	}

	.selected::after {
		position: absolute;
		content: '';
		width: calc(100% - 1em);
		height: 2px;
		background-color: #ff6600;
		display: block;
		bottom: 0;
	}

	a {
		color: inherit;
		text-decoration: none;
		padding: 1em 0.5em;
		display: block;
		font-weight: 500;
	}

	@media (min-width: 400px) {
		.icon {
			margin: 0 0.5em 0 0;
		}

		li {
			display: inline-block;
		}
	}
</style>

<nav>
	<img alt="Svelte Hacker News logo" class="icon" src="favicon.png">

	<ul>
		<li><a rel="prefetch" class='{segment === "top" ? "selected" : ""}' href='top/1'>top</a></li>
		<li><a rel="prefetch" class='{segment === "new" ? "selected" : ""}' href='new/1'>new</a></li>
		<li><a rel="prefetch" class='{segment === "show"? "selected" : ""}' href='show/1'>show</a></li>
		<li><a rel="prefetch" class='{segment === "ask" ? "selected" : ""}' href='ask/1'>ask</a></li>
		<li><a rel="prefetch" class='{segment === "jobs" ? "selected" : ""}' href='jobs/1'>jobs</a></li>

		<li class='about'><a rel="prefetch" class='{segment === "about" ? "selected" : ""}' href='about'>about</a></li>
	</ul>
</nav>