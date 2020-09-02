<script>
  import Button from '@sveltekit/ui/Button';
  import Dropdown from '@sveltekit/ui/Dropdown';

  export let items = [{
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
  }];

  let isHoverable = true;
</script>

<Dropdown { items } { isHoverable }>
  <Button>Hover me</Button>
</Dropdown>
