<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { tick } from "svelte";

interface Props {
	all_kinds: string[];
	all_samples: [string, string][];
	sample_id: string;
	kind_id: string;
}

let { sample_id, all_kinds, kind_id, all_samples }: Props = $props();

let showLangMenu = $state(false);
let showTestMenu = $state(false);
let kind_btn_el = $state<{ [key: string]: HTMLButtonElement | null }>({});
let sample_btn_el = $state<{ [key: string]: HTMLButtonElement | null }>({});

function handle_kind_select(kind: string) {
	showLangMenu = false;
	// Navigate to the same test in the new language, or first test if it doesn't exist
	goto(`/explorer/${kind}/`);
}

function handleTestSelect(new_sample: string) {
	showTestMenu = false;
	goto(`/explorer/${kind_id}/${new_sample}`);
}

// Close menus when clicking outside
function handleClickOutside(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".breadcrumb-dropdown")) {
		showLangMenu = false;
		showTestMenu = false;
	}
}

async function handle_test_click(event: MouseEvent) {
	event.stopPropagation();
	showTestMenu = !showTestMenu;
	showLangMenu = false;

	await tick();

	if (showTestMenu && sample_btn_el[sample_id]) {
		sample_btn_el[sample_id]?.scrollIntoView({ block: "center" });
	}
}

async function handle_kind_click(event: MouseEvent) {
	event.stopPropagation();
	showLangMenu = !showLangMenu;
	showTestMenu = false;

	await tick();
	if (showLangMenu && kind_btn_el[kind_id]) {
		kind_btn_el[kind_id]?.scrollIntoView({ block: "center" });
	}
}

$effect(() => {
	document.addEventListener("click", handleClickOutside);
	return () => document.removeEventListener("click", handleClickOutside);
});
</script>

<div class="test-header">
	<div class="breadcrumbs">
		<a href="/" class="logo-link">
			<span class="logo-text">mdsvex</span>
			<span class="cursor">_</span>
		</a>
		<span class="breadcrumb-separator">/</span>

		<!-- Language selector -->
		<div class="breadcrumb-dropdown">
			<button
				class="breadcrumb-button"
				class:active={showLangMenu}
				onclick={handle_kind_click}
			>
				<span>{kind_id}</span>
				<svg
					class="chevron"
					class:rotated={showLangMenu}
					width="12"
					height="12"
					viewBox="0 0 12 12"
				>
					<path
						d="M3 4.5L6 7.5L9 4.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					/>
				</svg>
			</button>

			{#if showLangMenu}
				<div class="dropdown-menu">
					<div class="kinds-dropdown">
						{#each all_kinds as kind}
							<button
								class="dropdown-item"
								class:current={sample_id === kind}
								onclick={() => handle_kind_select(kind)}
								bind:this={kind_btn_el[kind]}
							>
								{kind}
								{#if kind === kind_id}
									<svg
										class="check-icon"
										width="14"
										height="14"
										viewBox="0 0 14 14"
									>
										<path
											d="M2 7L5.5 10.5L12 4"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											fill="none"
										/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<span class="breadcrumb-separator">/</span>

		<!-- Test selector -->
		<div class="breadcrumb-dropdown">
			<button
				class="breadcrumb-button"
				class:active={showTestMenu}
				onclick={handle_test_click}
			>
				<span>{sample_id}</span>
				<svg
					class="chevron"
					class:rotated={showTestMenu}
					width="12"
					height="12"
					viewBox="0 0 12 12"
				>
					<path
						d="M3 4.5L6 7.5L9 4.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					/>
				</svg>
			</button>

			{#if showTestMenu}
				<div class="dropdown-menu test-menu">
					<div class="dropdown-header">Test Files</div>
					<div class="test-grid">
						{#each all_samples as [file]}
							<button
								class="test-item"
								class:current={file === sample_id}
								onclick={() => handleTestSelect(file)}
								title={file}
								bind:this={sample_btn_el[file]}
							>
								{file}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="header-actions">
		<span class="file-count">{all_samples.length} test files</span>
	</div>
</div>

<style>
	.test-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 0 0.5rem 0;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.logo-link {
		display: flex;
		align-items: center;
		color: var(--text-primary);
		transition: all 0.2s ease;
		/* padding: 0.25rem 0.75rem; */
		/* border-radius: 6px; */
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.logo-link:hover {
		/* background: var(--bg-tertiary); */
		transform: translateX(2px);
	}

	.logo-text {
		background: linear-gradient(135deg, var(--accent) 0%, #00ff94 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		font-family: var(--font-mono);
	}

	.cursor {
		animation: blink 1.2s infinite;
		color: var(--accent);
		font-weight: 300;
		margin-left: 2px;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	.breadcrumb-separator {
		color: var(--text-tertiary);
		opacity: 0.5;
	}

	.breadcrumb-dropdown {
		position: relative;
	}

	.breadcrumb-button {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		background: transparent;
		color: var(--text-primary);
		border: 1px solid transparent;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.breadcrumb-button:hover {
		background: var(--bg-tertiary);
		border-color: var(--border);
	}

	.breadcrumb-button.active {
		background: var(--bg-tertiary);
		border-color: var(--accent);
		color: var(--accent);
	}

	.chevron {
		transition: transform 0.2s ease;
		opacity: 0.6;
	}

	.chevron.rotated {
		transform: rotate(180deg);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		min-width: 180px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		padding: 0.2rem;
		animation: fadeIn 0.15s ease;
	}

	.dropdown-menu.test-menu {
		min-width: 320px;
		max-width: 480px;
	}

	.dropdown-header {
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: var(--font-mono);
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		color: var(--text-primary);
		border: none;
		border-radius: 2px;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.dropdown-item:hover {
		background: var(--bg-tertiary);
		color: var(--accent);
	}

	.dropdown-item.current {
		background: var(--accent-dim);
		color: var(--accent);
		font-weight: 500;
	}

	.check-icon {
		color: var(--accent);
	}

	.test-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.25rem;
		padding: 0.25rem;
		max-height: 400px;
		overflow-y: auto;
	}

	.kinds-dropdown {
		max-height: 400px;
		overflow-y: auto;
	}

	.test-item {
		padding: 0.3rem 0.5rem;
		background: transparent;
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 2px;
		font-size: 0.8125rem;
		font-family: var(--font-mono);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.test-item:hover {
		background: var(--bg-tertiary);
		border-color: var(--accent);
		color: var(--accent);
		transform: translateY(-1px);
	}

	.test-item.current {
		background: var(--accent);
		color: var(--bg-primary);
		border-color: var(--accent);
		font-weight: 500;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.file-count {
		color: var(--text-tertiary);
		font-size: 0.8125rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Custom scrollbar for test grid */
	.test-grid::-webkit-scrollbar {
		width: 6px;
	}

	.test-grid::-webkit-scrollbar-track {
		background: var(--bg-tertiary);
		border-radius: 2px;
	}

	.test-grid::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 2px;
	}

	.test-grid::-webkit-scrollbar-thumb:hover {
		background: var(--text-tertiary);
	}
</style>
