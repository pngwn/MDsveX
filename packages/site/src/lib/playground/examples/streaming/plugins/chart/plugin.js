// :::chart[label](type=bar) around a list of `name: value` items. The
// component draws the list as bars, this plugin tells it which items are
// whole: a number is not drawn while it may still be growing

export default {
	directives: {
		chart: {
			// called as the container opens, the chart is drawn from here on
			parse(chart, ctx) {
				const id = (ctx.scratch.charts = (ctx.scratch.charts ?? 0) + 1);
				chart.attrs.args = { ...chart.attrs.args, id: `chart-${id}`, committed: '0' };
			},
			// for a node at any depth inside the container
			descendants: {
				list_item(item, ctx) {
					// how many items came before this one
					const index = ctx.index;
					// called when the item closes, its line has ended
					return () => {
						const chart = ctx.directive;
						chart.attrs.args = { ...chart.attrs.args, committed: String(index + 1) };
					};
				},
			},
		},
	},
};
