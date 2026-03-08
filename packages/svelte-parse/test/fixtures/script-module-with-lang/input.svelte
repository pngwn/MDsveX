<script module lang="ts">
	export const prerender = true;
	export type PageData = {
		title: string;
	};
</script>

<script lang="ts">
	export let data: PageData;
</script>

<h1>{data.title}</h1>
