import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build_corpus } from "./corpus.mjs";

const tournament_directory = fileURLToPath(new URL(".", import.meta.url));
const repo_root = resolve(tournament_directory, "../../..");
const parse_module = await import(
	pathToFileURL(join(repo_root, "packages/parse/dist/main.js")).href
);
const corpus = await build_corpus(repo_root, "full");

const key_counts = new Map();
const kind_counts = new Map();
let nodes = 0;
let nodes_with_metadata = 0;
let metadata_json_bytes = 0;

for (const document of corpus.documents) {
	const result = parse_module.parse_markdown_svelte(document.source);
	const buffer = result.nodes;
	nodes += buffer.size;
	for (let index = 0; index < buffer.size; index += 1) {
		const metadata = buffer.metadata_at(index);
		if (metadata === undefined) continue;
		nodes_with_metadata += 1;
		metadata_json_bytes += JSON.stringify(metadata).length;
		const kind = buffer._kinds[index];
		kind_counts.set(kind, (kind_counts.get(kind) ?? 0) + 1);
		for (const key of Object.keys(metadata)) {
			key_counts.set(key, (key_counts.get(key) ?? 0) + 1);
		}
	}
}

const descending = (entries) =>
	[...entries].sort((a, b) => b[1] - a[1]);

process.stdout.write(
	`${JSON.stringify(
		{
			corpus: corpus.summary,
			nodes,
			nodesWithMetadata: nodes_with_metadata,
			metadataNodeRatio: nodes_with_metadata / nodes,
			metadataJsonBytes: metadata_json_bytes,
			keys: descending(key_counts),
			kinds: descending(kind_counts),
		},
		null,
		2,
	)}\n`,
);
