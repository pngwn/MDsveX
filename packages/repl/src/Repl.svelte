<script lang="ts">
	import { SplitPane } from '@rich_harris/svelte-split-pane';
	import { BROWSER } from 'esm-env';
	import { onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import Bundler from './bundler.svelte.js';
	import ComponentSelector from './Input/ComponentSelector.svelte';
	import ScreenToggle from './Input/ScreenToggle.svelte';
	import Output from './Output/Output.svelte';
	import { set_repl_context } from './context.js';
	import { Workspace, type File } from './workspace.svelte.js';
	import Editor from './Editor/Editor.svelte';
	import type { ReplContext, ReplState } from './types.js';
	import './theme.css';

	interface Props {
		svelte_version?: string;
		embedded?: boolean | 'output-only';
		orientation?: 'columns' | 'rows';
		/** sandbox allow-same-origin */
		relaxed?: boolean;
		/** sandbox allow-popups-to-escape-sandbox */
		can_escape?: boolean;
		fixed?: boolean;
		fixed_pos?: number;
		injected_js?: string;
		injected_css?: string;
		theme?: 'light' | 'dark';
		/** defaults to theme */
		preview_theme?: 'light' | 'dark';
		show_output?: boolean;
		onversion?: (version: string) => void;
		onchange?: () => void;
		/** bundler and runtime errors */
		onerror?: (error: Error) => void;
	}

	let {
		svelte_version = 'latest',
		embedded = false,
		orientation = 'columns',
		relaxed = false,
		can_escape = false,
		fixed = false,
		fixed_pos = 50,
		injected_js = '',
		injected_css = '',
		theme = 'light',
		preview_theme = theme,
		show_output = $bindable(true),
		onversion,
		onchange,
		onerror,
	}: Props = $props();

	const ENTRY_CANDIDATES = ['App.svx', 'App.md', 'App.svelte'];

	function to_file(name: string, contents: string): File {
		return { type: 'file', name, basename: name.split('/').pop()!, contents, text: true };
	}

	let entry = $state<string | undefined>();
	let setting = false;

	const workspace: Workspace = new Workspace([to_file('App.svx', '')], {
		initial: 'App.svx',
		// svelte-ignore state_referenced_locally
		svelte_version,
		onupdate() {
			rebundle();
			onchange?.();
		},
		onreset() {
			// adding, renaming or removing a file is an edit, replacing everything is not
			if (!setting) onchange?.();
			return rebundle();
		},
	});

	function current_entry() {
		if (entry && workspace.file_nodes.some((f) => f.name === entry)) return entry;
		const names = workspace.file_nodes.map((f) => f.name);
		return ENTRY_CANDIDATES.find((n) => names.includes(n)) ?? names[0];
	}

	/** replaces every file, resolving once the first bundle lands */
	export async function set(state: ReplState) {
		entry = state.entry;
		if (state.svelte_version) workspace.set_svelte_version(state.svelte_version);
		setting = true;
		try {
			await workspace.reset(
				state.files.map((f) => to_file(f.name, f.contents)),
				state.selected ?? current_entry_of(state)
			);
		} finally {
			setting = false;
		}
	}

	function current_entry_of(state: ReplState) {
		const names = state.files.map((f) => f.name);
		return state.entry ?? ENTRY_CANDIDATES.find((n) => names.includes(n)) ?? names[0];
	}

	export function get(): ReplState {
		return {
			files: workspace.file_nodes.map((f) => ({ name: f.name, contents: f.contents })),
			entry,
			selected: workspace.current.name,
			svelte_version: workspace.svelte_version,
		};
	}

	export function mark_saved() {
		workspace.mark_saved();
	}

	const toggleable: ReplContext['toggleable'] = writable(false);

	function rebundle() {
		return bundler?.bundle(workspace.file_nodes, {
			svelte_version: workspace.svelte_version,
			entry: current_entry(),
			fragments: workspace.compiler_options.fragments,
			async: workspace.compiler_options.async,
		});
	}

	let width = $state(0);
	let toggled = $state(false);
	let status: string | null = $state(null);
	let runtime_error: Error | null = $state(null);
	let status_visible = $state(false);
	let status_timeout: ReturnType<typeof setTimeout> | undefined = undefined;

	const bundler = BROWSER
		? new Bundler({
				// svelte-ignore state_referenced_locally
				svelte_version,
				onversion: (version, supports_async) => {
					workspace.set_svelte_version(version);
					workspace.supports_async = supports_async;
					if (!supports_async && workspace.compiler_options.async) {
						workspace.update_compiler_options({ async: false });
					}
					onversion?.(version);
				},
				onstatus: (message) => {
					if (message) {
						// a short delay keeps the banner from flickering on fast bundles
						if (!status_visible && !status_timeout) {
							status_timeout = setTimeout(() => {
								status_visible = true;
							}, 400);
						}
					} else {
						clearTimeout(status_timeout);
						status_visible = false;
						status_timeout = undefined;
					}
					status = message;
				},
				onerror: (message) => {
					runtime_error = new Error(message);
				},
			})
		: null;

	onDestroy(() => bundler?.destroy());

	set_repl_context({
		bundler,
		toggleable,
		workspace,
		get svelte_version() {
			return svelte_version;
		},
	});

	let mobile = $derived(width < 540);

	$effect(() => {
		$toggleable = mobile && orientation === 'columns' && embedded !== 'output-only';
	});

	$effect(() => {
		if (runtime_error) onerror?.(runtime_error);
	});

	$effect(() => {
		if (bundler?.result?.error) onerror?.(bundler.result.error as Error);
	});
</script>

<div
	class="mdsvex-repl repl-root {embedded === 'output-only' ? '' : 'container-normal'}"
	class:dark={theme === 'dark'}
	class:embedded
	class:toggleable={$toggleable}
	bind:clientWidth={width}
>
	<div class="viewport" class:output={show_output} class:transition={toggled}>
		<SplitPane
			id="main"
			type={orientation}
			pos="{embedded === 'output-only'
				? 0
				: mobile || fixed
					? fixed_pos
					: orientation === 'rows'
						? 60
						: 50}%"
			min={embedded === 'output-only' ? '0px' : '100px'}
			max="-41px"
		>
			{#snippet a()}
				<section>
					<ComponentSelector {workspace} entry={current_entry()} />

					<Editor {workspace} />
				</section>
			{/snippet}

			{#snippet b()}
				<section>
					<Output
						status={status_visible ? status : null}
						{embedded}
						{relaxed}
						{can_escape}
						{injected_js}
						{injected_css}
						{preview_theme}
						{workspace}
						bind:runtime_error
					/>
				</section>
			{/snippet}
		</SplitPane>
	</div>

	{#if $toggleable}
		<ScreenToggle
			bind:checked={
				() => show_output,
				(v) => {
					toggled ||= true;
					show_output = v;
				}
			}
		/>
	{/if}
</div>

<style>
	.repl-root {
		position: relative;
		flex: 1;
		height: 100%;
		min-height: 0;
		background: var(--repl-bg-1);
		color: var(--repl-fg-1);
		padding: 0;

		&.embedded {
			height: 100%;
		}

		section {
			position: relative;
			padding: var(--repl-pane-controls-height) 0 0 0;
			height: 100%;
			box-sizing: border-box;

			:global {
				& > :first-child {
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					height: var(--repl-pane-controls-height);
					box-sizing: border-box;
				}

				& > :last-child {
					width: 100%;
					height: 100%;
				}
			}
		}

		:global [data-pane='main'] > svelte-split-pane-divider::after {
			height: calc(100% - var(--repl-pane-controls-height));
			top: var(--repl-pane-controls-height);
		}
	}

	.viewport {
		height: 100%;
	}

	.toggleable .viewport {
		width: 200%;
		height: calc(100% - var(--repl-pane-controls-height));
	}

	.toggleable .viewport.output {
		transform: translate(-50%);
	}

	.toggleable .viewport.transition {
		transition: transform 0.3s;
	}

	/* on mobile the split pane is fixed */
	@media (max-width: 799px) {
		.container-normal :global {
			[data-pane='main'] {
				--pos: 50% !important;
			}

			[data-pane='editor'] {
				--pos: 54px !important;
			}

			[data-pane] svelte-split-pane-divider {
				cursor: default;
			}
		}
	}
</style>
