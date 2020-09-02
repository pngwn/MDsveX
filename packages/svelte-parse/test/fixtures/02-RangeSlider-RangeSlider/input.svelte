<script>
  import { onDestroy, onMount } from 'svelte';
  import noUiSlider from 'nouislider';
  require('./nouislider.css');

  let slider = undefined;
  export let tooltip = false;
  export let min = 0;
  export let max = 100;
  export let margin = 0;
  export let values = [0];
  export let step = null;
  export let updateWhenSliding = false;

  onMount(() => {    
    slider = noUiSlider.create(slider, {
      start: values,
      step,
      margin,
      behaviour: 'drag-tap',
      connect: values.length === 1 ? [true, false] : [false, true, false],
      range: {
        min,
        max
      },
      tooltips: values.length === 1 ? [tooltip] : [tooltip, tooltip]
    });

    slider.on('set', (values) => {
      onSliderValueSet(values);
    });

    slider.on('slide', (values) => {
      if (updateWhenSliding) onSliderValueSet(values);
    });
  });

  function onSliderValueSet(_values) {
    values = _values;
  }

  onDestroy(() => {
    if (!slider) return;
    slider.off();
  });
</script>

<style></style>

<div class="rangeSlider" bind:this={slider}></div>
