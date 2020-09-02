<div
    class={clsxd(
        'ui',
        size,
        divided,
        [attached, {'attached': attached}],
        ordered && 'ordered',
        vertical && 'vertical',
        stackable && 'stackable',
        fluid && 'fluid',
        unstackable && 'unstackable',
        inverted && 'inverted',
        className,
        'steps'
    )}
    {...exclude($$props, ['class', 'ordered', 'vertical', 'stackable', 'fluid', 'unstackable', 'attached', 'size', 'inverted'])}
><slot></slot></div>

<script context="module">
    import { exclude, clsxd } from '../../lib'
</script>

<script>
    let className = '';
    export { className as class };

    export let attached = ''
    export let size = ''
    export let divided = ''
    export let ordered = false
    export let vertical = false
    export let stackable = false
    export let unstackable = false
    export let fluid = false
    export let inverted = false
</script>