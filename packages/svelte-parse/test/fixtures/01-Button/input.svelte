<script>
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import { omit } from '../utils'

  /** HTML tag to use for button (either 'a' or 'button')
   * @svelte-prop {String} tag=button
   * @values <code>button</code>, <code>a</code>
   * */
  export let tag = 'button'

  /** Type (color of control)
   * @svelte-prop {String} [type] - Type (color of control)
   * @values $$colors$$
   * */
  export let type = ''

  /** Size of button
   * @svelte-prop {String} [size]
   * @values $$sizes$$
   * */
  export let size = ''

  /** Href to use when <code>tag</code> is 'a'
   * @svelte-prop {String} [href]
   * */
  export let href = ''

  /** Native button type
   * @svelte-prop {String} [nativeType]=button
   * @values Any native button type (button, submit, reset)
   * */
  export let nativeType = 'button'

  export let loading = false
  export let inverted = false
  export let outlined = false
  export let rounded = false

  export let iconLeft = null
  export let iconRight = null
  export let iconPack = null

  let iconSize = ''

  onMount(() => {
    if (!['button', 'a'].includes(tag)) throw new Error(`'${tag}' cannot be used as a tag for a Bulma button`)
  })

  $: props = {
    ...omit($$props, 'loading', 'inverted', 'nativeType', 'outlined', 'rounded', 'type'),
    class: `button ${type} ${size} ${$$props.class || ''}`,
  }

  $: {
    if (!size || size === 'is-medium') {
      iconSize = 'is-small'
    } else if (size === 'is-large') {
      iconSize = 'is-medium'
    } else {
      iconSize = size
    }
  }
</script>

{#if tag === 'button'}
  <button
    {...props}
    type={nativeType}
    class:is-inverted={inverted}
    class:is-loading={loading}
    class:is-outlined={outlined}
    class:is-rounded={rounded}
    on:click>
    {#if iconLeft}
      <Icon pack={iconPack} icon={iconLeft} size={iconSize} />
    {/if}
    <span>
      <slot />
    </span>
    {#if iconRight}
      <Icon pack={iconPack} icon={iconRight} size={iconSize} />
    {/if}
  </button>
{:else if tag === 'a'}
  <a
    {href}
    {...props}
    class:is-inverted={inverted}
    class:is-loading={loading}
    class:is-outlined={outlined}
    class:is-rounded={rounded}
    on:click>
    {#if iconLeft}
      <Icon pack={iconPack} icon={iconLeft} size={iconSize} />
    {/if}
    <span>
      <slot />
    </span>
    {#if iconRight}
      <Icon pack={iconPack} icon={iconRight} size={iconSize} />
    {/if}
  </a>
{/if}
