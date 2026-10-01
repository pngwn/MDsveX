<script lang="ts">
	import type { Workspace, File } from '../workspace.svelte';
	import { tick } from 'svelte';
	import Checkbox from './Checkbox.svelte';

	interface Props {
		workspace: Workspace;
		/** the mounted file, it cannot be renamed or removed */
		entry: string;
	}

	let { workspace, entry }: Props = $props();

	let input = $state() as HTMLInputElement;

	// svelte-ignore state_referenced_locally
	let input_value = $state(workspace.current.name);

	async function close_edit(file: File) {
		if (input_value === file.name || input_value === '') {
			input_value = file.name;
			return;
		}

		const deconflicted = deconflict(input_value, file);

		workspace.rename(file, deconflicted);
		workspace.focus();
	}

	function deconflict(name: string, file?: File) {
		let deconflicted = name;
		let i = 1;

		while (true) {
			const existing = workspace.files.find((file) => file.name === deconflicted);
			if (!existing || existing === file) return deconflicted;

			deconflicted = name.replace(/(\.|$)/, `${i++}$1`);
		}
	}

	function remove_file(file: File) {
		let result = confirm(`Are you sure you want to delete ${file.name}?`);
		if (!result) return;

		workspace.remove(file);
	}

	async function add_new() {
		const basename = deconflict(`Component.svx`);

		const file = workspace.add({
			type: 'file',
			name: basename,
			basename,
			contents: '',
			text: true
		});

		input_value = file.name;

		await tick();
		input.focus();
	}

	let dragging: File | null = null;
	let dragover: File | null = $state.raw(null);
</script>

<div class="component-selector">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="file-tabs">
		{#each workspace.file_nodes as file, index (file.name)}
			<div
				class="button"
				class:editable={file.name !== entry}
				role="button"
				tabindex="0"
				aria-current={file === workspace.current}
				class:drag-over={file === dragover}
				onclick={() => {
					workspace.select(file.name);
					input_value = file.name;
				}}
				onkeyup={(e) => e.key === ' ' && workspace.select(file.name)}
				draggable="true"
				ondragstart={() => (dragging = file)}
				ondragover={(e) => (e.preventDefault(), (dragover = file))}
				ondragleave={(e) => (e.preventDefault(), (dragover = null))}
				ondrop={() => {
					if (dragging && dragover) {
						workspace.move(dragging, dragover);
					}

					dragging = dragover = null;
				}}
			>
				<i class="drag-handle"></i>

				<span class="filename">
					{(file === workspace.current && file.name !== entry ? input_value : file.name) +
						(workspace.modified[file.name] ? '*' : '') || ' '}
				</span>

				{#if file === workspace.current && file.name !== entry}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						spellcheck={false}
						bind:this={input}
						bind:value={input_value}
						onfocus={async (event) => {
							const input = event.currentTarget;
							setTimeout(() => {
								input.select();
							});
						}}
						onblur={() => close_edit(file)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								e.currentTarget.blur();
							}

							if (e.key === 'Escape') {
								input_value = file.name;
								e.currentTarget.blur();
							}
						}}
					/>

					<span
						class="remove"
						onclick={(e) => {
							remove_file(file);
							e.stopPropagation();
						}}
						onkeyup={(e) => e.key === ' ' && remove_file(file)}
					>
						<svg viewBox="0 0 24 24">
							<line stroke="#999" x1="18" y1="6" x2="6" y2="18" />
							<line stroke="#999" x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</span>
				{/if}
			</div>
		{/each}
	</div>

	<button
		class="raised add-new"
		onclick={add_new}
		aria-label="add a file"
		title="add a file"><span class="icon"></span></button
	>

	<details class="settings">
		<summary aria-label="settings" title="settings"><span class="icon"></span></summary>

		<div class="menu">
			<label class="option">
				<span>Vim mode</span>
				<Checkbox bind:checked={workspace.vim}></Checkbox>
			</label>

			<label class="option" aria-disabled={!workspace.supports_async}>
				<span>Async mode</span>
				<Checkbox
					disabled={!workspace.supports_async}
					checked={workspace.compiler_options.async}
					onchange={() =>
						workspace.update_compiler_options({ async: !workspace.compiler_options.async })}
				></Checkbox>
			</label>

			<label class="option">
				<span>Svelte version</span>
				<input
					value={workspace.svelte_version}
					placeholder="latest"
					onchange={(ev) => workspace.set_svelte_version(ev.currentTarget.value || 'latest', true)}
				/>
			</label>
		</div>
	</details>
