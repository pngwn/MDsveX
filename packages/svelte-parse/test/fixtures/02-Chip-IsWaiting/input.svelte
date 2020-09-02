<script>
  import Chip from '@sveltekit/ui/Chip';

  let isWaiting = false;
  let isDisabled = false;

  function handleRemove(event) {
    isWaiting = true;
    isDisabled = true;

    setTimeout(() => {
      isWaiting = false;
      isDisabled = false;
    }, 3000)
  }
</script>

<div class="row">
  <span>
    <Chip isRemovable isActive on:remove="{handleRemove}" {isWaiting} {isDisabled}>Removable Chip</Chip>
  </span>
</div>
