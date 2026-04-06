<script lang="ts">
import Viewer from "$lib/Viewer.svelte";

let { data } = $props();
</script>

<Viewer markdown={data.markdown} />