</div>

<style>
	.component-selector {
		--icon-file: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6'/%3E%3C/svg%3E");
		--icon-file-new: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 2v6h6M12 18v-6M9 15h6'/%3E%3C/svg%3E");
		--icon-settings: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/%3E%3C/svg%3E");
		position: relative;
		display: flex;
		gap: 5px;
		align-items: center;
		padding: 0 10px 0 0;

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

	.file-tabs {
		border: none;
		margin: 0;
		height: 100%;
		white-space: nowrap;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.file-tabs .button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font: var(--repl-font-ui-small);
		border: none;
		padding: 0 10px;
		height: 100%;
		cursor: pointer;
	}

	.file-tabs .button {
		--padding-left: 26px;
		--padding-right: 14px;
		padding: 0 var(--padding-right) 0 var(--padding-left);

		&.editable {
			--padding-right: 18px;
		}

		.drag-handle {
			cursor: move;
			width: 2em;
			height: 100%;
			position: absolute;
			left: 0em;
			top: 0;
			background: currentColor;
			mask: var(--icon-file) 50% 50% / 1em no-repeat;
			opacity: 0.6;
					}

		.remove {
			position: absolute;
			display: none;
			top: 0;
			right: 0;
			padding: 0 2px;
			width: 16px;
			height: 100%;
			cursor: pointer;

			svg {
				width: 100%;
				height: 100%;
			}
		}

		&.drag-over {
			background: var(--repl-bg-4);
		}

		&[aria-current='true'] {
			border-bottom: 1px solid var(--repl-fg-accent);

			&.editable .filename {
				cursor: text;
			}

			.remove {
				display: block;
			}
		}
	}

	.file-tabs input {
		position: absolute;
		width: calc(100% - var(--padding-left) - var(--padding-right));
		border: none;
		outline: none;
		background-color: inherit;
		color: inherit;
		top: 0;
		left: var(--padding-left);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--repl-font-family-ui);
		font: var(--repl-font-ui-small);
		box-sizing: border-box;

		&:focus {
			color: var(--repl-fg-accent);
		}
	}

	.add-new {
		height: 32px;
		aspect-ratio: 1;

		.icon {
			display: block;
			width: 100%;
			height: 100%;
			background: currentColor;
			mask: var(--icon-file-new) 50% 50% no-repeat;
			mask-size: 16px;
		}
	}

	.settings {
		flex: 1;
		display: flex;
		justify-content: flex-end;
		position: relative;
		height: 100%;

		summary {
			list-style: none;
			display: flex;
			align-items: center;
			height: 100%;
			padding: 0 8px;
			cursor: pointer;

			&::-webkit-details-marker {
				display: none;
			}
		}

		.icon {
			width: 18px;
			height: 18px;
			background: currentColor;
			mask: var(--icon-settings) no-repeat 50% 50% / contain;
		}

		.menu {
			position: absolute;
			top: 100%;
			right: 0;
			z-index: 10;
			min-width: 240px;
			padding: 8px 16px;
			background: var(--repl-bg-2);
			border: 1px solid var(--repl-border);
			border-radius: var(--repl-border-radius);
			filter: var(--repl-shadow);
		}
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		height: 36px;
		font: var(--repl-font-ui-small);

		&[aria-disabled='true'] {
			color: var(--repl-fg-4);
		}

		input:not([type='checkbox']) {
			background: transparent;
			border: none;
			border-radius: var(--repl-border-radius);
			color: currentColor;
			width: 0;
			flex: 1;
			padding: 2px 6px;
			height: 32px;
			font: var(--repl-font-ui-medium);
			text-align: right;
		}
	}

	svg {
		position: relative;
		overflow: hidden;
		vertical-align: middle;
		object-fit: contain;
		transform-origin: center center;

		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		fill: none;
	}
</style>
