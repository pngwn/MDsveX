<i 
    use:actions={use}
    use:events
    class="{clsxd(
        name,
        size,
        color,
        [flipped, { 'flipped': flipped }],
        [rotated, { 'rotated': rotated }],
        [corner, { 'corner': corner }],
        bordered && 'bordered',
        circular && 'circular',
        disabled && 'disabled',
        inverted && 'inverted',
        loading && 'loading',
        fitted && 'fitted',
        link && 'link',
        className,
        'icon'
    )}"
    {...exclude($$props, [
        'use', 'class', 'color', 'name', 'size', 'corner', 'flipped', 'rotated', 'bordered', 
        'circular', 'disabled', 'inverted', 'loading', 'fitted', 'link', 'flipped', 'roated'
    ])}
></i>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let color = '';
    export let name = '';
    export let corner = '';
    export let size = '';
    export let flipped = '';
    export let rotated = '';
    export let bordered = false;
    export let circular = false;
    export let disabled = false;
    export let inverted = false;
    export let loading = false;
    export let fitted = false;
    export let link = false;
</script>
