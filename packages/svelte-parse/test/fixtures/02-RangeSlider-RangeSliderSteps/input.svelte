<script>
  import RangeSlider from '@sveltekit/ui/RangeSlider';
  
  let values = [0,100]
</script>

<RangeSlider bind:values step="{10}"></RangeSlider>

<p>selected: {values[0]}</p>
