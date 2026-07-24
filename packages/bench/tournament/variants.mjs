const CAPACITIES = [
	{ id: "shift2-floor64", expression: "source.length >> 2 || 64" },
	{ id: "shift2-floor128", expression: "source.length >> 2 || 128" },
	{ id: "shift3-floor64", expression: "source.length >> 3 || 64" },
	{ id: "shift3-floor256", expression: "source.length >> 3 || 256" },
	{ id: "shift4-floor64", expression: "source.length >> 4 || 64" },
	{ id: "shift4-floor128", expression: "source.length >> 4 || 128" },
	{ id: "shift5-floor128", expression: "source.length >> 5 || 128" },
	{ id: "shift5-floor256", expression: "source.length >> 5 || 256" },
];

const BASELINE_EXPRESSION = "source.length >> 3 || 128";

function edit(file, expression, expected_count) {
	return {
		file,
		find: BASELINE_EXPRESSION,
		replace: expression,
		expectedCount: expected_count,
	};
}

const capacity_variants = CAPACITIES.flatMap(({ id, expression }) => {
	if (expression === BASELINE_EXPRESSION) return [];

	return [
		{
			id: `capacity-parser-${id}`,
			family: "capacity",
			description: `parser arena capacity ${expression}`,
			metrics: ["parse"],
			edits: [edit("packages/parse/src/main.ts", expression, 1)],
		},
		{
			id: `capacity-compiler-${id}`,
			family: "capacity",
			description: `compiler arena capacity ${expression}`,
			metrics: [
				"compileMappedCold",
				"compileMappedReused",
				"compileV3",
				"compileV3Direct",
			],
			edits: [edit("packages/mdsvex/src/main.ts", expression, 2)],
		},
		{
			id: `capacity-combined-${id}`,
			family: "capacity",
			description: `parser and compiler arena capacity ${expression}`,
			metrics: [
				"parse",
				"compileMappedCold",
				"compileMappedReused",
				"compileV3",
				"compileV3Direct",
			],
			edits: [
				edit("packages/parse/src/main.ts", expression, 1),
				edit("packages/mdsvex/src/main.ts", expression, 2),
			],
		},
	];
});

export const variants = [
	{
		id: "control-rebuild",
		family: "control",
		description: "independently rebuilt baseline with no source edits",
		metrics: [
			"parse",
			"renderMapped",
			"compileMappedCold",
			"compileMappedReused",
			"compileV3",
			"compileV3Direct",
		],
		edits: [],
	},
	...capacity_variants,
];
