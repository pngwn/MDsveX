const posts = import.meta.glob('../*/+page.svx', {
	query: '?metadata',
	import: 'metadata',
	eager: true,
});

export function load() {
	return {
		posts: Object.entries(posts).map(([path, metadata]) => ({
			slug: path.split('/')[1],
			...metadata,
		})),
	};
}
