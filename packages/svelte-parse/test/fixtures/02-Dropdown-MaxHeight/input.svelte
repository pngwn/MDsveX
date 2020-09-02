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

  export let maxHeight = 100;
</script>

<Dropdown {items} {maxHeight}>
  <Button>Click me</Button>
</Dropdown>
