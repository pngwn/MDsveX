<script lang="ts">
	// direction two, margins: a docs page as a critical edition. The example is
	// the text, set large in the main column; the prose is the commentary
	// beside it, narrower; the edges, the CommonMark notes and the see-alsos
	// are the apparatus in the outer margin. Learn's differences from
	// CommonMark are set as an edition sets variant readings: one text, and
	// what each witness, CommonMark and mdsvex, makes of it.
	//
	// The running head is the strip: the page's marks in a line, each a link,
	// under the docs drawer, which holds the folio
	import Shell from '../Shell.svelte';
	import Pair from '../Pair.svelte';
	import ReadingSwitch from '../ReadingSwitch.svelte';
	import ContrastSource from '../ContrastSource.svelte';
	import Witness from '../Witness.svelte';
	import { provide_reading } from '../reading.svelte';
	import { marks_of } from '../strip';
	import type { BuiltPage } from '../types';

	let { page }: { page: BuiltPage } = $props();

	// a page is one section for its life
	// svelte-ignore state_referenced_locally
	provide_reading(page.kicker === 'Learn' ? 'learn' : 'guides');

	const marks = $derived(marks_of(page));
	const strip_tags = (html: string) => html.replace(/<[^>]+>/g, '');
	const numbered = $derived(page.sections.map((s, i) => ({ ...s, n: i + 1 })));
</script>

<svelte:head>
	<title>{page.title} · margins · docs lab</title>
</svelte:head>

