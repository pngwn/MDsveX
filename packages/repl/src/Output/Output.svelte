<script lang="ts">
	import { locate } from 'locate-character';
	import { decode, type SourceMapSegment } from '@jridgewell/sourcemap-codec';
	import AstView from './AstView.svelte';
	import CompilerOptions from './CompilerOptions.svelte';
	import PaneWithPanel from './PaneWithPanel.svelte';
	import Viewer from './Viewer.svelte';
	import { Workspace, type File } from '../workspace.svelte';
	import Editor from '../Editor/Editor.svelte';
	import Checkbox from '../Input/Checkbox.svelte';
	import { untrack } from 'svelte';
	import type { PfmNode } from '../workers/pfm_ast';

	interface Props {
		status: string | null;
		runtime_error?: Error | null;
		embedded?: boolean | 'output-only';
		relaxed?: boolean;
		can_escape?: boolean;
		injected_js: string;
		injected_css: string;
		preview_theme: 'light' | 'dark';
		workspace: Workspace;
	}

	let {
		status,
		runtime_error = $bindable(null),
		embedded = false,
		relaxed = false,
		can_escape = false,
		injected_js,
		injected_css,
		preview_theme,
		workspace,
	}: Props = $props();

	type View = 'result' | 'pfm' | 'svelte' | 'js' | 'css' | 'ast';

	let view: View = $state('result');

	function output_file(name: string): File {
		return { type: 'file', name, basename: name, contents: '', text: true };
	}

	const svelte = output_file('output.svelte');
	const js = output_file('output.js');
	const css = output_file('output.css');

	const svelte_workspace = new Workspace([svelte], { readonly: true });
	const js_workspace = new Workspace([js], { readonly: true });
	const css_workspace = new Workspace([css], { readonly: true });

	let current = $derived(workspace.current_compiled);

	let hide_line_breaks = $state(true);

	/** block separators are a node each, which buries the structure people look for */
	function without_line_breaks(node: PfmNode): PfmNode {
		if (!node.children) return node;
		return {
			...node,
			children: node.children
				.filter((child) => child.type !== 'line_break')
				.map(without_line_breaks),
		};
	}

	let pfm = $derived(
		current?.pfm && hide_line_breaks ? without_line_breaks(current.pfm) : current?.pfm
	);
	let is_markdown = $derived(current?.markdown != null || current?.pfm != null);

	let views = $derived<[View, string][]>(
		is_markdown
			? [
					['result', 'Result'],
					['pfm', 'PFM AST'],
					['svelte', 'Svelte output'],
					['js', 'JS output'],
					['css', 'CSS output'],
				]
			: [
					['result', 'Result'],
					['js', 'JS output'],
					['css', 'CSS output'],
					['ast', 'AST output'],
				]
	);

	$effect(() => {
		if (!views.some(([v]) => v === view)) view = 'result';
	});

	$effect(() => {
		svelte.contents = current?.markdown?.code ?? '<!-- select a markdown file to see what mdsvex produced -->';

		if (current?.error) {
			js.contents = css.contents = `/* ${current.error.message} */`;
		} else if (current?.result) {
			js.contents = current.result.js.code;
			css.contents =
				current.result.css?.code ?? `/* Add a <st` + `yle> tag to see the CSS output */`;
		} else {
			js.contents = css.contents = `/* Select a component to see its compiled code */`;
		}

		untrack(() => {
			svelte_workspace.update_file(svelte);
			js_workspace.update_file(js);
			css_workspace.update_file(css);
		});
	});

	/** the code and map for a tab, every map points back at the current file */
	function output_of(v: View) {
		if (v === 'svelte') return current?.markdown ?? null;
		if (v === 'js' || v === 'css') return current?.result?.[v] ?? null;
		return null;
	}

	$effect(() => {
		if (view !== 'svelte' && view !== 'js' && view !== 'css') return;

		const v = view;
		const output = v === 'svelte' ? svelte_workspace : v === 'js' ? js_workspace : css_workspace;

		const highlight = (
			line: number,
			a: SourceMapSegment,
			b: SourceMapSegment,
			scroll_input: boolean,
			scroll_output: boolean
		) => {
			const split = {
				original: workspace.current!.contents.split('\n'),
				generated: output_of(v)!.code.split('\n'),
			};

			const original = {
				start: split.original.slice(0, a[2]).join('\n').length + 1 + a[3]!,
				end: split.original.slice(0, b[2]).join('\n').length + 1 + b[3]!,
			};

			const generated = {
				start: split.generated.slice(0, line).join('\n').length + 1 + a[0],
				end: split.generated.slice(0, line).join('\n').length + 1 + b[0],
			};

			workspace.highlight_range(original, scroll_input);
			output.highlight_range(generated, scroll_output);
		};

		const clear = () => {
			workspace.highlight_range(null);
			output.highlight_range(null);
		};

		const from_input = (pos: number, should_scroll: boolean) => {
			const out = output_of(v);
			if (!out?.map) return;

			const mappings = decode(out.map.mappings);

			const { line, column } = locate(workspace.current.contents, pos)!;

			for (let i = 0; i < mappings.length; i += 1) {
				const segments = mappings[i];
				for (let j = 0; j < segments.length - 1; j += 1) {
					// segments hold generated_column, source_index, original_line, original_column
					const a = segments[j];
					const b = segments[j + 1];

					if (a[2]! > line) continue;
					if (b[2]! < line) continue;

					if (a[2]! === line && a[3]! > column) continue;
					if (b[2]! === line && b[3]! < column) continue;

					highlight(i, a, b, false, should_scroll);
					return;
				}

				clear();
			}
		};

		const from_output = (pos: number, should_scroll: boolean) => {
			const out = output_of(v);
			if (!out?.map) return;

			const mappings = decode(out.map.mappings);

			const { line, column } = locate(out.code, pos)!;

			const segments = mappings[line] ?? [];

			for (let i = 0; i < segments.length - 1; i += 1) {
				const a = segments[i];
				const b = segments[i + 1];

				if (a[0] <= column && b[0] >= column) {
					highlight(line, a, b, should_scroll, false);
					return;
				}

				clear();
			}
		};

		workspace.onhover((pos) => (pos === null ? clear() : from_input(pos, false)));
		workspace.onselect((from, to) => from === to && from_input(from, true));

		output.onhover((pos) => (pos === null ? clear() : from_output(pos, false)));
		output.onselect((from, to) => from === to && from_output(from, true));
	});
