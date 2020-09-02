<script>
  import Button from '@sveltekit/ui/Button';
  import Dropdown from '@sveltekit/ui/Dropdown';

  export let items = [
    {
      label: 'Menu Item 1',
      id: 1
    },
    {
      label: 'Menu Item 2',
      id: 2
    },
    {
      label: 'Menu Item 3',
      id: 3
    }
  ];

  export let selectedItem = items[0];
</script>

<Dropdown {items} bind:selectedItem>
  <Button>Click me</Button>
</Dropdown>

<p>selectedItem: {selectedItem.label}</p>
