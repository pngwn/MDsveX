<script>
    import { smaligned } from '../../lib/elements/util';

    export let page = '';
    export let attached = '';
    export let block = '';
    export let color = '';
    export let disabled = '';
    export let dividing = '';
    export let floated = '';
    export let icon = false;
    export let inverted = false;
    export let size = '';
    export let sub = false;
    export let subheader = false;
    export let alignment = '';

    $: aligned = smaligned(alignment)
</script>

{#if page === 'h1'}
    <h1 class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </h1>
{:else if page === 'h2'}
    <h2 class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </h2>
{:else if page === 'h3'}
    <h3 class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </h3>
{:else if page === 'h4'}
    <h4 class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </h4>
{:else if page === 'h5'}
    <h5 class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </h5>
{:else}
    <div class="{size} {color} {aligned} {attached} header" class:dividing class:icon class:aligned 
    class:block class:attached class:disabled class:sub class:ui={!sub}>
        <slot></slot>
    </div>
{/if}