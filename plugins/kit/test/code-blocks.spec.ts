import { code_blocks, figures, kit } from '@mdsvex/plugin-kit';
import { compile } from 'mdsvex';
import { create_highlight } from 'mdsvex/highlight';
import { describe, expect, test } from 'vitest';

const FENCE = '```js title="a.js" caption="Run it"\nlet a = 1;\n```\n';

describe('compile', () => {
	test('replaces pre with the code block of the package', () => {
		expect(
			compile(FENCE, { plugins: [code_blocks()], highlight: false }).code
		).toBe(
			[
				'<script>',
				"import { pre as Pre_MDSVEX_G } from '@mdsvex/plugin-kit/code-blocks';",
				'</script><Pre_MDSVEX_G lang={"js"} meta={"title=\\"a.js\\" caption=\\"Run it\\""} title={"a.js"} caption={"Run it"} code={"let a = 1;"}><pre><code class="language-js">let a = 1;</code></pre></Pre_MDSVEX_G>',
			].join('\n')
		);
	});

	test('css false imports the component without the stylesheet', () => {
		expect(
			compile(FENCE, { plugins: [code_blocks({ css: false })] }).code
		).toContain("from '@mdsvex/plugin-kit/code-blocks/unstyled';");
	});

	test('a highlighted fence is passed whole, with no figure around it', async () => {
		const { code } = compile(FENCE, {
			plugins: [code_blocks()],
			highlight: await create_highlight(),
		});
		expect(code).toContain(
			'code={"let a = 1;"}><pre class="twinkleplop language-js"'
		);
		expect(code).not.toContain('<figure');
	});

	test('nocopy is a prop', () => {
		expect(
			compile('```sh nocopy\nls\n```\n', {
				plugins: [code_blocks()],
				highlight: false,
			}).code
		).toContain('nocopy={true} code={"ls"}>');
	});

	test('a pre of the site replaces the one of the plugin', () => {
		const { code } = compile(FENCE, {
			plugins: [code_blocks()],
			components: [{ specifier: '#lib/markdown.js', names: ['pre'] }],
		});
		expect(code).not.toContain('plugin-kit');
	});

	test('the three plugins of the package sit side by side', () => {
		const { code } = compile(
			':::details[Code]\n' + FENCE + ':::\n\n:::figure[A]\n![a](/a.png)\n:::\n',
			{
				plugins: [kit(), figures(), code_blocks()],
				highlight: false,
				unwrap_images: true,
			}
		);
		expect(code).toContain(
			"import { details as Details_MDSVEX_D_G } from '@mdsvex/plugin-kit/directives';"
		);
		expect(code).toContain(
			"import { pre as Pre_MDSVEX_G } from '@mdsvex/plugin-kit/code-blocks';"
		);
		expect(code).toContain(
			"import { figure as Figure_MDSVEX_D_G } from '@mdsvex/plugin-kit/figures';"
		);
	});
});
