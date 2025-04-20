<script>
	import { compile, code_highlighter } from 'mdsvex';
	import { onMount } from 'svelte';
	import { sample } from '$lib';

	let html = '';

	async function _compile() {
		console.log('compile', {});
		let result = await compile(sample, {
			highlight: {
				highlighter: async (...args) => {
					const r = await code_highlighter(...args);
					return r.replace(/\}\<\/pre\>/, '</pre>').replace(/\{@html `/, '');
				},
			},
		});

		html = result?.code ?? '';
	}

	onMount(() => {
		_compile();
	});
</script>

{@html html}
