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

	/** the files by what they are to mdsvex, a section of the bar each */
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

	type Section = 'files' | 'directives' | 'plugins' | 'config';

	/** the section whose menu is open */
	let open = $state<Section | null>(null);
	let bar = $state() as HTMLElement;

	function section_of(file: File): Section {
		if (file.name === CONFIG) return 'config';
		if (file.name.startsWith(DIRECTIVES)) return 'directives';
		return PLUGIN.test(file.name) ? 'plugins' : 'files';
	}

	const current_section = $derived(section_of(workspace.current));
	/** the open file as its section names it, a plugin file with its plugin */
	const current_label = $derived(
		current_section === 'plugins'
			? workspace.current.name.slice('plugins/'.length)
			: label_of(workspace.current)
	);

	// the row that is open shows what is being typed, so it follows the open file
	$effect(() => {
		input_value = label_of(workspace.current);
	});

	function toggle(id: Section) {
		open = open === id ? null : id;
	}

	/** a click on the open file leaves the menu up, its row is where it is renamed */
	function pick(file: File) {
		if (file !== workspace.current) open = null;
		select(file);
	}

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
		open = null;
	}

	/** set while the new plugin is being named */
	let naming = $state(false);
	let plugin_name = $state('');

	function add_plugin() {
		const name = plugin_name.trim();
		naming = false;
		if (name !== '') open = null;
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

{#snippet row(file: File)}
	<div
		class="row"
		role="button"
		tabindex="0"
		title={file.name}
		aria-current={file === workspace.current}
		class:drag-over={file === dragover}
		onclick={() => pick(file)}
		onkeyup={(e) => e.key === ' ' && e.target === e.currentTarget && pick(file)}
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
		{#if file === workspace.current && file.name !== entry}
			<input
				spellcheck={false}
				aria-label="the name of the file"
				bind:this={input}
				bind:value={input_value}
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

			<button
				class="remove"
				aria-label="delete {file.name}"
				title="delete"
				onclick={(e) => {
					e.stopPropagation();
					remove_file(file);
				}}>×</button
			>
		{:else}
			<span class="filename">{label_of(file)}{workspace.modified[file.name] ? '*' : ''}</span>
		{/if}
	</div>
{/snippet}

{#snippet head(id: Section, count: number)}
	<button
		class="head"
		aria-expanded={open === id}
		aria-current={current_section === id}
		onclick={() => toggle(id)}
	>
		<span class="label">{id}</span>
		{#if current_section === id}
			<span class="name">{current_label}{workspace.modified[workspace.current.name] ? '*' : ''}</span>
		{:else}
			<span class="count">{count}</span>
		{/if}
		<span class="caret"></span>
	</button>
{/snippet}

<svelte:window
	onclick={(e) => {
		// the path, as a click can replace what was clicked before it gets here
		if (open !== null && !e.composedPath().includes(bar)) open = null;
	}}
	onkeydown={(e) => e.key === 'Escape' && (open = null)}
/>

<div class="component-selector">
	<div class="sections" bind:this={bar}>
		<div class="section">
			{@render head('files', groups.content.length)}
			{#if open === 'files'}
				<div class="menu">
					{#each groups.content as file (file.name)}{@render row(file)}{/each}
					<button class="new" onclick={add_new}>+ new file</button>
				</div>
			{/if}
		</div>

		<div class="section">
			{@render head('directives', groups.directives.length)}
			{#if open === 'directives'}
				<div class="menu">
					{#each groups.directives as file (file.name)}{@render row(file)}{/each}
					<button
						class="new"
						onclick={add_directive}
						title="a component, the directive is named after its file">+ new directive</button
					>
				</div>
			{/if}
		</div>

		<div class="section">
			{@render head('plugins', groups.plugins.length)}
			{#if open === 'plugins'}
				<div class="menu">
					{#each groups.plugins as [name, files] (name)}
						<div class="plugin">{name}</div>
						{#each files as file (file.name)}{@render row(file)}{/each}
					{/each}
					{#if naming}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="naming"
							autofocus
							spellcheck={false}
							placeholder="name the plugin"
							aria-label="the name of the new plugin"
							bind:value={plugin_name}
							onblur={add_plugin}
							onkeydown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
								if (e.key === 'Escape') {
									e.stopPropagation();
									plugin_name = '';
									e.currentTarget.blur();
								}
							}}
						/>
					{:else}
						<button
							class="new"
							onclick={() => (naming = true)}
							title="a plugin file and the component of its directive">+ new plugin</button
						>
					{/if}
				</div>
			{/if}
		</div>

		<div class="section">
			{@render head('config', groups.config.length)}
			{#if open === 'config'}
				<div class="menu">
					{#each groups.config as file (file.name)}{@render row(file)}{/each}
					{#if groups.config.length === 0}
						<button class="new" onclick={add_config}>+ add {CONFIG}</button>
					{/if}
				</div>
			{/if}
		</div>
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

	.sections {
		display: flex;
		height: 100%;
		min-width: 0;
	}

	.section {
		position: relative;
		height: 100%;
	}

	/* the name of a section, and the open file when it is one of its own */
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 100%;
		padding: 0 12px;
		border: none;
		border-bottom: 1px solid transparent;
		border-radius: 0;
		background: none;
		color: var(--repl-fg-3);
		font: var(--repl-font-ui-small);
		white-space: nowrap;
		cursor: pointer;

		&:hover,
		&[aria-expanded='true'] {
			color: var(--repl-fg-1);
			background: var(--repl-bg-4);
		}

		&[aria-current='true'] {
			border-bottom-color: var(--repl-fg-accent);
			color: var(--repl-fg-3);

			.name {
				color: var(--repl-fg-1);
			}
		}

		.count {
			color: var(--repl-fg-4);
			font-variant-numeric: tabular-nums;
		}

		.caret {
			width: 0;
			height: 0;
			border: 4px solid transparent;
			border-top-color: currentColor;
			border-bottom-width: 0;
			opacity: 0.7;
		}
	}

	.menu {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 10;
		min-width: 240px;
		padding: 4px 0;
		background: var(--repl-bg-2);
		border: 1px solid var(--repl-border);
		border-radius: var(--repl-border-radius);
		filter: var(--repl-shadow);
		font: var(--repl-font-ui-small);
	}

	.row,
	.new {
		display: flex;
		align-items: center;
		width: 100%;
		height: 30px;
		padding: 0 12px;
		box-sizing: border-box;
		border: none;
		border-left: 2px solid transparent;
		border-radius: 0;
		background: none;
		color: var(--repl-fg-3);
		font: var(--repl-font-ui-small);
		text-align: left;
		white-space: nowrap;
		cursor: pointer;

		&:hover,
		&.drag-over {
			color: var(--repl-fg-1);
			background: var(--repl-bg-4);
		}
	}

	.row[aria-current='true'] {
		border-left-color: var(--repl-fg-accent);
		color: var(--repl-fg-1);
	}

	.row input,
	input.naming {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: none;
		outline: none;
		background: none;
		color: inherit;
		font: var(--repl-font-ui-small);
	}

	input.naming {
		display: block;
		width: 100%;
		height: 30px;
		padding: 0 12px 0 14px;
		box-sizing: border-box;
		color: var(--repl-fg-1);
	}

	.remove {
		padding: 0 4px;
		border: none;
		background: none;
		color: var(--repl-fg-3);
		font: inherit;
		font-size: 1.2em;
		line-height: 1;
		cursor: pointer;

		&:hover {
			color: var(--repl-fg-1);
		}
	}

	/* the name of a plugin over its files */
	.plugin {
		padding: 8px 14px 2px;
		color: var(--repl-fg-4);
	}

	.plugin ~ .row {
		padding-left: 22px;
	}

	.new {
		margin-top: 4px;
		border-top: 1px solid var(--repl-border);
		height: 32px;
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
