<script>
  import RangeSlider from '@sveltekit/ui/RangeSlider';
  
  let values = [0,100];
</script>

<RangeSlider bind:values></RangeSlider>

<p>selected: {JSON.stringify(values)}</p>
