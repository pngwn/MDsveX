<script>
    import {isDeleteKey} from '../../utils'
    import { createEventDispatcher } from 'svelte'
    
    /** Type (color) of the icon
    * @svelte-prop {String} type
    * @values <code>is-white</code>, <code>is-black</code>, <code>is-light</code>, <code>is-dark</code>, <code>is-primary</code>, <code>is-info</code>, <code>is-success</code>, <code>is-warning</code>, <code>is-danger</code>, and any other colors you've set in the <code>$colors</code> list on Sass
    * */
    export let type = ''

    /** Size of the tab
    * @svelte-prop {String} size
    * @values <code>is-medium</code>, <code>is-large</code>
    * */
    export let size = ''

    /** Tag border rounded  
    * @svelte-prop {Boolean} [rounded=false]
    * */
    export let rounded = false

    /** Add close/delete button to the tag  
    * @svelte-prop {Boolean} [closable=false]
    * */
    export let closable = false

    /** Close/delete button style equal to attached tags    
    * @svelte-prop {Boolean} [attached=false]
    * */
    export let attached = false

    /** Adds ellipsis to not overflow the text  
    * @svelte-prop {Boolean} [ellipsis=false]
    * */
    export let ellipsis = false

    /** If should stop when using tab key   
    * @svelte-prop {Boolean} [tabstop=true]
    * */
    export let tabstop = true

    /** Disable delete button   
    * @svelte-prop {Boolean} [disabled=false]
    * */
    export let disabled = false

    const dispatch = createEventDispatcher()

    function close() {
        if (this.disabled) return
        dispatch('close')
    }

</script>

{#if attached && closable}
    <div class="tags has-addons">
        <span
            class="tag {type} {size}"
            class:is-rounded={rounded}>
            <span class:has-ellipsis={ellipsis}>
                <slot/>
            </span>
        </span>
        <a  role="button"
            class="tag is-delete {size}"
            class:is-rounded={rounded}
            {disabled}
            tabindex={tabstop ? 0 : false}
            on:click={close}
            on:keyup|preventDefault={e => isDeleteKey() && close()}
        />
    </div>
{:else}
    <span
        class="tag {type} {size}"
        class:is-rounded={rounded}>
        <span class:has-ellipsis={ellipsis}>
            <slot/>
        </span>
        {#if closable}
            <a  role="button"
                class="delete is-small"
                {disabled}
                tabindex={tabstop ? 0 : false}
                on:click={close}
                on:keyup|preventDefault={e => isDeleteKey() && close()}
            />
        {/if}
    </span>
{/if}

