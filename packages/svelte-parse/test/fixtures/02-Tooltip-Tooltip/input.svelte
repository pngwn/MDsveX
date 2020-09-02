<script>
  import { onDestroy, onMount } from 'svelte';
  require('./tippy.ui.css');
  import tippy from 'tippy.js';
  import options from './options';

  let tooltip = undefined;
  export let title = '';
  export let elementDisplay = 'inline-block';
  export let placement = options.placement.TOP;
  export let followCursor = false;

  onMount(() => {
    const { firstElementChild } = tooltip;

    if (firstElementChild) {
      elementDisplay = getComputedStyle(firstElementChild, null).display;
    }

    tooltip = tippy(tooltip, {
      animation: 'shift-away',
      animateFill: false,
      delay: 200,
      distance: 8,
      dynamicTitle: true,
      followCursor,
      performance: true,
      placement,
      inertia: true,
      theme: 'ui'
    });
  });

  onDestroy(() => {
    if (!tooltip || !tooltip._tippy) return;
    tooltip._tippy.destroy();
  });
</script>

<div class="tooltip" bind:this={tooltip} title="{ title }" style="display:{elementDisplay};">
  <slot></slot>
</div>
