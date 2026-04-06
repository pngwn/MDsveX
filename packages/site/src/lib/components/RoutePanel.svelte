<script lang="ts">
interface route_step {
	type: "push" | "pop" | "swap";
	state: string;
	cursor: number;
	char: string;
	depth: number;
}

interface Props {
	steps: route_step[];
	position: number;
}

let { steps, position }: Props = $props();

function format_char(char: string): string {
	if (char === "\n") return "\\n";
	if (char === "\t") return "\\t";
	if (char === " ") return "\\s";
	return char;
}
</script>

<div class="route-panel">
	<div class="route-steps">
		{#each steps as step, i}
			{@const is_active =
				step.cursor <= position &&
				(i === steps.length - 1 || steps[i + 1].cursor > position)}
			<button
				class="route-step {step.type}"
				class:active={is_active}
				style="--indent: {step.depth * 12}px"
			>
				<span class="step-icon">
					{#if step.type === 'push'}
						&#8594;
					{:else if step.type === 'pop'}
						&#8592;
					{:else}
						&#8596;
					{/if}
				</span>
				<span class="step-label">
					{#if step.type === 'push'}
						Enter
					{:else if step.type === 'pop'}
						Exit
					{:else}
						Swap
					{/if}
				</span>
				<span class="step-state">{step.state}</span>
				<span class="step-char" title="Character at cursor">'{format_char(step.char)}'</span>
				<span class="step-position">@{step.cursor}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.route-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	.route-steps {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		overflow-y: auto;
		padding: 0 1rem 0 0;
		min-height: 0;
	}

	.route-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		padding-left: calc(0.5rem + var(--indent));
		background: var(--bg-tertiary);
		font-size: 0.75rem;
		transition: all 0.2s ease;
		cursor: pointer;
		width: 100%;
		text-align: left;
		border: 1px solid var(--border);
		border-left: 4px solid transparent;
		outline: none;
	}

	.route-step:hover {
		background: var(--bg-hover);
		border-color: var(--border-light);
	}

	.route-step:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-dim);
	}

	.route-step.active {
		background: var(--accent-dim);
		border-color: var(--accent);
	}

	.route-step.push {
		border-left-color: #00dc82;
	}

	.route-step.pop {
		border-left-color: #ff6b6b;
	}

	.route-step.swap {
		border-left-color: #4ecdc4;
	}

	.step-icon {
		font-size: 0.875rem;
		width: 1.25rem;
		text-align: center;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.step-label {
		color: var(--text-secondary);
		font-size: 0.7rem;
		min-width: 32px;
		flex-shrink: 0;
	}

	.step-state {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-weight: 600;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.step-char {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.step-position {
		color: var(--text-tertiary);
		font-size: 0.7rem;
		font-family: var(--font-mono);
		flex-shrink: 0;
	}
</style>
