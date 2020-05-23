export function lines(str) {
	return str
		.split('\n')
		.filter(s => !!s.trim())
		.map(s => s.trim());
}
