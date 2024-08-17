export function lines(str?: string): string[] {
	if (!str) return [];
	return str
		.split('\n')
		.filter((s) => !!s.trim())
		.map((s) => s.trim());
}
