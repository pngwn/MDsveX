<script lang="ts">
	import ArticleMain from "$lib/docs/components/ArticleMain.svelte";
	import ArticleOtp from "$lib/docs/components/ArticleOtp.svelte";
	import CodeBlock from "$lib/docs/components/CodeBlock.svelte";
	import FaqList from "$lib/docs/components/FaqList.svelte";
	import { language as ts_language } from "@twinkleplop/typescript";
	import { language as bash_language } from "@twinkleplop/bash";

	const ts = ts_language();
	const bash = bash_language();

	const install_html = bash(`# core + one language
npm install @twinkleplop/core @twinkleplop/html`);

	const lazy_html = ts(`const { default: language } = await import('@twinkleplop/rust');
const rust = language();`);

	const tokens_html = ts(`import { tokenizer } from '@twinkleplop/html';

const html_tokenizer = tokenizer();

// get some tokens
const tokens = html_tokenizer("hello world");`);
</script>

<ArticleMain
	pane_path="docs / faq"
	title="frequently asked"
	subtitle="Short answers to the things that come up most often. If something here is wrong or missing, the source for this page lives in <code>docs/faq.md</code>."
>

{#snippet shiki()}
		Twinkleplop is significantly **smaller** than Shiki and an order of magnitude faster. It offers similar quality highlighting in terms of correctness and granularity and also offers a similar toolkit for authoring code snippets.

		Unlike Shiki, Twinkleplop owns _most_ of its stack, grammars are bespoke and not a downstream concern. Bugs in twinkleplop are bugs in twinkleplop.
{/snippet}

{#snippet prism()}

		Twinkleplop is a little larger than Prism but faster (the delta is not as great as against shiki, 3-6x typically). Twinkleplop is ESM and bundler friendly, and treeshakable.
		Twinkleplop typically provides higher quality highlighting than Prism and a much richer toolkit. Twinkleplop also supports all features in all environments.

	{/snippet}

{#snippet a_install()}

			Pick a package manager. Both the core and any language modules are published under the
			<code>@twinkleplop</code> scope.

		<CodeBlock fname="install.sh" lang="shell" html={install_html} />
		That's it — no peer dependencies, no postinstall scripts, no native bindings.

		{/snippet}

{#snippet a_runtimes()}

			Both. Every package ships ESM, CJS, and a browser-ready IIFE. There are no Node-only APIs in
			the runtime path, so the same import works in a Worker, a Cloudflare edge function, or a
			vanilla <code>&lt;script&gt;</code> tag.

{/snippet}

{#snippet a_one_per_lang()}

			Languages are self-contained packages. You install and import only what you need, and
			tree-shaking does the rest. A page that highlights only HTML doesn't pay for the TypeScript
			grammar.


			Embedded languages — say, JS inside an HTML <code>&lt;script&gt;</code> tag — are an
			implementation detail of the parent language. You don't import them separately.

{/snippet}

{#snippet a_lazy()}

			Yes. Every language package is a default-exported factory, so dynamic <code>import()</code>
			works out of the box:

		<CodeBlock fname="lazy.ts" lang="typescript" html={lazy_html} />

			Use this when the language depends on user input — an in-browser playground, for example —
			and you'd rather not ship every grammar up front.

{/snippet}

	{#snippet a_supported()}
		The first-party set covers most of what you'd want for a docs site or a code-review UI:
		<ul>
			<li>html, css, javascript, typescript, jsx, tsx</li>
			<li>json, yaml, toml, markdown, mdx</li>
			<li>rust, go, python, ruby, swift</li>
			<li>shell, sql, graphql, dockerfile</li>
		</ul>

			Anything else lives in <code>@twinkleplop-community/*</code>. Grammars there follow the same
			shape and are loaded the same way.

	{/snippet}

	{#snippet a_supported()}
The first-party set covers most of what you'd want for a docs site or a code-review UI:

- html, css, javascript, typescript, jsx, tsx
- json, yaml, toml, markdown, mdx
- rust, go, python, ruby, swift
- shell, sql, graphql, dockerfile

Anything else lives in <code>@twinkleplop-community/*</code>. Grammars there follow the same
shape and are loaded the same way.
	{/snippet}

	{#snippet a_html_or_tokens()}

			Both. The default export gives you a highlighter that returns HTML; the
			<code>tokenizer</code> export gives you the raw token stream for custom rendering.

		<CodeBlock fname="tokenize.ts" lang="typescript" html={tokens_html} />

			Tokens are a flat array of <code>&#123; type, value, range &#125;</code> — no DOM, no React,
			no opinions. Render them however you like.

	{/snippet}

	{#snippet a_themes()}

			Themes are CSS. The highlighter emits stable class names per token type
			(<code>.tok-kw</code>, <code>.tok-str</code>, etc.) and ships a handful of starter sheets
			you can import or override.


			If you want to swap themes at runtime, toggle a class on a parent element and let the
			cascade do the work — there's no JS theme registry to fight with.

	{/snippet}

	{#snippet a_buildtime()}

			That's the recommended path for static sites. The same packages run in Node, Bun, or Deno,
			so you can pre-render every code block at build time and ship zero runtime JS.


			There are integrations for Astro, Eleventy, Next.js, and Vite under
			<code>@twinkleplop/integrations/*</code>.

	{/snippet}

	{#snippet a_size()}

		Core is roughly 4kb min+gzip. Each language adds between 2–9kb depending on grammar
			complexity. There is no shared regex blob — grammars are pre-compiled to small state
			machines at build time.

			{/snippet}

	{#snippet a_keystroke()}

			For most editor-sized inputs, yes. Tokenization is incremental: re-running the tokenizer on
			a slightly changed string reuses the previous run's state where it can.

			If you're highlighting a 50,000-line file on every keystroke, you'll want to debounce
			regardless of which library you pick.

			{/snippet}

	{#snippet a_add_lang()}

			Fork the monorepo, copy <code>packages/_template</code>, and write a grammar in the small
			DSL described in the contributor guide. Snapshot tests run against a fixtures directory of
			real-world code.


			If you want to publish under <code>@twinkleplop-community/*</code>, open an issue first so
			we can reserve the package name.

		{/snippet}

	{#snippet a_bug()}

			Open an issue with a minimal reproduction. The <code>create-twinkleplop-repro</code> CLI
			scaffolds one for you with the relevant package versions pinned.


			Security issues should go to <a href="mailto:security@twinkleplop.dev">security@twinkleplop.dev</a>
			instead of the public tracker.

	{/snippet}

	<FaqList
		initial_open="01-0"
		sections={[
			{
				id: "01",
				title: "getting started",
				items: [
					{ q: "How does this differ from shiki?", a: shiki },
					{ q: "How does this differ from prism?", a: prism },
					{ q: "How do I install it?", a: a_install },
					{ q: "Does it work in the browser, Node, or both?", a: a_runtimes },
				],
			},
			{
				id: "02",
				title: "loading languages",
				items: [
					{ q: "Why does each language need its own package?", a: a_one_per_lang },
					{ q: "Can I load a language at runtime?", a: a_lazy },
					{ q: "What languages are supported today?", a: a_supported },
				],
			},
			{
				id: "03",
				title: "rendering & output",
				items: [
					{ q: "Do I get HTML, tokens, or both?", a: a_html_or_tokens },
					{ q: "How do themes work?", a: a_themes },
					{ q: "Can I highlight at build time instead of in the browser?", a: a_buildtime },
				],
			},
			{
				id: "04",
				title: "performance & bundling",
				items: [
					{ q: "How big is the runtime?", a: a_size },
					{ q: "Is it fast enough to highlight on every keystroke?", a: a_keystroke },
				],
			},
			{
				id: "05",
				title: "contributing",
				items: [
					{ q: "How do I add a new language?", a: a_add_lang },
					{ q: "I found a bug — what now?", a: a_bug },
				],
			},
		]}
	/>

</ArticleMain>

<ArticleOtp
	title="faq"
	sections={[
		{ href: "#s-01", label: "§01 — getting started", active: true },
		{ href: "#s-02", label: "§02 — loading languages" },
		{ href: "#s-03", label: "§03 — rendering & output" },
		{ href: "#s-04", label: "§04 — performance & bundling" },
		{ href: "#s-05", label: "§05 — contributing" },
	]}
/>
