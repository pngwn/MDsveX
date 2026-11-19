<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { setDiagnostics } from '@codemirror/lint';
	import { EditorView } from '@codemirror/view';
	import { Workspace, type File } from '../workspace.svelte';
	import './codemirror.css';

	interface Props {
		workspace: Workspace;
		autocomplete_filter?: (file: File) => boolean;
	}

	let { workspace, autocomplete_filter = () => true }: Props = $props();

	let container: HTMLDivElement;

	let preserve_editor_focus = $state(false);

	let remove_focus_timeout = $state<any>();

	let editor_view: EditorView;

	$effect(() => {
		editor_view = new EditorView({
			parent: container
		});

		workspace.link(editor_view);

		return () => {
			workspace.unlink(editor_view);
			editor_view.destroy();
		};
	});

	$effect(() => {
		const transaction = setDiagnostics(editor_view.state, workspace.diagnostics);
		editor_view.dispatch(transaction);
	});
</script>

<svelte:window
	onpointerdown={(e) => {
		if (!container.contains(e.target as HTMLElement)) {
			preserve_editor_focus = false;
		}
	}}
	onmessage={(e) => {
		if (preserve_editor_focus && e.data.type === 'iframe_took_focus') {
			editor_view.focus();
		}
	}}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="editor"
	bind:this={container}
	onpointerdown={() => {
		workspace.enable_tab_indent();
	}}
	onkeydown={(e) => {
		if (e.key !== 'Tab') {
			workspace.enable_tab_indent();
		}
	}}
	onfocusin={(e) => {
		clearTimeout(remove_focus_timeout);
		preserve_editor_focus = true;
	}}
	onfocusout={() => {
		workspace.disable_tab_indent();

		// no focus report from the iframe soon after means the user moved focus
		remove_focus_timeout = setTimeout(() => {
			preserve_editor_focus = false;
		}, 200);
	}}
>
	{#if !BROWSER && workspace.current}
		<div class="fake">
			<div class="fake-gutter">
				{#each workspace.current.contents.split('\n') as _, i}
					<div class="fake-line">{i + 1}</div>
				{/each}
			</div>
			<div class="fake-content">
				{#each workspace.current.contents.split('\n') as line}
					<pre>{line || ' '}</pre>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.editor {
		width: 100%;
		height: 100%;
	}

	.fake {
		display: grid;
		grid-template-columns: 40px 1fr;
		grid-gap: 10px;
		padding: 4px 0;
	}

	.fake * {
		color: var(--repl-fg-4);
		font: var(--repl-font-mono);
	}

	.fake-gutter {
		text-align: right;
		padding-right: 7px;
	}

	.fake-content {
		padding: 0 10px;
	}
</style>
