<div 
    use:actions={use}
    use:events
    class="{clsxd(
        'ui',
        [alignment, { 'aligned': alignment && alignment !== 'justified' }],
        [attached, { 'attached': attached }],
        basic && 'basic',
        circular && 'circular',
        clearing && 'clearing',
        color,
        compact && 'compact',
        disabled && 'disabled',
        emphasis,
        [fitted, { 'fitted': fitted }],
        [float, { 'floated': float }],
        inverted && 'inverted',
        [loading, { 'loading': loading }],
        [padded, { 'padded': padded }],
        piled && 'piled',
        placeholder && 'placeholder',
        raised && 'raised',
        stacked && 'stacked',
        vertical && 'vertical',
        className,
        'segment'
    )}"
    {...exclude($$props, ['use', 'class', 'inverted', 'disabled', 'size', 'color'])}
><slot></slot></div>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
    import SegmentGroup from './SegmentGroup.svelte'

    export { SegmentGroup }
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let color = '';
    export let loading = '';
    export let attached = '';
    export let padded = '';
    export let fitted = '';
    export let emphasis = '';
    export let float = '';
    export let alignment = '';
    export let placeholder = false;
    export let raised = false;
    export let stacked = false;
    export let piled = false;
    export let basic = false;
    export let vertical = false;
    export let disabled = false;
    export let inverted = false;
    export let compact = false;
    export let circular = false;
    export let clearing = false;
</script>