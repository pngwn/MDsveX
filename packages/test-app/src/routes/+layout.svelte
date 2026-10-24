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
		<a href="/template">template</a>
		<a href="/steps">steps</a>
		<a href="/tabs">tabs</a>
		<a href="/elements">elements</a>
		<a href="/embeds">embeds</a>
		<a href="/figures">figures</a>
		<a href="/code-blocks">code blocks</a>
		<a href="/external-links">external links</a>
		<a href="/toc">toc</a>
		<a href="/run">run</a>

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
