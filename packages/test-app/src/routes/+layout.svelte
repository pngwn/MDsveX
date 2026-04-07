<script>
import "./mono.css";
import "./prism.css";
import "./style.css";

import "@fontsource/source-code-pro";

let {children} = $props()
</script>





<nav class="menu">
	<div class="inner">
		<a href="/preprocess">preprocess</a>

	</div>
</nav>
<main>
	{@render children?.()}
</main>

<style>
	.inner {
		font-size: 0.8rem;
	}

	main {
		padding: 2rem;
	}
</style>
