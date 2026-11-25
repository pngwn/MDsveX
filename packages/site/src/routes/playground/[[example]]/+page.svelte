<script lang="ts">
import { afterNavigate, goto, replaceState } from "$app/navigation";
import { page } from "$app/state";
import { untrack } from "svelte";
import { Repl, decode_state, encode_state, type ReplState } from "@mdsvex/repl";
import { pages } from "../../docs/nav.js";
import { examples } from "$lib/playground/examples";
import Nav from "$lib/Nav.svelte";
import { google_fonts } from "$lib/design/fonts";
import { use_theme } from "$lib/design/theme.svelte";
// outside the frame, so the frame styles are imported here
import "$lib/design/tokens.css";
import "$lib/design/base.css";
import "$lib/design/type.css";
// mdsvex adds no css, the preview gets a theme the way a project imports one
import code_theme from "@twinkleplop/theme-ayu?inline";
import tokens from "$lib/design/tokens.css?inline";

// the preview keeps its own type on the site paper and ink
const preview_css = `${code_theme}
${tokens}
body, body.dark {
	--bg-1: var(--paper);
	--bg-2: var(--well);
	--bg-3: var(--staff);
	--fg-1: var(--ink);
	--fg-2: var(--ink);
	--fg-3: var(--quiet);
	--link: var(--ink);
	--link-hover: var(--ink);
	--link-active: var(--ink);
	--border-radius: 0;
	--font-mono: 'Berkeley Mono', 'IBM Plex Mono', ui-monospace, monospace;
}`;

let { data } = $props();

// the site theme with auto resolved, for the preview iframe
const theme = use_theme();
let prefers_dark = $state(false);
$effect(() => {
	const query = matchMedia("(prefers-color-scheme: dark)");
	prefers_dark = query.matches;
	const follow = () => (prefers_dark = query.matches);
	query.addEventListener("change", follow);
	return () => query.removeEventListener("change", follow);
});
const choice = $derived(theme?.value ?? "auto");
const dark = $derived(choice === "dark" || (choice === "auto" && prefers_dark));

let repl: ReturnType<typeof Repl> | undefined = $state();
let guide = $state<{ href: string; title: string }>();
afterNavigate(({ from }) => {
	const url = from?.url ?? (document.referrer ? new URL(document.referrer) : null);
	if (url?.origin !== location.origin) return;
	const previous = pages.find((item) => item.href === url.pathname);
	if (previous) guide = { href: previous.href + url.search + url.hash, title: previous.title };
});
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
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href={google_fonts} />
</svelte:head>

<div class="playground" data-theme={choice}>
	<header>
		<Nav>
			<select
				aria-label="Example"
				value={data.example.slug}
				onchange={(e) => goto(`/playground/${e.currentTarget.value}`)}
			>
				{#each examples as example (example.slug)}
					<option value={example.slug}>{example.title}</option>
				{/each}
			</select>

			{#if guide}<a class="guide" href={guide.href}>Back to {guide.title}</a>{/if}

			<span class="actions">
				{#if edited}
					<button onclick={reset} title="discard edits and reload the example">reset</button>
				{/if}
				<button class="share" onclick={share} title="copy a link to this playground">
					{copied ? "copied" : "share"}
				</button>
			</span>
		</Nav>
	</header>

	<main>
		<Repl
			bind:this={repl}
			theme={dark ? "dark" : "light"}
			injected_css={preview_css}
			streamable={data.example.streamable}
			{onchange}
		/>
	</main>
</div>

<style>
	/* fixed so the page owns the viewport like an editor */
	.playground {
		color-scheme: light dark;
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		color: var(--ink);
		background: var(--paper);
		font: 400 0.8125rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
	}

	.playground[data-theme="light"] {
		color-scheme: light;
	}

	.playground[data-theme="dark"] {
		color-scheme: dark;
	}

	header {
		flex: none;
		padding: 0.875rem clamp(1rem, 2vw, 1.5rem);
		border-bottom: 1px solid var(--staff);
	}

	select,
	button {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--quiet-line);
		border-radius: 0;
		color: var(--ink);
		background: var(--paper);
		font: inherit;
		font-variant-ligatures: none;
		cursor: pointer;
	}

	select {
		min-width: 0;
		max-width: 100%;
	}

	select:hover,
	button:hover {
		border-color: var(--ink);
	}

	.guide {
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.3em;
	}

	.guide:hover {
		text-decoration-color: var(--ink);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	/* wide enough for copied so the button does not jump */
	.share {
		min-width: 7ch;
	}

	main {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	/* theme.css sets the tokens on the repl root, so inherited values lose */
	main :global(.mdsvex-repl) {
		color-scheme: inherit;

		--repl-bg-1: var(--paper);
		--repl-bg-2: var(--paper);
		--repl-bg-3: var(--paper);
		--repl-bg-4: var(--well-chrome);
		--repl-bg-highlight: color-mix(in oklab, var(--line-strong) 28%, transparent);
		--repl-bg-selection: color-mix(in oklab, var(--line-list) 24%, transparent);
		--repl-bg-unfocused-selection: color-mix(in oklab, var(--ink) 9%, transparent);
		--repl-fg-1: var(--ink);
		--repl-fg-2: var(--ink);
		--repl-fg-3: var(--quiet);
		--repl-fg-4: var(--quiet-line);
		--repl-fg-accent: var(--ink);
		--repl-border: var(--staff);
		--repl-border-radius: 0;
		--repl-shadow: none;

		--repl-font-family-ui: var(--face-mono);
		--repl-font-family-mono: var(--face-mono);
		--repl-font-ui-small: 400 0.75rem / 1.5 var(--face-mono);
		--repl-font-ui-medium: 400 0.8125rem / 1.5 var(--face-mono);
		--repl-font-mono: 400 0.875rem / 1.6 var(--face-mono);

		--repl-raised-color: var(--quiet-line);
		--repl-raised-hover-color: var(--ink);
		--repl-raised-active-color: var(--ink);
		--repl-raised-width: 1px;
		--repl-raised-active-width: 1px;

		/* the score colours from code.css */
		--repl-code-text: var(--ink);
		--repl-code-keyword: var(--name-logic);
		--repl-code-function: var(--name-link);
		--repl-code-string: var(--name-code);
		--repl-code-comment: var(--quiet);
		--repl-code-atom: var(--name-strong);
		--repl-code-heading: var(--name-heading);
		--repl-code-mark: var(--quiet);
		--repl-code-link: var(--name-link);
	}

	/* the repl font shorthands reset ligatures on every element */
	main :global(*) {
		font-variant-ligatures: none;
	}

	/* pane controls clip, so focus is drawn inside */
	main :global(:focus-visible) {
		outline-offset: -2px;
	}
</style>
