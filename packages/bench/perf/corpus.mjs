// every report records the corpus hash so reports built from different inputs are never compared

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { perf_root } from './paths.mjs';

export const corpus_dir = join(perf_root, 'corpus');
export const FAMILIES = ['micro', 'fixtures', 'real', 'sized', 'huge'];

export function hash_text(text) {
	return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const manifest_path = join(corpus_dir, 'manifest.json');
const manifest = existsSync(manifest_path)
	? JSON.parse(readFileSync(manifest_path, 'utf8'))
	: { corpus_hash: 'none', entries: [], excluded: [] };

export const CORPUS_HASH = manifest.corpus_hash;
export const EXCLUDED = manifest.excluded;

const cache = new Map();

function load(entry) {
	const key = `${entry.family}/${entry.file}`;
	if (!cache.has(key)) {
		const text = readFileSync(
			join(corpus_dir, entry.family, entry.file),
			'utf8'
		);
		const hash = hash_text(text);
		if (hash !== entry.hash) {
			throw new Error(
				`corpus file ${key} does not match the manifest (${hash} != ${entry.hash}).\n` +
					'the corpus is frozen; regenerate it with bin/build-corpus.mjs and recalibrate.'
			);
		}
		cache.set(key, text);
	}
	return cache.get(key);
}

/** @returns {{family: string, file: string, stem: string, id: string, bytes: number, source: string}[]} */
export function corpus({ families = FAMILIES } = {}) {
	return manifest.entries
		.filter((e) => families.includes(e.family))
		.map((e) => {
			const stem = e.file.replace(/\.[^.]+$/, '');
			return {
				family: e.family,
				file: e.file,
				stem,
				id: `${e.family}/${stem}`,
				bytes: e.bytes,
				nodes: e.nodes,
				get source() {
					return load(e);
				},
			};
		});
}

export function corpus_summary() {
	const by_family = {};
	for (const e of manifest.entries) {
		by_family[e.family] ??= { files: 0, bytes: 0 };
		by_family[e.family].files++;
		by_family[e.family].bytes += e.bytes;
	}
	return { corpus_hash: CORPUS_HASH, by_family };
}
