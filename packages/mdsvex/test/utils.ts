export function lines(str: string): string[] {
	return str
		.split('\n')
		.filter((s) => !!s.trim())
		.map((s) => s.trim());
}
