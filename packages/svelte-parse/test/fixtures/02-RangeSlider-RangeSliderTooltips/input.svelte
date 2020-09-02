<script>
  import wNumb from 'wnumb';
  import RangeSlider from '@sveltekit/ui/RangeSlider';
  
  let values = [0,100];
  let tooltip = wNumb({ decimals: 1 });
</script>

<RangeSlider bind:values {tooltip}></RangeSlider>

<p>selected: {JSON.stringify(values)}</p>
