<script>
  import Button from '@sveltekit/ui/Button';
  import Dropdown from '@sveltekit/ui/Dropdown';

  export let items = [
    {
      title: 'Menu Item 1',
      id: 1
    },
    {
      title: 'Menu Item 2',
      id: 2
    }
  ];

  export let itemKey = 'title';
</script>

<Dropdown {items} {itemKey}>
  <Button>Click me</Button>
</Dropdown>
