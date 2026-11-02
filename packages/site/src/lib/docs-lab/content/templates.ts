// docs/guides/templates as data: routes/docs/guides/templates/+page.svx split
// into units, its prose as written. The page's own code is kept as code. Where
// a unit's hero is a document, it is compiled with the guide's two templates
// (`setup: 'templates'`), so "you get" is mdsvex's real output: which
// template it imports, what it passes, what stays outside it. The documents
// marked `from_prose` are the smallest ones that show what the sentence says
import type { PageSpec } from '../types';

const config = `// vite.config.js
mdsvex({
	templates: {
		default: '#lib/templates/Post.svelte',
		docs: '#lib/templates/Docs.svelte'
	}
});`;

const post = `<!-- src/lib/templates/Post.svelte -->
<script>
	let { title, date, children } = $props();
</script>

<article>
	<h1>{title}</h1>
	<time datetime={date}>{date}</time>

	{@render children()}
</article>`;

const select = `mdsvex({
	templates: {
		default: '#lib/templates/Post.svelte',
		docs: '#lib/templates/Docs.svelte'
	},
	select_template: (id) =>
		id.includes('/changelog/') ? false : id.includes('/docs/') ? 'docs' : undefined
});`;

const query = `<script>
	import Intro from './intro.svx?template=false';
</script>

<Intro />`;

