<div
    class={clsxd(
        'ui',
        horizontal && 'horizontal',
        stackable && 'stackable',
        raised && 'raised',
        stacked && 'stacked',
        piled && 'piled',
        className,
        'segments'
    )}
    {...exclude($$props, ['class', 'horizontal', 'stackable', 'stacked', 'raised', 'piled'])}
><slot></slot></div>

<script context="module">
    import { exclude, clsxd } from '../../lib'
</script>

<script>
    let className = '';
    export { className as class };

    export let horizontal = false
    export let stackable = false
    export let stacked = false
    export let raised = false
    export let piled = false
</script>