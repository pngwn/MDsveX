<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  import DropdownMenu from '../_DropdownMenu.svelte';
  import DropdownMenuItem from '../_DropdownMenuItem.svelte';
  import DropdownMenuDivider from '../_DropdownMenuDivider.svelte';

  function onClick(selected) {
    this.fire('select', selected);
  }
</script>

<style>
  .free {
    background: #007AFF;
    color: #fff;
    padding: 20px;
  }
</style>

<DropdownMenu>
  <DropdownMenuItem on:click="{ () => onClick(1) }">Here we go</DropdownMenuItem>
  <DropdownMenuItem on:click="{ () => onClick(2) }">Here we go</DropdownMenuItem>
  <DropdownMenuDivider />
  <DropdownMenuItem>Im not clickable</DropdownMenuItem>
  <DropdownMenuDivider />
  <DropdownMenuItem on:click="{ () => onClick(4) }">Here we go</DropdownMenuItem>
  <DropdownMenuItem on:click="{ () => onClick(5) }">Here we go</DropdownMenuItem>
  <div class="free" on:click="{ () => onClick('freeballing') }">
    Im totally freeballing
  </div>
</DropdownMenu>
