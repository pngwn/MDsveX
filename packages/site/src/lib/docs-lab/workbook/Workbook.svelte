<script lang="ts">
	// direction three, workbook: a docs page as short lessons, each around one
	// example a reader can edit, its output following as they type, with a
	// "now try" under it. The examples are static until touched; the first
	// touch loads real mdsvex in the browser. Learn's differences from CommonMark
	// are one bench with a key per difference. Code a reader doesn't write in a
	// document, a config or a component, is set between the lessons to read
	import Shell from '../Shell.svelte';
	import ReadingSwitch from '../ReadingSwitch.svelte';
	import { provide_reading } from '../reading.svelte';
	import { marks_of } from '../strip';
	import type { BuiltPage } from '../types';
	import Bench from './Bench.svelte';
	import ContrastBench from './ContrastBench.svelte';

	let { page }: { page: BuiltPage } = $props();

	// a page is one section for its life
	// svelte-ignore state_referenced_locally
	provide_reading(page.kicker === 'Learn' ? 'learn' : 'guides');

	const marks = $derived(marks_of(page));
	const lessons = $derived(page.sections.flatMap((s) => [...(s.contrasts?.length || s.bench ? [s.id] : []), ...s.units.filter((u) => u.example).map((u) => u.id)]));
	const n_of = (id: string) => lessons.indexOf(id) + 1;
	const pad = (n: number) => String(n).padStart(2, '0');
	const strip_tags = (html: string) => html.replace(/<[^>]+>/g, '');
</script>

<svelte:head>
	<title>{page.title} · workbook · docs lab</title>
</svelte:head>

