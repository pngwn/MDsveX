{#if circular}
    <div
        use:actions={use}
        use:events
        class="{classes}"
        {...props}
    ><slot></slot></div>
{:else}
    <div
        use:actions={use}
        use:events
        class="{classes}"
        {...props}
    ><div 
        class="visible content"
    ><slot name="visible"></slot></div>
    <div 
        class="hidden content"
    ><slot name="hidden"></slot></div></div>
{/if}

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let animation = '';
    export let direction = '';
    export let size = '';
    export let instant = false;
    export let circular = false;
    export let active = false;
    export let disabled = false;

    $: classes = clsxd(
        'ui',
        animation,
        size,
        direction,
        circular && 'circular image',
        { 'active': active },
        { 'instant': instant },
        { 'disabled': disabled },
        className,
        'reveal'
    )
    $: props = exclude($$props, ['use', 'class', 'animation', 'direction', 'size', 'instant', 'circular', 'active', 'disabled'])
</script>
