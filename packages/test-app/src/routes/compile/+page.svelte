<script>
	import { compile } from '../../../../mdsvex/dist/main.js';

	async function _compile() {
		console.log('compile');
		const { code } = await compile('Hello, world!');

		console.log(code);
	}

	_compile();
</script>
