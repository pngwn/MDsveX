<div
    use:actions={use}
    use:events
    class="{clsxd(
        'ui',
        [alignment, { 'aligned': alignment && alignment !== 'justified' }],
        fluid && 'fluid',
        text && 'text',
        className,
        'container'
    )}"
    {...exclude($$props, ['use', 'class', 'alignment', 'fluid', 'text'])}
><slot>No content is provided</slot></div>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let fluid = false;
    export let text = false;
    export let alignment = '';
</script>
