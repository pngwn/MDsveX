<script>
  import Button from '@sveltekit/ui/Button';
  import ProgressBar from '@sveltekit/ui/ProgressBar';

  let isAnimated = true;
  let value = 30;
</script>

<ProgressBar {isAnimated} {value} />

<div class="row">
  <Button on:click={() => (value <= 100 ? (value += 20) : 100)}>
    Increase
  </Button>
  <Button on:click={() => (value >= 0 ? (value -= 20) : 0)}>Decrease</Button>
</div>
