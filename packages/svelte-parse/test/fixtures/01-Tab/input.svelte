<script>
  import { beforeUpdate, setContext, getContext, tick, onMount } from 'svelte'
  import Icon from '../Icon.svelte'

  /** Label for tab
   * @svelte-prop {String} label
   * */
  export let label

  /** Show this icon on left-side of the tab
   * @svelte-prop {String} [icon]
   * */
  export let icon = ''

  /** Fontawesome icon pack to use. By default the <code>Icon</code> component uses <code>fas</code>
   * @svelte-prop {String} [iconPack]
   * @values <code>fas</code>, <code>fab</code>, etc...
   * */
  export let iconPack = ''

  let active = false

  let el
  let index
  let starting = false
  let direction = ''
  let isIn = false

  const tabConfig = getContext('tabs')

  export async function changeTab({ from, to }) {
    if (from === to) return

    // console.log({ index, from, to }, to === index)
    if (from === index) {
      // Transition out
      direction = index < to ? 'left' : 'right'
    } else if (to === index) {
      // Transition in; start at direction when rendered, then remove it
      // console.log('TRANSITION', { index, to, active })
      active = true
      direction = index > from ? 'right' : 'left'
      // await tick()
      // direction = ''
    } else direction = ''
  }

  function updateIndex() {
    if (!el) return
    index = Array.prototype.indexOf.call(el.parentNode.children, el)
  }

  async function transitionend(event) {
    // console.log({ index, active, activeTab: tabConfig.activeTab })
    // console.log(event.target)
    active = index === tabConfig.activeTab
    await tick()
    direction = ''
  }

  tabConfig.tabs.subscribe(tabs => {
    updateIndex()
  })

  onMount(() => {
    updateIndex()

    tabConfig.tabs.update(tabs => [
      ...tabs,
      {
        index,
        label,
        icon,
        iconPack,
        activate: () => (active = true),
        deactivate: () => (active = false),
        changeTab,
      },
    ])
  })

  beforeUpdate(async () => {
    if (index === tabConfig.activeTab && direction) {
      await tick()
      setTimeout(() => {
        direction = ''
      })
    }
  })
</script>

<style lang="scss">
  // NOTE: add transitions/animations back once they're working
  .tab {
    display: none;
    flex: 1 0 100%;
    // will-change: transform;
    // transition: transform 400ms ease-in;

    &.is-active {
      display: inline-block;
      // transform: translateX(0);
    }

    // &.starting {
    //   transition: none;
    // }

    // &.left {
    //   transform: translateX(-100%);
    // }

    // &.right {
    //   transform: translateX(100%);
    // }

    // &.starting {
    //   transition: none;
    // }
  }
</style>

<div
  class="tab {direction}"
  class:is-active={active}
  bind:this={el}
  aria-hidden={!active}
  on:transitionend={transitionend}>
  <slot {label} {iconPack} {icon} />
</div>
