{#if animation}
    <div class="ui animated {animation} {color} {size} {floated} {attached} button" tabindex="0"  
    class:active class:tertiary class:basic class:inverted class:compact class:toggle class:fluid
    class:positive class:negative class:circular class:icon class:attached use:activate={toggle}>
        <div class="visible content">
            <slot name="visible">No visible content provided</slot>
        </div>
        <div class="hidden content">
            <slot name="hidden">No hidden content provided</slot>
        </div>
    </div>
{:else if labeled}
    <div class="ui {color} {size} {floated} {labeled} {attached} button" tabindex="0"  
    class:active class:tertiary class:basic class:inverted class:compact class:toggle class:fluid
    class:positive class:negative class:circular class:icon class:attached use:activate={toggle}>
        <slot></slot>
    </div>
{:else}
    <button class="ui {emphasis} {color} {loading} {size} {floated} {attached} button" 
    class:active class:tertiary class:basic class:inverted class:loading class:compact class:toggle class:fluid
    class:positive class:negative class:circular class:icon class:attached use:activate={toggle}>
        {#if loading}
            Loading
        {:else}
            <slot>
                {#if icon}
                    <Icon name={icon} />
                {/if}
            </slot>
        {/if}
    </button>
{/if}

<script>
    import { listen } from 'svelte/internal';
    import { smfloated, smlabeled } from '../../lib/elements/util';

    import Icon from '../icon/index.svelte';

    export let active = false;
    export let emphasis = '';
    export let color = '';
    export let animation = '';
    export let loading = '';
    export let size = '';
    export let inverted = false;
    export let basic = false;
    export let tertiary = false;
    export let compact = false;
    export let toggle = '';
    export let fluid = false;
    export let float = '';
    export let attached = '';
    export let label = '';
    export let positive = false;
    export let negative = false;
    export let circular = false;
    export let icon = '';

    $: floated = smfloated(float)
    $: labeled = smlabeled(label)

    function toggleState(e) {
        if(toggle) {
            active = !active;
        }
    }

    function activate(node, ev) {
        let _unlistener = typeof ev === 'string' && ev.startsWith('on:') ? listen(node, ev.substring(3), toggleState) : null;
        
        return {
            update(ev) {
                _unlistener = _unlistener ? _unlistener() : null
                _unlistener = typeof ev === 'string' && ev.startsWith('on:') ? listen(node, ev.substring(3), toggleState) : null;
            },

            destroy() {
                if(_unlistener) _unlistener();
            }
        }
    }
</script>
