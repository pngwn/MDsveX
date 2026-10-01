<script lang="ts">
	import Checkbox from '../Input/Checkbox.svelte';
	import type { Workspace } from '../workspace.svelte';

	let { workspace }: { workspace: Workspace } = $props();

	const is_fragments_available = $derived.by(() => {
		const version = workspace.svelte_version;
		if (version === 'local' || version === 'latest') return true;
		const [major, minor] = version.split('.');
		return +major > 5 || (+major === 5 && +minor >= 33);
	});
</script>

<div class="options">
	result = svelte.compile(source, &#123;
	<div class="option">
		<span class="key">generate:</span>

		{#each ['client', 'server'] as const as generate}
			<input
				id={generate}
				type="radio"
				checked={workspace.compiler_options.generate === generate}
				value={generate}
				onchange={() => {
					workspace.update_compiler_options({ generate });
				}}
			/>
			<label for={generate}><span class="string">"{generate}"</span></label>
		{/each},
	</div>

	{#if is_fragments_available}
		<div class="option">
			<span class="key">fragments:</span>

			{#each ['html', 'tree'] as const as fragments}
				<input
					id={fragments}
					type="radio"
					checked={(workspace.compiler_options.fragments ?? 'html') === fragments}
					value={fragments}
					onchange={() => {
						workspace.update_compiler_options({ fragments });
					}}
				/>
				<label for={fragments}><span class="string">"{fragments}"</span></label>
			{/each},
		</div>
	{/if}

	<!-- svelte-ignore a11y_label_has_associated_control (TODO this warning should probably be disabled if there's a component)-->
	<label class="option">
		<span class="key">dev:</span>
		<span style="position: relative; font-size: 12px; top: 0.2em">
			<Checkbox
				checked={workspace.compiler_options.dev!}
				onchange={(dev) => {
					workspace.update_compiler_options({ dev });
				}}
			/>
		</span>
		<span class="boolean">{workspace.compiler_options.dev}</span>
	</label>
	});
</div>

<style>
	.options {
		padding: 0 10px;
		font: var(--repl-font-mono);
	}

	.option {
		display: block;
		padding: 0 0 0 1.25em;
		white-space: nowrap;
		user-select: none;
	}

	.key {
		display: inline-block;
		width: 10em;
	}

	.string {
		color: var(--repl-code-string);
	}

	label {
		display: inline-block;
	}

	label[for] {
		color: var(--repl-code-string);
	}

	input[type='radio'] {
		position: absolute;
		top: auto;
		overflow: hidden;
		clip: rect(1px, 1px, 1px, 1px);
		width: 1px;
		height: 1px;
		white-space: nowrap;
	}

	input[type='radio'] + label {
		padding: 0 0 0 1.6em;
		margin: 0 0.6em 0 0;
		opacity: 0.7;
	}

	input[type='radio']:checked + label {
		opacity: 1;
	}

	input[type='radio'] + label:before {
		content: '';
		display: block;
		box-sizing: border-box;
		float: left;
		width: 16px;
		height: 16px;
		margin-left: -21px;
		margin-top: 4px;
		cursor: pointer;
		text-align: center;
		transition: box-shadow 0.05s ease-out;
		background-color: var(--repl-fg-4);
		border-radius: 100%;
		box-shadow: inset 0 0 0 0.5em var(--repl-bg-2);
		border: 1px solid var(--repl-border);
	}

	input[type='radio']:checked + label:before {
		background-color: var(--repl-fg-accent);
		box-shadow: inset 0 0 0 0.15em var(--repl-bg-2);
		border: 1px solid var(--repl-fg-accent);
		transition: box-shadow 0.2s ease-out;
	}
</style>
