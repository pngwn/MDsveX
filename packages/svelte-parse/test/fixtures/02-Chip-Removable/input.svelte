<script>
  import Chip from '@sveltekit/ui/Chip';

  function handleRemove(event) {
    console.log('event :', event);
  }
</script>

<div class="row">
  <span>
    <Chip isRemovable isActive on:remove="{handleRemove}">Removable Chip</Chip>
  </span>
  <span>
    <Chip isRemovable isActive isDisabled>Removable Chip</Chip>
  </span>
</div>
