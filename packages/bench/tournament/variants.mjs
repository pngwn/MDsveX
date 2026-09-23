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

const metadata_variants = [
	{
		id: "metadata-sparse-array",
		family: "metadata",
		description: "store sparse node metadata in an indexed array",
		metrics: [
			"parse",
			"parseBorrowed",
			"renderMapped",
			"compileMappedCold",
			"compileMappedReused",
			"compileV3",
			"compileV3Direct",
		],
		edits: [
			{
				file: "packages/parse/src/utils.ts",
				find: "private metadata: Map<number, any>;",
				replace: "private metadata: (any | undefined)[];",
				expectedCount: 1,
			},
			{
				file: "packages/parse/src/utils.ts",
				find: "this.metadata = new Map();",
				replace: "this.metadata = [];",
				expectedCount: 1,
			},
			{
				file: "packages/parse/src/utils.ts",
				find: "this.metadata.clear();",
				replace: "this.metadata.length = 0;",
				expectedCount: 1,
			},
			{
				file: "packages/parse/src/utils.ts",
				find: "this.metadata.set(index, metadata);",
				replace: "this.metadata[index] = metadata;",
				expectedCount: 3,
			},
			{
				file: "packages/parse/src/utils.ts",
				find: "this.metadata.delete(index);",
				replace: "this.metadata[index] = undefined;",
				expectedCount: 1,
			},
			{
				file: "packages/parse/src/utils.ts",
				find: "return this.metadata.get(index);",
				replace: "return this.metadata[index];",
				expectedCount: 1,
			},
		],
	},
];

export const variants = [
	{
		id: "control-rebuild",
		family: "control",
		description: "independently rebuilt baseline with no source edits",
		metrics: [
			"parse",
			"parseBorrowed",
			"renderMapped",
			"compileMappedCold",
			"compileMappedReused",
			"compileV3",
			"compileV3Direct",
		],
		edits: [],
	},
	...capacity_variants,
	...metadata_variants,
];
