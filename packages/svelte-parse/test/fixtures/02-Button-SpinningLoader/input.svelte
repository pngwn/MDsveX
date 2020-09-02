<script>
  import Button, { options } from '@sveltekit/ui/Button';

  let isWaiting = false;
</script>

<div class="row">
  <Button {isWaiting}>Button</Button>

  <Button
    isSelected={isWaiting}
    on:click={() => (isWaiting = true)}>
    Start waiting
  </Button>

  <Button
    isSelected={!isWaiting}
    on:click={() => (isWaiting = false)}>
    Stop waiting
  </Button>
</div>
