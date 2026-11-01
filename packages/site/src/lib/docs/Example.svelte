<script>
// an example in the docs, made at build time from a fence (build/examples.js):
//
//   ```svx score    the parser's score of the example, its source a click away
//   ```svx result   you write beside you get; the score a click away
//
// The children are the fence as written, and `result` is the html the example
// renders to, highlighted at build time. The score is Score.svelte over the
// same source, so it is the real parser's reading
import Score from "$lib/design/score/Score.svelte";

let { source, score, result, children } = $props();

let showing = $state(score === "open" ? "score" : "source");
</script>

{#snippet pick()}
	<span class="pick" role="group" aria-label="Show the example as">
		<button type="button" aria-pressed={showing === "source"} onclick={() => (showing = "source")}>source</button>
		<button type="button" aria-pressed={showing === "score"} onclick={() => (showing = "score")}>score</button>
	</span>
{/snippet}

<figure class="example wide" class:pair={!!result} class:scored={showing === "score"}>
	<div class="head write riso">
		{#if result}<span class="label">You write</span>{/if}
		{@render pick()}
	</div>
	{#if result}
		<div class="head get riso"><span class="label">You get</span></div>
	{/if}

	{#if showing === "score"}
		<div class="score">
			<Score source={source.endsWith("\n") ? source : `${source}\n`} label="The parser’s reading of the example" />
		</div>
	{/if}

	{@render children?.()}

	{#if result}
		<div class="html">{@html result}</div>
	{/if}
</figure>

<style>
	.example {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		margin: 1.75rem 0 2rem;
	}

	.pair {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		column-gap: 2rem;
	}

	.head {
		grid-row: 1;
		display: flex;
		align-items: baseline;
		gap: 1rem;
		padding-bottom: 0.4rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--quiet);
	}

	.write {
		grid-column: 1;
	}

	.get {
		grid-column: 2;
	}

	.label {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.pick {
		display: flex;
		gap: 0.75rem;
		margin-left: auto;
	}

	/* the score is a reading of the source above it, the pick sits with what it changes */
	.example:not(.pair) .pick {
		margin-left: 0;
	}

	button {
		padding: 0;
		border: 0;
		font: inherit;
		color: var(--quiet);
		background: none;
		cursor: pointer;
	}

	button:hover {
		color: var(--ink);
	}

	button[aria-pressed="true"] {
		color: var(--ink);
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	/* the fence as written, and the html from the build beside it */
	.example > :global(pre) {
		grid-column: 1;
		grid-row: 2;
		margin: 0;
	}

	.html {
		grid-column: 2;
		grid-row: 2;
		min-width: 0;
	}

	.html :global(pre) {
		margin: 0;
	}

	.scored > :global(pre) {
		display: none;
	}

	.score {
		grid-column: 1;
		grid-row: 2;
		padding-top: 0.75rem;
	}

	/* a phone: you get goes under you write */
	@media (max-width: 860px) {
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}

		.get,
		.html {
			grid-column: 1;
		}

		.get {
			grid-row: 3;
			padding-top: 1.25rem;
		}

		.html {
			grid-row: 4;
		}
	}
</style>