export const templates: PageSpec = {
	slug: 'templates',
	kicker: 'Guides',
	href: '/docs/guides/templates',
	title: 'Templates',
	lede: [
		"A template is a Svelte component that wraps documents. It's the place for a document's title, byline and surrounding layout, and it can [replace the elements](/docs/guides/components) of the documents it wraps. mdsvex 0.x called these layouts.",
	],
	sections: [
		{
			id: 'defining-templates',
			title: 'Defining templates',
			units: [
				{
					id: 'name-them',
					mark: '#lib',
					tone: 'comp',
					title: 'Name your templates',
					lede: 'Name your templates in the `templates` option:',
					code: [{ lang: 'js', code: config }],
					example: {
						source: '---\ntitle: Hello\ndate: 2026-11-02\n---\n\n# Hello\n\nA post.\n',
						file: 'src/routes/hello/+page.svx',
						setup: 'templates',
						from_prose: true,
					},
					body: "Each value is a specifier, resolved from the project root like an import, or a `URL`, such as `new URL('./src/Blog.svelte', import.meta.url)`.",
					try: [{ change: 'Give the post a `template: docs` key, and it imports `Docs.svelte` instead.', source: '---\ntitle: Hello\ndate: 2026-11-02\ntemplate: docs\n---\n\n# Hello\n\nA post.\n' }],
				},
				{
					id: 'render-children',
					mark: '{@}',
					tone: 'expr',
					title: 'A template renders the document',
					lede: 'A template renders the document with `{@render children()}`:',
					code: [{ lang: 'svelte', code: post }],
					body: 'Templates are ordinary components, so editing one hot reloads the documents that use it.',
					see: 'See the [templates playground example](/playground/templates).',
				},
			],
		},
		{
			id: 'documents-as-templates',
			title: 'Documents as templates',
			units: [
				{
					id: 'document-template',
					mark: '.svx',
					tone: 'para',
					title: 'Documents as templates',
					lede: 'A template can be a document too, so its own content is markdown. Like a component, it reads its props and renders `children`. This is `src/lib/templates/Note.svx`:',
					example: {
						source: '<script>\n\tlet { title, children } = $props();\n</script>\n\n# {title}\n\n{@render children()}\n\nWritten by the _docs team_.\n',
						file: 'src/lib/templates/Note.svx',
					},
					code: [{ lang: 'js', code: "mdsvex({\n\ttemplates: { note: '#lib/templates/Note.svx' }\n});" }],
					see: 'It can [replace elements](/docs/guides/components#replacing-elements-in-a-template) from its `<script module>`, as a component does.',
					edges: [
						"As a template it is never wrapped in a template itself, so a `template` key in its frontmatter, `select_template` and the `default` entry don't apply to it.",
					],
				},
			],
		},
		{
			id: 'choosing-a-template',
			title: 'Choosing a template',
			units: [
				{
					id: 'first-answer',
					mark: '---',
					tone: 'text',
					title: 'The first answer wins',
					lede: "mdsvex picks a document's template from the first of these that gives an answer:\n\n1. The `?template=` query on the import, see [opting out](/docs/guides/templates#opting-out).\n2. The `template` key in the frontmatter, a template name or `false`.\n3. `select_template(id, metadata)`, if you configured one.\n4. The `default` entry in `templates`.\n5. Otherwise, no template.",
					example: { source: '---\ntitle: Writing docs\ntemplate: docs\n---\n', setup: 'templates' },
					edges: ['An unknown name is an error that lists the templates you configured.'],
					error: { source: '---\ntitle: Writing docs\ntemplate: blog\n---\n', setup: 'templates', from_prose: true },
					try: [
						{ change: 'Ask for `template: blog`, a name the config doesn\'t have. The error lists the ones it does.', source: '---\ntitle: Writing docs\ntemplate: blog\n---\n' },
						{ change: 'Take the `template` key out, and the `default` entry answers.', source: '---\ntitle: Writing docs\n---\n' },
					],
				},
				{
					id: 'select-template',
					mark: '=>',
					tone: 'expr',
					title: '`select_template`',
					lede: '`select_template` runs for documents whose frontmatter has no `template` key. It gets the file path and the metadata. It returns a template name, `false` for none, or `undefined` to fall through to `default`:',
					code: [{ lang: 'js', code: select }],
				},
			],
		},
		{
			id: 'opting-out',
			title: 'Opting out',
			units: [
				{
					id: 'template-false',
					mark: 'false',
					tone: 'text',
					title: '`template: false`',
					lede: '`template: false` in the frontmatter renders a document without one:',
					example: { source: '---\ntemplate: false\n---\n', setup: 'templates' },
					try: [{ change: 'Add a paragraph under the frontmatter. It renders bare, with no template around it.', source: '---\ntemplate: false\n---\n\nBare.\n' }],
				},
				{
					id: 'template-query',
					mark: '?=',
					tone: 'link',
					title: 'For one import',
					lede: 'To choose for one import only, add `?template=` to it. `?template=false` unwraps the document and `?template=docs` picks another template. The query wins over the frontmatter:',
					code: [{ lang: 'svelte', code: query }],
				},
			],
		},
		{
			id: 'template-props',
			title: 'Template props',
			units: [
				{
					id: 'props',
					mark: '$props',
					tone: 'expr',
					title: 'What a template gets',
					lede: "A template gets:\n\n- every frontmatter key as its own prop, so `let { title } = $props()` reads `title`;\n- `plugin_data`, what the plugins left for the document, when they left any (see [plugin data](/docs/plugins/writing/plugin-data));\n- `children`, a snippet that renders the document;\n- the props passed to the document, so `<Post featured />` reaches the template as `featured`.",
					example: { source: '---\ntitle: Hello\n---\n\n# Hello\n', setup: 'templates', from_prose: true },
					edges: [
						"The frontmatter can't have a `children` key when the document has a template, nor a `plugin_data` key when its plugins left data. Each is an error that points at the line.",
					],
					error: { source: '---\ntitle: Hello\nchildren: none\n---\n\n# Hello\n', setup: 'templates', from_prose: true },
					body: 'A document that reads its own props with `let props = $props()` still forwards them all to its template. If it destructures them, `let { featured } = $props()`, it forwards none, as `$props()` can only be called once.',
					try: [{ change: 'Add a `children: none` key. It collides with the template\'s `children`, and the error points at its line.', source: '---\ntitle: Hello\nchildren: none\n---\n\n# Hello\n' }],
				},
			],
		},
		{
			id: 'what-gets-hoisted',
			title: 'What gets hoisted',
			units: [
				{
					id: 'hoisted',
					mark: '<head>',
					tone: 'comp',
					title: 'What gets hoisted',
					lede: 'Some things only work at the top level of a component, so they stay outside the template:\n\n- `<script>` and `<script module>`;\n- `<style>`;\n- `<svelte:head>`, `<svelte:window>`, `<svelte:body>`, `<svelte:document>` and `<svelte:options>`.',
					example: {
						source: '---\ntitle: Hello\n---\n\n<svelte:head>\n\t<title>Hello</title>\n</svelte:head>\n\n# Hello\n\n<style>\n\th1 { color: tomato }\n</style>\n',
						setup: 'templates',
						from_prose: true,
					},
					body: 'Everything else, markdown, HTML and components alike, is the document body that the template renders as `children`.',
					try: [{ change: 'Add a `<svelte:window />` under the heading. It moves out beside the `<svelte:head>`.', source: '---\ntitle: Hello\n---\n\n<svelte:head>\n\t<title>Hello</title>\n</svelte:head>\n\n# Hello\n\n<svelte:window />\n' }],
				},
			],
		},
	],
};
