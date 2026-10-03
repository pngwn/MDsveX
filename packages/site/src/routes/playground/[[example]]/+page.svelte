<script lang="ts">
import { goto, replaceState } from "$app/navigation";
import { page } from "$app/state";
import { untrack } from "svelte";
import { Repl, decode_state, encode_state, type ReplState } from "@mdsvex/repl";
import { examples } from "$lib/playground/examples";
// mdsvex adds no css, the preview gets a theme the way a project imports one
import code_theme from "@twinkleplop/theme-ayu?inline";

let { data } = $props();

let repl: ReturnType<typeof Repl> | undefined = $state();
let edited = $state(false);
let copied = $state(false);
let save_timeout: ReturnType<typeof setTimeout> | undefined;

/** the hash we wrote last, so our own writes are not read back as navigation */
let written_hash = "";

async function load(hash: string) {
	if (!repl) return;
	clearTimeout(save_timeout);

	const from_hash = hash.length > 1 ? await decode_state(hash.slice(1)) : null;
	edited = from_hash !== null;
	written_hash = hash;
	await repl.set(from_hash ?? data.example.state);
}

$effect(() => {
	// only the example and instance rerun this, not workspace state that loading touches
	data.example;
	if (repl) untrack(() => load(location.hash));
});

function onchange() {
	edited = true;
	clearTimeout(save_timeout);
	save_timeout = setTimeout(save, 300);
}

async function save() {
	if (!repl) return;
	const state: ReplState = repl.get();
	const hash = "#" + (await encode_state(state));
	written_hash = hash;
	const url = new URL(location.href);
	url.hash = hash;
	replaceState(url, page.state);
}

function reset() {
	clearTimeout(save_timeout);
	const url = new URL(location.href);
	url.hash = "";
	replaceState(url, page.state);
	load("");
}

async function share() {
	clearTimeout(save_timeout);
	if (edited) await save();
	await navigator.clipboard.writeText(location.href);
	copied = true;
	setTimeout(() => (copied = false), 1500);
}

function onhashchange() {
	if (location.hash !== written_hash) load(location.hash);
}
</script>

<svelte:window {onhashchange} />

<svelte:head>
	<title>{data.example.title} · mdsvex playground</title>
</svelte:head>

<div class="playground">
	<header>
		<a class="home" href="/">mdsvex</a>
		<span class="divider">/</span>
		<span class="label">playground</span>

		<select
			aria-label="example"
			value={data.example.slug}
			onchange={(e) => goto(`/playground/${e.currentTarget.value}`)}
		>
			{#each examples as example (example.slug)}
				<option value={example.slug}>{example.title}</option>
			{/each}
		</select>

		<div class="actions">
			{#if edited}
				<button onclick={reset} title="discard edits and reload the example">reset</button>
			{/if}
			<button onclick={share} title="copy a link to this playground">
				{copied ? "copied" : "share"}
			</button>
		</div>
	</header>

	<main>
		<Repl bind:this={repl} theme="dark" injected_css={code_theme} {onchange} />
	</main>
</div>

<style>
	/* fixed so the page owns the viewport regardless of site global styles */
	.playground {
		--bg-primary: #0a0a0a;
		--bg-secondary: #111111;
		--bg-tertiary: #1a1a1a;
		--bg-hover: #222222;
		--text-primary: #ededed;
		--text-secondary: #999999;
		--accent: #00dc82;
		--border: #2a2a2a;
		--border-light: #333333;
		--radius-sm: 4px;
		--font-mono: "Berkeley Mono", "JetBrains Mono", "SF Mono", Monaco, Consolas,
			"Liberation Mono", "Courier New", monospace;

		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	header {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 48px;
		padding: 0 16px;
		border-bottom: 1px solid var(--border);
		font-family: var(--font-mono);
		font-size: 13px;
	}

	.home {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}

	.divider,
	.label {
		color: var(--text-secondary);
	}

	select {
		margin-left: 8px;
		padding: 4px 8px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm);
		font: inherit;
	}

	.actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}

	button {
		padding: 4px 12px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm);
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		border-color: var(--accent);
	}

	main {
		flex: 1;
		min-height: 0;
		position: relative;

		--repl-bg-1: var(--bg-primary);
		--repl-bg-2: var(--bg-secondary);
		--repl-bg-3: var(--bg-secondary);
		--repl-bg-4: var(--bg-hover);
		--repl-border: var(--border);
		--repl-fg-accent: var(--accent);
		--repl-font-family-mono: var(--font-mono);
	}
</style>
