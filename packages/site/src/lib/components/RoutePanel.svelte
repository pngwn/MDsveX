<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		activeRoute: any[];
		position: number;
		rawGrammar: any;
	}

	let { activeRoute, position, rawGrammar }: Props = $props();

	// Track which route steps are expanded
	let expandedSteps = $state(new SvelteSet());

	// Get rule definition from raw grammar
	// function getRuleDefinition(step) {
	// 	if (!step.rule || !rawGrammar || !rawGrammar.states || !step.fromName) {
	// 		return null;
	// 	}

	// 	// Get the state rules
	// 	let fromStateName = step.fromName;
	// 	let stateRules = rawGrammar?.states[fromStateName];

	// 	if (!stateRules) {
	// 		return null;
	// 	}

	// 	const rules = stateRules.rules || stateRules; // Handle both formats
	// 	if (!Array.isArray(rules)) {
	// 		return null;
	// 	}

	// 	// If rule is a string like "rule_0", extract the index
	// 	if (typeof step.rule === 'string' && step.rule.startsWith('rule_')) {
	// 		const ruleIndex = parseInt(step.rule.replace('rule_', ''));
	// 		if (rules[ruleIndex]) {
	// 			return rules[ruleIndex];
	// 		}
	// 	} else if (typeof step.rule === 'number') {
	// 		if (rules[step.rule]) {
	// 			return rules[step.rule];
	// 		}
	// 	} else if (typeof step.rule === 'string') {
	// 		// The rule is a descriptive string from GrammarMapper
	// 		const ruleDescription = step.rule;

	// 		// Try to find the matching rule
	// 		for (let i = 0; i < rules.length; i++) {
	// 			const rule = rules[i];
	// 			let patternMatches = false;

	// 			// Check if pattern matches what's in the description
	// 			if (rule.range) {
	// 				// Check for range patterns like [a-z]
	// 				if (Array.isArray(rule.range[0])) {
	// 					// Multiple ranges
	// 					const rangeStr = rule.range
	// 						.filter((r) => r !== undefined)
	// 						.map((r) => (Array.isArray(r) ? `[${r[0]}-${r[1]}]` : `[${r}]`))
	// 						.join(', ');
	// 					patternMatches = ruleDescription.includes(rangeStr);
	// 				} else {
	// 					// Single range
	// 					const rangeStr = `[${rule.range[0]}-${rule.range[1]}]`;
	// 					patternMatches = ruleDescription.includes(rangeStr);
	// 				}
	// 			} else if (rule.match) {
	// 				if (typeof rule.match === 'string') {
	// 					patternMatches = ruleDescription.includes(`"${rule.match}"`);
	// 				} else if (rule.match instanceof RegExp) {
	// 					patternMatches = ruleDescription.includes(rule.match.toString());
	// 				}
	// 			}

	// 			// Now check if the action also matches
	// 			if (patternMatches) {
	// 				// Check for token + state
	// 				if (rule.token && rule.state) {
	// 					if (
	// 						ruleDescription.includes(`→ ${rule.token}`) &&
	// 						ruleDescription.includes(`↓ ${rule.state}`)
	// 					) {
	// 						return rule;
	// 					}
	// 				}
	// 				// Check for just token
	// 				else if (rule.token && !rule.state) {
	// 					if (ruleDescription.includes(`→ ${rule.token}`)) {
	// 						return rule;
	// 					}
	// 				}
	// 				// Check for just state
	// 				else if (!rule.token && rule.state) {
	// 					if (ruleDescription.includes(`↓ ${rule.state}`)) {
	// 						return rule;
	// 					}
	// 				}
	// 				// Check for exit
	// 				else if (rule.exit) {
	// 					if (ruleDescription.includes('↑ exit')) {
	// 						return rule;
	// 					}
	// 				}
	// 			}
	// 		}

	// 		// Return first rule as last resort
	// 		return rules[0] || null;
	// 	}

	// 	return null;
	// }

	// Toggle expansion of a route step
	function toggleStepExpansion(stepIndex: number) {
		if (expandedSteps.has(stepIndex)) {
			expandedSteps.delete(stepIndex);
		} else {
			expandedSteps.add(stepIndex);
		}
	}
</script>

