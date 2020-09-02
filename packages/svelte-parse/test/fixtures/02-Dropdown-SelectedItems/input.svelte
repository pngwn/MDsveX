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

  export let selectedItem = [];
  let isMulti = true;
</script>

<Dropdown {items} {isMulti} bind:selectedItem>
  <Button>Click me</Button>
</Dropdown>

<p>selectedItem:</p>
<ul>
  {#each selectedItem as item}
    <li>{item.label}</li>
  {/each}
</ul>
