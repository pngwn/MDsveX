<script>
  import Button from '@sveltekit/ui/Button';
  import Dropdown from '@sveltekit/ui/Dropdown';
  import CustomList from './_CustomList.svelte';

  function handleSelect(event) {
    // handle event
  }
</script>

<Dropdown MenuComponent="{CustomList}" on:select="{handleSelect}">
  <Button>
    Custom menu with components
  </Button>
</Dropdown>
