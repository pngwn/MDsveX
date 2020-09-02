<script>
    import { smfloated } from '../../lib/elements/util';

    export let size = '';
    export let src = '';
    export let alt = '';
    export let svg = false;
    export let parent = true;
    export let href = '';
    export let hidden = false;
    export let disabled = false;
    export let vertical = '';
    export let centered = false;
    export let spaced = '';
    export let variation = '';
    export let float = '';
    export let content = ''; // Only supported alongside of Reveal component

    $: floated = smfloated(float)
</script>

{#if (parent || svg) && !content }
    <div class="ui {size} {variation} {vertical} {spaced} {floated} image" 
    class:hidden class:disabled class:aligned={vertical} class:centered class:spaced>
        {#if svg}
            <slot></slot>
        {:else}
            <img {src} {alt} />
        {/if}
    </div>
{:else if href && !content}
    <a {href} class="ui {size} {variation} {vertical} {spaced} {floated} image" 
    class:hidden class:disabled class:aligned={vertical} class:centered class:spaced>
        {#if svg}
            <slot></slot>
        {:else}
            <img {src} {alt} />
        {/if}
    </a>
{:else if content}
    <img class="{content}" class:content {src} {alt} />
{:else}
    <img class="ui {size} {variation} {vertical} {spaced} {floated} image" 
    class:hidden class:disabled class:aligned={vertical} class:centered class:spaced 
    {src} {alt} />
{/if}