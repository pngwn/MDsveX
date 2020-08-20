<script context="module">
	import { P, H1, H2, H3, h4 } from './components/';

	export const p = P,
		h1 = H1;
	export { H3 as h3 };
	export { h4, H2 as h2 };

	export function em() {}

	export class strong {}
</script>

<slot />
