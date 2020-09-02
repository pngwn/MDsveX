<span
    use:actions={use}
    use:events
    class={clsxd(
        'ui',
        color,
        size,
        inverted && 'inverted',
        disabled && 'disabled',
        className,
        'text'
    )}
    {...exclude($$props, ['use', 'class', 'inverted', 'disabled', 'size', 'color'])}
><slot></slot></span>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let inverted = false;
    export let disabled = false;
    export let size = '';
    export let color = '';
</script>