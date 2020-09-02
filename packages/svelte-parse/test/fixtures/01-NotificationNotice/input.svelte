<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import Notice, { filterProps } from '../Notice.svelte'
  import Notification from './Notification.svelte'

  export let message
  export let duration = 2000
  export let position = 'is-top-right'

  $: props = { ...filterProps($$props), duration, position }
  $: notificationProps = { ...removeNonNoficationProps($$props) }

  function removeNonNoficationProps(props) {
    const newProps = {}

    const blacklist = ['duration', 'message', 'position']

    Object.keys(props).forEach(key => {
      if (!blacklist.includes(key)) newProps[key] = props[key]
    })

    return newProps
  }
</script>

<style>
:global(.notification) {
  margin: 0.5em 0;
}
</style>

<Notice {...props} transitionOut={true}>
  <Notification {...notificationProps}>
    {@html message}
  </Notification>
</Notice>
