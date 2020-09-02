<script>
  import Button from '@sveltekit/ui/Button';
  import Dropdown from '@sveltekit/ui/Dropdown';
  import CustomDropdown from './_CustomDropdown.svelte';

  function handleSelect(event) {
    // handle event
  }
</script>

<Dropdown MenuComponent="{CustomDropdown}" on:select="{handleSelect}">
  <Button>
    Fully custom menu
  </Button>
</Dropdown>
