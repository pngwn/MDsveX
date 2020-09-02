<script>
    import { smiconed, smlabeled, smactioned } from '../../lib/elements/util';

    export let icon = '';
    export let loading = '';
    export let size = '';
    export let color = '';
    export let label = '';
    export let focus = false;
    export let fluid = false;
    export let error = false;
    export let disabled = false;
    export let inverted = false;
    export let transparent = false;

    $: iconed = smiconed(icon)
    $: labeled = smlabeled(label)
    $: actioned = smactioned(action)
</script>

<div class="ui {iconed} {color} {loading} {size} {labeled} {actioned} input" class:loading class:disabled class:error 
class:inverted class:fluid class:transparent>
    <slot></slot>
</div>