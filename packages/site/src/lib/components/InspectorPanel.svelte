<script lang="ts">
import type { introspection_entry } from "@mdsvex/parse";

interface Props {
	source: string | undefined;
	position: number;
	analysis: introspection_entry | null;
	onPositionChange: (position: number) => void;
}

let { source, position, analysis, onPositionChange }: Props = $props();

let r: Range;
let hl: Highlight;
if (typeof window !== "undefined") {
	hl = new Highlight();
	CSS.highlights.set("position", hl);
	r = new Range();
	hl.add(r);
}

function handleScrub(
	event: Event & { currentTarget: EventTarget & HTMLInputElement },
) {
	const newPosition = +event.currentTarget.value;
	onPositionChange(newPosition);
}
</script>

<div class="bottom-panel">
	<div class="inspector-controls">
		<div class="slider-section">
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="slider-label">Position</label>
			<button onclick={() => onPositionChange(position - 1)}>-</button>
			<input
				type="range"
				min="0"
				max={(source?.length ?? 1) - 1}
				value={position}
				oninput={handleScrub}
				class="position-slider"
			/>
			<button onclick={() => onPositionChange(position + 1)}>+</button>
			<span class="position-value">{position}/{(source?.length ?? 1) - 1}</span>
		</div>

		<div class="inspector-stats">
			<div class="stat-item">
				<span class="stat-label">Char:</span>
				<span class="stat-value">'{analysis?.char ?? 'EOF'}'</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Code:</span>
				<span class="stat-value">{analysis?.code ?? '-'}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">State:</span>
				<span class="stat-value">{analysis?.active ?? '-'}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Depth:</span>
				<span class="stat-value">{analysis ? analysis.states.length - 1 : '-'}</span>
			</div>
		</div>
	</div>

	<div class="state-path-display">
		<span class="path-label">State Path:</span>
		<span class="path-value">{analysis?.states.join(' > ') ?? '-'}</span>
	</div>
</div>

<style>
	.bottom-panel {
		background: var(--bg-secondary);
		border-top: 1px solid var(--border);
		padding: 1rem 2rem;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.inspector-controls {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.slider-section {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.slider-label {
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		min-width: 60px;
	}

	.position-slider {
		flex: 1;
		margin: 0;
	}

	.position-value {
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		min-width: 80px;
	}

	.inspector-stats {
		display: flex;
		gap: 1.5rem;
		flex-shrink: 0;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.stat-label {
		color: var(--text-secondary);
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.stat-value {
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 500;
		min-width: 80px;
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.state-path-display {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
	}

	.path-label {
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.path-value {
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		flex: 1;
	}

	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	input[type='range']::-webkit-slider-track {
		background: var(--bg-tertiary);
		height: 6px;
		border: 1px solid var(--border);
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: var(--accent);
		height: 16px;
		width: 16px;
		margin-top: -5px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}

	input[type='range']::-webkit-slider-thumb:hover {
		background: var(--accent-hover);
		transform: scale(1.1);
	}
</style>
