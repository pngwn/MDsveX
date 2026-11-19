<script lang="ts">
	import JSONNode from '@sveltejs/svelte-json-tree';

	export let data: any;
	export let columns: any;

	$: table = create_table(data, columns);

	function create_table(data: any, custom_columns?: string[]) {
		let has_non_object = false;
		const columns: Set<string> = new Set();

		if (custom_columns) {
			custom_columns.forEach((column) => columns.add(column));
		} else {
			for (const key in data) {
				const value = data[key];
				if (typeof value === 'object') {
					Object.keys(value).forEach((key) => columns.add(key));
				} else {
					has_non_object = true;
				}
			}
		}

		const is_array = Array.isArray(data);

		const rows = Object.keys(data).map((key) => {
			const value = data[key];
			const values = [];

			for (const column of columns) {
				values.push(typeof value === 'object' && column in value ? value[column] : '');
			}

			if (has_non_object) {
				values.push(typeof value !== 'object' ? value : '');
			}

			return {
				key: is_array ? parseInt(key) : key,
				values
			};
		});

		if (has_non_object) {
			columns.add('Value');
		}

		return { columns, rows };
	}
</script>

<div class="table">
	<table>
		<thead>
			<tr>
				<th>(index)</th>

				{#each table.columns as column}
					<th>{column}</th>
				{/each}
			</tr>
		</thead>

		<tbody>
			{#each table.rows as row}
				<tr>
					<td>
						{#if typeof row.key === 'string'}
							{row.key}
						{:else}
							<JSONNode value={row.key} />
						{/if}
					</td>

					{#each row.values as value}
						<td>
							{#if typeof value === 'string'}
								{value}
							{:else}
								<JSONNode {value} />
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table {
		--json-tree-font-size: 12px;
		--json-tree-font-family: var(--repl-font-family-mono);
		margin: 8px;
		overflow: auto;
		max-height: 200px;
		border: 1px solid var(--repl-border);
		border-radius: 2px;
		overscroll-behavior: none;
	}

	table {
		border-collapse: collapse;
		line-height: 1;
		font-family: var(--repl-font-family-mono);
	}

	th {
		background: var(--repl-bg-3);
		padding: 5px 10px;
		border: none;
		position: sticky;
		font-weight: normal;
		font-size: 14px;
		top: 0;
	}

	td {
		font-family: var(--repl-font-family-mono);
		font-size: 12px;
		padding: 5px 10px;
		border-bottom: none;
	}

	tr {
		background: var(--repl-bg-1);
	}

	tr:nth-child(2n) {
		background: var(--repl-bg-3);
	}

	th,
	td {
		border-right: 1px solid var(--repl-bg-3);
	}
</style>
