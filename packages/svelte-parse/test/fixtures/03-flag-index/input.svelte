<i
    use:actions={use}
    use:events
    class="{clsxd(
        code,
        name,
        alias,
        className,
        'flag'
    )}"
    {...exclude($$props, ['use', 'class', 'code', 'name', 'alias'])}
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

    export let code = '';
    export let name = '';
    export let alias = '';
</script>
