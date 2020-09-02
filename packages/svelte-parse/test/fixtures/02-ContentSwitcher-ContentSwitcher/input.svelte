<script>
  import { onMount } from 'svelte';
  import { classnames } from '../../helpers/classnames';

  export let items = [];
  export let activeItem = null;
  export let isActive = null;
  export let size = 'default';

  function onItemClick(clickedItem) {
    if (isActive !== clickedItem) {
      activeItem = clickedItem;
    }
  }

  function itemClassNames(item, activeItem, size) {
    return classnames(
      `size-${size}`, 
      {
        active: JSON.stringify(item) === JSON.stringify(activeItem)
      }
    );
  }

  onMount(() => {
    if (!activeItem) {
      activeItem = items[0];
    }
  });
</script>


<style>
  .contentSwitcher {
    --ContentSwitcher_primary: var(--primary_1);
    
    border: 1px solid var(--ContentSwitcher_primary, var(--primary_1));
    border-radius: 3px;
    display: flex;
  }

  .contentSwitcher_item {
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    cursor: pointer;
    flex-shrink: 1;
    flex-grow: 1;
    color: var(--ContentSwitcher_primary, var(--primary_1));
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
    text-align: center;
    width: 100%;
    padding: 0 14px;
    white-space: nowrap;
  }

  .contentSwitcher_item.size-compact {
    font-size: 13px;
    line-height: 16px;
    padding: 1px 16px;
  }

  .contentSwitcher_item:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .contentSwitcher_item.active {
    background: var(--ContentSwitcher_primary, var(--primary_1));
    color: #fff;
  }

  .contentSwitcher_item_icon {
    width: 24px;
    height: 32px;
    padding: 4px 0;
  }

  .contentSwitcher_item_label {
    padding: 6px 0;
  }

  .contentSwitcher_item_icon+.contentSwitcher_item_label {
    margin-left: 5px;
  }
</style>


<div class="contentSwitcher">
  {#each items as item, i}
      <div class="contentSwitcher_item { itemClassNames(item, activeItem, size) }" on:click="{() => onItemClick(item)}">
        {#if item.Icon}
          <div class="contentSwitcher_item_icon">
            <svelte:component
              this="{ item.Icon }"
            >
            </svelte:component>
          </div>
        {/if}
        {#if item.label}
          <div class="contentSwitcher_item_label">
            { item.label }
          </div>
        {/if}
      </div>
  {/each}
</div>
