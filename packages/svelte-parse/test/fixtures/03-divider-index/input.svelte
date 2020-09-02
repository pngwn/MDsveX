<div
    use:actions={use}
    use:events
    class="{clsxd(
        'ui',
        direction,
        inverted && 'inverted',
        fitted && 'fitted',
        hidden && 'hidden',
        section && 'section',
        clearing && 'clearing',
        className,
        'divider'
    )}"
    {...exclude($$props, ['use', 'class', 'direction', 'inverted', 'fitted', 'hidden', 'section', 'clearing'])}
><slot></slot></div>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let direction = '';
    export let inverted = false;
    export let fitted = false;
    export let hidden = false;
    export let section = false;
    export let clearing = false;
</script>