<div class="route-panel">
	<div class="route-steps">
		{#each activeRoute as step, i}
			<!-- {@const ruleDefinition = getRuleDefinition(step)} -->
			{@const isExpanded = expandedSteps.has(i)}
			<div class="route-step-container">
				<button
					class="route-step {step.type.toLowerCase()}"
					class:active={step.position <= position &&
						(i === activeRoute.length - 1 ||
							activeRoute[i + 1].position > position)}
					class:expanded={isExpanded}
					onclick={() => toggleStepExpansion(i)}
				>
					{#if step.rule}
						<span class="expand-icon"> ▶</span>
					{/if}
					{#if step.type === 'START'}
						<span class="step-icon">🏁</span>
						<span class="step-label">Start in</span>
						<span class="step-state">{step.stateName}</span>
						{#if step.charactersProcessed}
							<span
								class="char-count"
								title="Characters processed in this state"
								>({step.charactersProcessed} chars)</span
							>
						{/if}
					{:else if step.type === 'PUSH'}
						<span class="step-icon">{step.isProbe ? '🔍' : '→'}</span>
						<span class="step-label">{step.isProbe ? 'Probe' : 'Enter'}</span>
						<span class="step-state">{step.toName}</span>
						{#if step.charactersProcessed}
							<span
								class="char-count"
								title="Characters processed in this state"
								>({step.charactersProcessed} chars)</span
							>
						{/if}
						{#if step.tokenEmitted}
							<span class="token-indicator" title="Token emitted">📝</span>
						{/if}
						<span class="step-depth">(depth: {step.depth})</span>
					{:else if step.type === 'POP'}
						<span class="step-icon">←</span>
						<span class="step-label">Exit to</span>
						<span class="step-state">{step.toName}</span>
						{#if step.tokenEmitted}
							<span class="token-indicator" title="Token emitted">📝</span>
						{/if}
						<span class="step-depth">(depth: {step.depth})</span>
					{:else if step.type === 'TRANSITION'}
						<span class="step-icon">→</span>
						<span class="step-label">Transition to</span>
						<span class="step-state">{step.toName}</span>
						{#if step.tokenEmitted}
							<span class="token-indicator" title="Token emitted">📝</span>
						{/if}
					{/if}
					<span class="step-position">@{step.position}</span>
				</button>

				<!-- {#if isExpanded && ruleDefinition}
					<div class="rule-details {step.type.toLowerCase()}">
						<div class="rule-content">
							{#if step.entryPosition !== undefined}
								<div class="rule-property">
									<span class="property-label">Entry Position:</span>
									<span class="property-value">@{step.entryPosition}</span>
								</div>
							{/if}
							{#if step.rulesApplied && step.rulesApplied.length > 0}
								<div class="rule-property">
									<span class="property-label">Rules Applied:</span>
									<div class="rules-list">
										{#each step.rulesApplied as { rule, count }}
											<div class="applied-rule">
												<span class="rule-text">{rule}</span>
												<span class="rule-count">×{count}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							<div class="rule-property">
								<span class="property-label">Pattern:</span>
								<span class="property-value">
									{#if ruleDefinition.match}
										{JSON.stringify(ruleDefinition.match)}
									{:else if ruleDefinition.range}
										[{ruleDefinition.range[0]}-{ruleDefinition.range[1]}]
									{:else}
										(no pattern)
									{/if}
								</span>
							</div>
							{#if ruleDefinition.token}
								<div class="rule-property">
									<span class="property-label">Token:</span>
									<span class="property-value">{ruleDefinition.token}</span>
								</div>
							{/if}
							{#if ruleDefinition.state}
								<div class="rule-property">
									<span class="property-label">Push to:</span>
									<span class="property-value">{ruleDefinition.state}</span>
								</div>
							{/if}
							{#if ruleDefinition.exit}
								<div class="rule-property">
									<span class="property-label">Action:</span>
									<span class="property-value">Exit (pop)</span>
								</div>
							{/if}
						</div>
					</div>
				{/if} -->
			</div>
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
		padding: 0 01rem 0 0;
		min-height: 0;
	}

	.route-step-container {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.route-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--bg-tertiary);
		font-size: 0.75rem;
		transition: all 0.2s ease;
		cursor: pointer;
		width: 100%;
		text-align: left;
		border: 1px solid var(--border);
		border-left: 5px solid transparent;
		outline: none;
	}

	.route-step.expanded {
		border-bottom-color: var(--border-light);
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

	.route-step.start {
		border-left-color: var(--accent);
	}

	.route-step.push {
		border-left-color: #00dc82;
		margin-left: 0.5rem;
	}

	.route-step.pop {
		border-left-color: #ff6b6b;
	}

	.route-step.transition {
		border-left-color: #4ecdc4;
	}

	.step-icon {
		font-size: 1rem;
		width: 1.5rem;
		text-align: center;
		color: var(--text-secondary);
	}

	.step-label {
		color: var(--text-secondary);
		font-size: 0.7rem;
		min-width: 60px;
	}

	.step-state {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.step-depth {
		color: var(--text-tertiary);
		font-size: 0.7rem;
		margin-left: auto;
	}

	.step-position {
		color: var(--text-tertiary);
		font-size: 0.7rem;
		font-family: var(--font-mono);
		margin-left: 0.5rem;
	}

	.token-indicator {
		font-size: 0.8rem;
		margin-left: 0.25rem;
		opacity: 0.7;
	}

	.expand-icon {
		font-size: 0.7rem;
		color: var(--text-tertiary);
		margin-right: 0.25rem;
		transition: transform 0.2s ease;
	}

	.route-step.expanded .expand-icon {
		transform: rotate(90deg);
	}

	.rule-details {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-top: none;
		padding: 0.75rem;
		margin-bottom: 0.25rem;
		width: 100%;
	}

	.rule-details.push {
		margin-left: 0.5rem;
	}

	.rule-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rule-property {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.property-label {
		color: var(--text-secondary);
		font-weight: 500;
		min-width: 80px;
		flex-shrink: 0;
	}

	.property-value {
		color: var(--accent);
		font-family: var(--font-mono);
		word-break: break-all;
		flex: 1;
	}

	.char-count {
		color: var(--text-tertiary);
		font-size: 0.75rem;
		margin-left: 0.5rem;
	}

	.rules-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.applied-rule {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.125rem 0.25rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 2px;
	}

	.rule-text {
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		flex: 1;
	}

	.rule-count {
		color: var(--text-tertiary);
		font-size: 0.65rem;
		margin-left: 0.5rem;
		font-weight: 600;
	}
</style>
