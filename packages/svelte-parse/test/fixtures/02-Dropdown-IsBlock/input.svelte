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

  export let isBlock = true;
</script>

<style>
  .blockToggle {
    background: blue;
    color: #fff;
    padding: 15px;
  }

  @media (max-width: 640px) {
    .blockToggle {
      display: none;
    }
  }
</style>

<Dropdown { items } { isBlock }>
  <div class="blockToggle">BLOCK TOGGLE (I get removed at 640px)</div>
</Dropdown>
