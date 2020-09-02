<div 
    use:actions={use}
    use:events
    class="{clsxd(
        'ui',
        size,
        direction,
        internal && 'internal',
        dividing && 'dividing',
        attached && 'attached',
        very && 'very',
        close && 'close'
    )}"
    {...exclude($$props, ['use', 'class', 'direction', 'size', 'internal', 'dividing', 'attached', 'very', 'close'])}
><slot>No content provided</slot></div>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let direction = 'left';
    export let size = '';
    export let internal = false;
    export let dividing = false;
    export let attached = false;
    export let close = false;
    export let very = false;
</script>