</script>

{#if embedded !== 'output-only'}
	<div class="view-toggle">
		{#each views as [v, label] (v)}
			<button aria-current={view === v} onclick={() => (view = v)}>{label}</button>
		{/each}
	</div>
{/if}

<div class="tab-content" class:visible={view === 'result'}>
	<Viewer
		bind:error={runtime_error}
		{status}
		{relaxed}
		{can_escape}
		{injected_js}
		{injected_css}
		onlog={embedded === 'output-only' ? () => {} : undefined}
		theme={preview_theme}
	/>
</div>

<div class="tab-content" class:visible={view === 'svelte'}>
	<Editor workspace={svelte_workspace} />
</div>

<div class="tab-content" class:visible={view === 'js'}>
	{#if embedded}
		<Editor workspace={js_workspace} />
	{:else}
		<PaneWithPanel min="-200px" pos="70%" panel="Compiler options">
			{#snippet main()}
				<Editor workspace={js_workspace} />
			{/snippet}

			{#snippet body()}
				<CompilerOptions {workspace} />
			{/snippet}
		</PaneWithPanel>
	{/if}
</div>

<div class="tab-content" class:visible={view === 'css'}>
	<Editor workspace={css_workspace} />
</div>

{#if pfm}
	<div class="tab-content" class:visible={view === 'pfm'}>
		<AstView
			{workspace}
			ast={pfm}
			active={view === 'pfm'}
			note="The tree @mdsvex/parse builds. Hover a node to find it in the source."
		>
			{#snippet controls()}
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="option">
					hide line breaks
					<Checkbox bind:checked={hide_line_breaks} />
				</label>
			{/snippet}
		</AstView>
	</div>
{/if}

{#if current?.result && !is_markdown}
	<div class="tab-content" class:visible={view === 'ast'}>
		<AstView {workspace} ast={current.result.ast} active={view === 'ast'} />
	</div>
{/if}

<style>
	.view-toggle {
		height: var(--repl-pane-controls-height);
		overflow: hidden;
		white-space: nowrap;
		box-sizing: border-box;
		font: var(--repl-font-ui-small);

		/* a pseudo border lets the active tab border sit above it */
		&::before {
			content: '';
			position: absolute;
			width: 100%;
			height: 1px;
			bottom: 0px;
			left: 0;
			background-color: var(--repl-border);
		}
	}

	button {
		height: 100%;
		background: transparent;
		text-align: left;
		position: relative;
		font: var(--repl-font-ui-small);
		border: none;
		border-bottom: 1px solid transparent;
		padding: 0 10px;
		border-radius: 0;

		&[aria-current='true'] {
			border-bottom: 1px solid var(--repl-fg-accent);
		}
	}

	.tab-content {
		position: absolute;
		width: 100%;
		height: calc(100% - var(--repl-pane-controls-height)) !important;
		visibility: hidden;
		pointer-events: none;
	}

	.option {
		display: inline-flex;
		gap: 10px;
		align-items: center;
	}

	.tab-content.visible {
		visibility: visible;
		pointer-events: all;
	}
</style>
