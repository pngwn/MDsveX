export function typewriter(node, { speed = 50, delay }) {
	const valid =
		node.childNodes.length === 1 && node.childNodes[0].nodeType === 3;
	if (!valid) return {};

	const text = node.textContent;
	const duration = text.length * speed;

	return {
		duration,
		delay,
		tick: (t, u) => {
			const i = ~~(text.length * t);
			node.textContent = text.slice(0, i);
		},
	};
}
