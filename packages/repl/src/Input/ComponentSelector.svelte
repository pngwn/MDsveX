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
	let input_value = $state(workspace.current.name.split('/').pop()!);

	const CONFIG = 'mdsvex.config.json';
	const DIRECTIVES = 'directives/';
	const PLUGIN = /^plugins\/([^/]+)\//;
	/** a directive is imported under its name */
	const NAME = /^[A-Za-z_$][\w$]*$/;

	/** the folder the repl registers a file from, a tab shows the name without it */
	function prefix_of(file: File) {
		if (file.name.startsWith(DIRECTIVES)) return DIRECTIVES;
		return PLUGIN.exec(file.name)?.[0] ?? '';
	}

	const label_of = (file: File) => file.name.slice(prefix_of(file).length);

	/** the files by what they are to mdsvex, in the order a tab strip shows them */
	const groups = $derived.by(() => {
		const content: File[] = [];
		const directives: File[] = [];
		const config: File[] = [];
		const plugins = new Map<string, File[]>();
		for (const file of workspace.file_nodes) {
			const plugin = PLUGIN.exec(file.name);
			if (file.name === CONFIG) config.push(file);
			else if (file.name.startsWith(DIRECTIVES)) directives.push(file);
			else if (plugin === null) content.push(file);
			else plugins.set(plugin[1], [...(plugins.get(plugin[1]) ?? []), file]);
		}
		// the plugin file leads its components
		for (const files of plugins.values())
			files.sort((a, b) => Number(b.name.endsWith('/plugin.js')) - Number(a.name.endsWith('/plugin.js')));
		return { content, directives, plugins: [...plugins], config };
	});

	let strip = $state() as HTMLElement;

	// the tab that is open shows what is being typed, so it follows the open file
	$effect(() => {
		input_value = label_of(workspace.current);
		// the strip is longer than its pane once there are plugins
		tick().then(() =>
			strip
				?.querySelector('[aria-current="true"]')
				?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
		);
	});

	function select(file: File) {
		workspace.select(file.name);
		input_value = label_of(file);
	}

	async function close_edit(file: File) {
		if (input_value === label_of(file) || input_value === '') {
			input_value = label_of(file);
			return;
		}

		const deconflicted = deconflict(prefix_of(file) + input_value, file);

		workspace.rename(file, deconflicted);
		input_value = deconflicted.slice(prefix_of(file).length);
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
		input_value = label_of(workspace.current);
	}

	function add(name: string, contents: string) {
		const file = workspace.add({
			type: 'file',
			name,
			basename: name.split('/').pop()!,
			contents,
			text: true
		}) as File;
		input_value = label_of(file);
		return file;
	}

	async function add_new() {
		add(deconflict(`Component.svx`), '');

		await tick();
		input.focus();
	}

	async function add_directive() {
		add(
			deconflict(`${DIRECTIVES}directive.svelte`),
			`<script>
	// the file name is the directive name. The bracket text of an inline
	// directive is children, that of a leaf is label, and the args are props
	let { children, label } = $props();
</scr` +
				`ipt>

<mark>{#if children}{@render children()}{:else}{label}{/if}</mark>
`
		);

		await tick();
		input.focus();
	}

	function add_config() {
		add(CONFIG, '{\n\t"heading_ids": true\n}\n');
	}

	/** set while the new plugin is being named */
	let naming = $state(false);
	let plugin_name = $state('');

	function add_plugin() {
		const name = plugin_name.trim();
		naming = false;
		plugin_name = '';
		if (!NAME.test(name)) {
			if (name !== '') alert(`A plugin is named with letters, digits and _, '${name}' is not`);
			return;
		}
		const file = `plugins/${name}/plugin.js`;
		if (workspace.file_nodes.some((f) => f.name === file)) {
			workspace.select(file);
			input_value = 'plugin.js';
			return;
		}

		add(
			`plugins/${name}/${name}.svelte`,
			`<script>
	// the component of :${name}[text]. The bracket text is children and
	// the args are props, plugin.js adds length
	let { children, length } = $props();
</scr` +
				`ipt>

<mark title="{length} characters">{@render children?.()}</mark>
`
		);
		add(
			file,
			`// the default export is the plugin, what the plugins option of mdsvex takes.
// It is registered as it is saved, with each .svelte file of this folder as
// the component of the directive of that name

export default {
	// handlers bound to a directive by its name
	directives: {
		${name}: {
			// called as the directive opens, what it returns is called as it closes
			parse(node, ctx) {
				return () => {
					const length = String(node.text_content.length);
					node.attrs.args = { ...node.attrs.args, length };
				};
			},
		},
	},
	// handlers by node type, for every node of the document
	parse: {
		heading: {
			parse(node, ctx) {},
		},
	},
};
`
		);
		workspace.focus();
	}

	let dragging: File | null = null;
	let dragover: File | null = $state.raw(null);