<Shell current={page.href} direction="Workbook">
	<header class="page-head">
		<p class="kicker riso">{page.kicker} · {lessons.length} lessons</p>
		<h1 class="rag">{page.title}</h1>
		<div class="lede">
			{#each page.lede as p, i (i)}{@html p}{/each}
		</div>
		<ReadingSwitch />
	</header>

	{#if page.slug === 'markdown'}
		<nav class="keys" aria-label="On this page">
			{#each marks as m (m.id)}
				<a class="key" href="#{m.id}" title={m.name} style:--c-line="var(--line-{m.tone})" style:--c-name="var(--name-{m.tone})"
					><span aria-hidden="true">{m.mark}</span><span class="sr">{m.name}</span></a
				>
			{/each}
		</nav>
	{/if}

	{#each page.sections as s (s.id)}
		<section class="section" id={s.id} aria-labelledby="{s.id}-h">
			{#if s.contrasts?.length || s.bench}
				<div class="lesson">
					<div class="brief">
						<p class="no riso">Lesson {pad(n_of(s.id))}</p>
						<h2 id="{s.id}-h"><a href="#{s.id}">{s.title}</a></h2>
						{#if s.lede}{@html s.lede}{/if}
						{#if s.added?.length}
							<dl class="added">
								{#each s.added as a (a.id)}
									<div id={a.id}>
										<dt><span class="add-mark" style:color="var(--name-{a.tone})" aria-hidden="true">{a.mark}</span> {@html a.write}</dt>
										<dd>{@html a.get}</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</div>
					<div class="work">
						{#if s.contrasts?.length}<ContrastBench contrasts={s.contrasts} />{/if}
						{#if s.bench}<Bench example={s.bench} name={s.title.toLowerCase()} />{/if}
					</div>
				</div>
			{:else}
				<h2 class="plain-h" id="{s.id}-h"><a href="#{s.id}">{s.title}</a></h2>
				{#if s.lede}<div class="section-lede">{@html s.lede}</div>{/if}
			{/if}

			{#each s.units as u (u.id)}
				{#if u.example}
					<div class="lesson" id={u.id}>
						<div class="brief">
							<p class="no riso">Lesson {pad(n_of(u.id))}</p>
							{#if strip_tags(u.title) !== s.title}<h3>{@html u.title}</h3>{/if}
							{#if u.lede}{@html u.lede}{/if}
							{#if u.body}{@html u.body}{/if}
							{#if u.edges?.length || u.see || u.commonmark}
								<ul class="edges">
									{#each u.edges ?? [] as e, i (i)}<li>{@html e}</li>{/each}
									{#if u.commonmark}<li>{@html u.commonmark}</li>{/if}
									{#if u.see}<li>{@html u.see}</li>{/if}
								</ul>
							{/if}
						</div>
						<div class="work">
							{#if u.code}
								<div class="given">
									<p class="label riso">With</p>
									{#each u.code as c, i (i)}{@html c.html}{/each}
								</div>
							{/if}
							<Bench example={u.example} tries={u.try} name={u.id.replace(/-/g, ' ')} />
						</div>
					</div>
				{:else}
					<!-- code a reader reads rather than edits: a config, a component -->
					<div class="reading" id={u.id}>
						<div class="brief">
							<h3>{@html u.title}</h3>
							{#if u.lede}{@html u.lede}{/if}
						</div>
						<div class="work">
							{#each u.code ?? [] as c, i (i)}{@html c.html}{/each}
							{#if u.body}{@html u.body}{/if}
							{#if u.see}<p>{@html u.see}</p>{/if}
						</div>
					</div>
				{/if}
			{/each}
		</section>
	{/each}
</Shell>

<style>
	.page-head {
		display: grid;
		gap: 0.875rem;
		padding-bottom: 1.75rem;
	}

	.kicker {
		margin: 0;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	h1 {
		margin: 0;
		font: 400 clamp(3rem, 8vw, 6rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	.lede {
		max-width: 44rem;
		font-size: clamp(1.0625rem, 1.5vw, 1.1875rem);
		line-height: 1.55;
	}

	.lede :global(p) {
		margin: 0 0 0.625rem;
	}

	/* the strip as a row of keys, the marks a reader will type */
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding: 1.25rem 0 0.5rem;
		border-top: 1.5px solid var(--ink);
	}

	.key {
		display: grid;
		place-items: center;
		min-width: 2.5rem;
		height: 2.25rem;
		padding: 0 0.5rem;
		border: 1px solid var(--ink);
		border-bottom-width: 3px;
		border-bottom-color: var(--c-line);
		font: 400 0.9375rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--c-name);
		text-decoration: none;
	}

	.key:hover {
		background: color-mix(in srgb, var(--c-line) 13%, var(--paper));
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.section {
		scroll-margin-top: 1.5rem;
	}

	/* a lesson: the brief in a narrow column, the bench beside it, a rule over both */
	.lesson,
	.reading {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem clamp(1.75rem, 3vw, 3rem);
		padding: clamp(1.75rem, 3.5vw, 2.75rem) 0;
		border-top: 1.5px solid var(--ink);
		scroll-margin-top: 1.5rem;
	}

	.reading {
		border-top: 1px dashed var(--staff);
	}

	@media (min-width: 1100px) {
		.lesson,
		.reading {
			grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
		}
	}

	.brief {
		min-width: 0;
		font-size: 1.0625rem;
		line-height: 1.55;
	}

	.brief :global(p),
	.brief :global(ol),
	.brief :global(ul) {
		margin: 0 0 0.75rem;
	}

	.brief :global(:is(ol, ul)) {
		padding-left: 1.3rem;
	}

	.no {
		margin: 0 0 0.375rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--name-code);
	}

	h2,
	h3 {
		margin: 0 0 0.75rem;
		font: 400 clamp(1.625rem, 2.6vw, 2.125rem) / 1.1 var(--face-display);
		text-wrap: balance;
	}

	.reading h3 {
		font-size: 1.3125rem;
		font-style: italic;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	h3 :global(code) {
		font-size: 0.8em;
	}

	.plain-h {
		margin: clamp(2rem, 4vw, 3rem) 0 0.75rem;
		padding-top: 1rem;
		border-top: 1.5px solid var(--ink);
		font-style: italic;
	}

	/* the section's head rules the lesson under it, so the lesson's own rule goes */
	:is(.plain-h, .section-lede) + :is(.lesson, .reading) {
		border-top: 0;
		padding-top: 0.75rem;
	}

	.section-lede {
		max-width: 40rem;
		padding-bottom: 1rem;
	}

	.section-lede :global(p) {
		margin: 0;
	}

	.edges {
		margin: 1rem 0 0;
		padding: 0.75rem 0 0 1.1rem;
		border-top: 1px solid var(--staff);
		font-size: 0.9375rem;
		display: grid;
		gap: 0.375rem;
	}

	.work {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-content: start;
		min-width: 0;
	}

	.work :global(pre) {
		margin: 0;
	}

	.work > :global(p) {
		margin: 0;
	}

	.label {
		margin: 0 0 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	.added {
		margin: 1rem 0 0;
		display: grid;
		gap: 0.5rem;
		font-size: 0.9375rem;
	}

	.added div {
		scroll-margin-top: 1.5rem;
	}

	.added dt {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.add-mark {
		min-width: 2.75rem;
		font: 400 0.9375rem / 1 var(--face-mono);
	}

	.added dd {
		margin: 0 0 0 3.25rem;
		font-style: italic;
		color: var(--quiet);
	}
</style>
