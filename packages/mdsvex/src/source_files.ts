// the files documents show with src=, kept by the vite plugin so a change to
// one compiles the documents that show it again

/** a path as vite writes it, a windows path arrives with either slash */
export function slashed(path: string): string {
	return path.indexOf('\\') === -1 ? path : path.replace(/\\/g, '/');
}

/** the files each document shows, by document path without a query */
export function source_files() {
	const shown = new Map<string, readonly string[]>();

	return {
		/** true when no document shows a file, so a compile need not drop its own */
		get empty(): boolean {
			return shown.size === 0;
		},
		track(doc: string, files: readonly string[]): void {
			shown.set(slashed(doc), files.map(slashed));
		},
		/** for a document that compiled without a src= */
		drop(doc: string): void {
			shown.delete(slashed(doc));
		},
		files_of(doc: string): readonly string[] {
			return shown.get(slashed(doc)) ?? [];
		},
		docs_showing(file: string): string[] {
			const docs: string[] = [];
			if (shown.size === 0) return docs;
			const path = slashed(file);
			for (const [doc, files] of shown)
				if (files.includes(path)) docs.push(doc);
			return docs;
		},
	};
}

export type SourceFiles = ReturnType<typeof source_files>;