</script>

{#snippet tab(file: File)}
	<div
		class="button"
		class:editable={file.name !== entry}
		role="button"
		tabindex="0"
		aria-current={file === workspace.current}
		class:drag-over={file === dragover}
		title={file.name}
		onclick={() => select(file)}
		onkeyup={(e) => e.key === ' ' && select(file)}
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
			{(file === workspace.current && file.name !== entry ? input_value : label_of(file)) +
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
						input_value = label_of(file);
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
{/snippet}

<div class="component-selector">
	<div class="file-tabs" bind:this={strip}>
		{#each groups.content as file (file.name)}{@render tab(file)}{/each}
		<button class="add" onclick={add_new} aria-label="add a file" title="add a file">+</button>

		<span class="group">directives</span>
		{#each groups.directives as file (file.name)}{@render tab(file)}{/each}
		<button
			class="add"
			onclick={add_directive}
			aria-label="add a directive"
			title="add a directive, a component named after its file">+</button
		>

		<span class="group">plugins</span>
		{#each groups.plugins as [name, files] (name)}
			<span class="plugin">{name}</span>
			{#each files as file (file.name)}{@render tab(file)}{/each}
		{/each}
		{#if naming}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="naming"
				autofocus
				spellcheck={false}
				placeholder="name"
				aria-label="the name of the new plugin"
				bind:value={plugin_name}
				onblur={add_plugin}
				onkeydown={(e) => {
					if (e.key === 'Enter') e.currentTarget.blur();
					if (e.key === 'Escape') {
						plugin_name = '';
						e.currentTarget.blur();
					}
				}}
			/>
		{:else}
			<button
				class="add"
				onclick={() => (naming = true)}
				aria-label="create a plugin"
				title="create a plugin, a plugin file and the component of its directive">+</button
			>
		{/if}

		<span class="group">config</span>
		{#each groups.config as file (file.name)}{@render tab(file)}{/each}
		{#if groups.config.length === 0}
			<button
				class="add"
				onclick={add_config}
				aria-label="add mdsvex.config.json"
				title="add mdsvex.config.json">+</button
			>
		{/if}
	</div>

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
		color: var(--repl-fg-3);

		&:hover {
			color: var(--repl-fg-1);
		}

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
			color: var(--repl-fg-1);

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

	/* what the files after it are to mdsvex */
	.group,
	.plugin {
		display: inline-flex;
		align-items: center;
		height: 100%;
		font: var(--repl-font-ui-small);
		color: var(--repl-fg-4);
	}

	.group {
		margin-left: 6px;
		padding-left: 12px;
		border-left: 1px solid var(--repl-border);
	}

	.plugin {
		padding-left: 10px;
		color: var(--repl-fg-3);
	}

	.plugin::after {
		content: ':';
	}

	.add {
		height: 100%;
		padding: 0 8px;
		border: none;
		background: none;
		color: var(--repl-fg-3);
		font: var(--repl-font-ui-small);
		cursor: pointer;

		&:hover {
			color: var(--repl-fg-1);
		}
	}

	.file-tabs input.naming {
		position: static;
		width: 10ch;
		margin: 0 6px;
		border-bottom: 1px solid var(--repl-fg-accent);
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