<Shell current={page.href} nav="top" direction="Margins">
	<div class="running riso">
		<nav class="signs" aria-label="On this page">
			{#if page.slug === 'markdown'}
				{#each marks as m (m.id)}
					<a href="#{m.id}" title={m.name} style:color="var(--name-{m.tone})"><span aria-hidden="true">{m.mark}</span><span class="sr">{m.name}</span></a>
				{/each}
			{:else}
				{#each numbered as s (s.id)}
					<a class="sec" href="#{s.id}">{s.n} {s.title}</a>
				{/each}
			{/if}
		</nav>
		<div class="switch"><ReadingSwitch /></div>
	</div>

	<header class="title-page">
		<p class="kicker riso">{page.kicker}</p>
		<h1 class="rag">{page.title}</h1>
		<div class="lede">{@html page.lede[0]}</div>
		{#if page.lede.length > 1}
			<aside class="margin title-margin">
				{#each page.lede.slice(1) as p, i (i)}{@html p}{/each}
			</aside>
		{/if}
	</header>

	{#each numbered as s (s.id)}
		<section class="section" id={s.id} aria-labelledby="{s.id}-h">
			<h2 id="{s.id}-h"><span class="n riso">{s.n}</span> <a href="#{s.id}">{s.title}</a></h2>
			{#if s.lede}
				<div class="passage">
					<div class="comment">{@html s.lede}</div>
				</div>
			{/if}

			{#if s.contrasts?.length}
				<ol class="apparatus">
					{#each s.contrasts as c, i (c.id)}
						<li class="variant passage" id={c.id} style:--own-name="var(--name-{c.tone})">
							<div class="comment">
								<p class="lemma"><span class="vn riso">{s.n}.{i + 1}</span> {@html c.write}</p>
							</div>
							<div class="text">
								<ContrastSource contrast={c} />
								<div class="witnesses">
									<div class="w">
										<p class="siglum riso">{c.gfm ? 'GFM' : 'CommonMark'} <span>{@html c.commonmark}</span></p>
										<Witness reading={c.commonmark_reading} label={c.gfm ? 'GFM' : 'CommonMark'} />
									</div>
									<div class="w">
										<p class="siglum riso">mdsvex <span>{@html c.mdsvex}</span></p>
										<Witness reading={c.mdsvex_reading} label="mdsvex" />
									</div>
								</div>
							</div>
							<aside class="margin">
								{#if c.fix}<p><span class="tag riso">Instead</span> {@html c.fix}</p>{/if}
							</aside>
						</li>
					{/each}
				</ol>
			{/if}

			{#if s.added?.length}
				<div class="passage">
					<dl class="added text">
						{#each s.added as a (a.id)}
							<div id={a.id}>
								<dt><span class="add-mark" style:color="var(--name-{a.tone})" aria-hidden="true">{a.mark}</span> {@html a.write}</dt>
								<dd>{@html a.get}</dd>
							</div>
						{/each}
					</dl>
				</div>
			{/if}

			{#each s.units as u (u.id)}
				<div class="passage unit" id={u.id}>
					<div class="comment">
						<span class="unit-mark" style:color="var(--name-{u.tone})" aria-hidden="true">{u.mark}</span>
						{#if strip_tags(u.title) !== s.title}<h3>{@html u.title}</h3>{/if}
						{#if u.lede}{@html u.lede}{/if}
						{#if u.body}<div class="after">{@html u.body}</div>{/if}
					</div>
					<div class="text">
						{#if u.code}
							{#each u.code as c, i (i)}<div class="code">{@html c.html}</div>{/each}
						{/if}
						{#if u.example}
							<Pair example={u.example} name={u.id.replace(/-/g, ' ')} />
						{/if}
					</div>
					{#if u.edges?.length || u.error || u.commonmark || u.see}
						<aside class="margin">
							{#each u.edges ?? [] as edge, i (i)}<p><span class="tag riso">Edge</span> {@html edge}</p>{/each}
							{#if u.error}
								<div class="err">
									{@html u.error.source_html}
									<p class="riso"><span>Error</span> {u.error.error}</p>
								</div>
							{/if}
							{#if u.commonmark}<p><span class="tag riso">CommonMark</span> {@html u.commonmark}</p>{/if}
							{#if u.see}<p><span class="tag riso">See</span> {@html u.see}</p>{/if}
						</aside>
					{/if}
				</div>
			{/each}

			{#if s.after}<div class="passage"><div class="comment">{@html s.after}</div></div>{/if}
		</section>
	{/each}
</Shell>

<style>
	/* the running head: the page's marks and the switch, under a hairline */
	.running {
		position: sticky;
		top: 0;
		z-index: 4;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 1.5rem;
		margin: 0 calc(var(--gutter) * -1);
		padding: 0.6rem var(--gutter);
		background: var(--paper);
		border-bottom: 1px solid var(--ink);
		font: 400 0.75rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
	}

	.signs {
		display: flex;
		gap: 0.25rem 1.1rem;
		overflow-x: auto;
		scrollbar-width: none;
		font-size: 0.9375rem;
		white-space: nowrap;
	}

	.signs a {
		text-decoration: none;
	}

	.signs a:hover {
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	.signs .sec {
		font-size: 0.75rem;
		color: var(--quiet);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.switch :global(.note) {
		display: none;
	}

	.switch :global(.what) {
		white-space: nowrap;
	}

	@media (max-width: 759px) {
		.running {
			gap: 1rem;
		}
	}

	/* the book's measure: commentary, the text, the margin */
	.title-page,
	.passage,
	.section > h2 {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: 2.5rem;
	}

	@media (min-width: 760px) {
		.passage,
		.section > h2,
		.title-page {
			grid-template-columns: minmax(0, 1fr) 13rem;
		}

		.margin {
			grid-column: 2;
			grid-row: 1 / span 2;
		}
	}

	@media (min-width: 1180px) {
		.passage,
		.section > h2,
		.title-page {
			grid-template-columns: 17rem minmax(0, 1fr) 13rem;
		}

		.comment {
			grid-column: 1;
		}

		.text {
			grid-column: 2;
			grid-row: 1;
		}

		.margin {
			grid-column: 3;
			grid-row: 1;
		}
	}

	.title-page {
		padding: clamp(2rem, 6vw, 4.5rem) 0 clamp(1.5rem, 4vw, 3rem);
	}

	.title-page > * {
		grid-column: 1 / -1;
	}

	@media (min-width: 760px) {
		.title-page > .title-margin {
			grid-column: 2;
			grid-row: 3;
			align-self: end;
		}

		.title-page > .lede {
			grid-column: 1;
		}
	}

	@media (min-width: 1180px) {
		.title-page > * {
			grid-column: 2;
		}

		.title-page > .title-margin {
			grid-column: 3;
		}

		.title-page > .lede {
			grid-column: 2;
		}
	}

	.title-margin :global(p) {
		margin: 0;
	}

	.kicker {
		margin: 0 0 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	h1 {
		margin: 0 0 1.5rem;
		font: 400 clamp(3rem, 8vw, 6rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	.lede {
		max-width: 40rem;
		font-size: 1.1875rem;
		line-height: 1.55;
	}

	.lede :global(p) {
		margin: 0 0 0.75rem;
	}

	.section {
		margin-top: clamp(2.5rem, 5vw, 4rem);
		scroll-margin-top: 3.5rem;
	}

	/* a section opens on a rule, its number in the commentary column */
	h2 {
		margin: 0 0 1.75rem;
		padding-top: 1rem;
		border-top: 1.5px solid var(--ink);
		font: 400 clamp(1.75rem, 3vw, 2.25rem) / 1.1 var(--face-display);
	}

	h2 .n {
		font: 400 0.8125rem / 1 var(--face-mono);
		color: var(--quiet);
		padding-top: 0.75rem;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	@media (min-width: 1180px) {
		h2 .n {
			grid-column: 1;
		}

		h2 a {
			grid-column: 2 / 4;
		}
	}

	.passage {
		row-gap: 1rem;
		margin-bottom: clamp(2rem, 4vw, 3.25rem);
		scroll-margin-top: 3.5rem;
	}

	.comment {
		min-width: 0;
		font-size: 1.0625rem;
		line-height: 1.55;
	}

	.comment :global(p),
	.comment :global(ol),
	.comment :global(ul) {
		margin: 0 0 0.75rem;
	}

	.comment :global(:is(ol, ul)) {
		padding-left: 1.3rem;
	}

	.comment :global(li) {
		margin: 0.25rem 0;
	}

	h3 {
		margin: 0 0 0.5rem;
		font: italic 400 1.3125rem / 1.2 var(--face-display);
	}

	h3 :global(code) {
		font-style: normal;
		font-size: 0.8em;
	}

	.unit-mark {
		display: block;
		margin-bottom: 0.375rem;
		font: normal 400 0.875rem / 1.2 var(--face-mono);
		font-variant-ligatures: none;
	}

	.after {
		padding-top: 0.25rem;
	}

	.text {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-content: start;
		min-width: 0;
	}

	.code :global(pre) {
		margin: 0;
	}

	/* the apparatus: sidenotes in the small text, each opened by what it is */
	.margin {
		min-width: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--ink);
	}

	@media (max-width: 759px) {
		.margin {
			padding: 0.25rem 0 0 0.875rem;
			border-left: 1px solid var(--staff);
		}
	}

	.margin p {
		margin: 0 0 0.625rem;
	}

	.tag {
		display: block;
		font: 400 0.6875rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	.err {
		margin-bottom: 0.625rem;
	}

	.err :global(pre) {
		margin: 0 0 0.375rem;
		font-size: 0.75rem;
	}

	.err p {
		margin: 0;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--line-item);
		font: 400 0.6875rem / 1.5 var(--face-mono);
		overflow-wrap: anywhere;
	}

	.err p span {
		color: var(--name-item);
	}

	/* variant readings: the lemma in the commentary, the text and its witnesses */
	.apparatus {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.variant {
		padding-bottom: clamp(1.25rem, 3vw, 2rem);
		margin-bottom: clamp(1.25rem, 3vw, 2rem);
		border-bottom: 1px solid var(--staff);
	}

	.lemma {
		margin: 0;
		font: 400 1.1875rem / 1.35 var(--face-display);
	}

	.lemma :global(code) {
		color: var(--own-name);
		font-size: 0.85em;
	}

	.vn {
		display: block;
		margin-bottom: 0.25rem;
		font: 400 0.75rem / 1.2 var(--face-mono);
		color: var(--quiet);
	}

	.witnesses {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
		gap: 1rem 1.75rem;
	}

	.siglum {
		margin: 0 0 0.375rem;
		font: 400 0.6875rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	.siglum span {
		display: block;
		margin-top: 0.125rem;
		font: italic 400 0.9375rem / 1.35 var(--face-text);
		letter-spacing: 0;
		text-transform: none;
		color: var(--ink);
	}

	.added {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: 0.875rem 2rem;
	}

	@media (min-width: 1180px) {
		.added {
			grid-column: 1 / 3;
		}
	}

	.added div {
		padding-top: 0.5rem;
		border-top: 1px solid var(--staff);
		scroll-margin-top: 3.5rem;
	}

	.added dt {
		font-size: 0.9375rem;
	}

	.add-mark {
		display: inline-block;
		min-width: 2.75rem;
		font: 400 1rem / 1 var(--face-mono);
	}

	.added dd {
		margin: 0.125rem 0 0 2.75rem;
		font: italic 400 0.9375rem / 1.4 var(--face-text);
		color: var(--quiet);
	}
</style>
