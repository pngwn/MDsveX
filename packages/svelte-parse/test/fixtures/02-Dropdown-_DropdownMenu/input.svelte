<script>
  import inlinestyles from '../../helpers/inlineStyles';
  import { createEventDispatcher } from 'svelte';

  import Card from '../Card/Card.svelte';
  import cardOptions from '../Card/options';

  import Checkbox from '../Checkbox/Checkbox.svelte';
  import Search from '../Search/Search.svelte';

  import DropdownMenuDivider from './_DropdownMenuDivider.svelte';
  import DropdownMenuItem from './_DropdownMenuItem.svelte';

  import arrayHasItem from '../../helpers/arrayHasItem';


  const dispatch = createEventDispatcher();

  export let dropdownMenu = null;
  export let width = null;
  export let search =  null;
  export let items = [];
  export let selectedItem = null;
  export let itemKey = 'label';
  export let isMulti = false;
  export let maxHeight = null;
  export let searchText = '';
  export let isSearchable = null;

  function onClick(selected) {
    if (isMulti && arrayHasItem(selectedItem, selected)) {
      dispatch('clearSelect', { selected, itemKey });
    } else {
      const data = isMulti ? { selected, itemKey } : selected;
      dispatch('select', data);
    }
  }

  let FilteredItems;
  $: {
    if (!items) FilteredItems = [];
    else if (!isSearchable || !searchText) FilteredItems = items;
    else {
      const reg = new RegExp(searchText, "i");
      FilteredItems = items.filter(item => { return reg.test(item[itemKey]); });
    }
  }

  let Styles;
  $: {
    Styles = inlinestyles(
      {
        'max-height': maxHeight ? `${maxHeight}px` : '',
        'overflow-y': maxHeight ? 'auto' : ''
      }
    );
  }

  function matchSearchResult(itemLabel, searchText) {
    if (searchText && searchText.length === 0) return itemLabel;

    const reg = new RegExp(searchText, "i");
    return itemLabel.replace(reg, '<strong>$&</strong>');
  };


</script>

<style>
  .dropdownMenu {
    overflow: hidden;
  }
  .checkbox {
    margin-right: 12px;
  }
</style>

<div bind:this={dropdownMenu} class="dropdownMenu" style="width:{width};">
  <Card level="{cardOptions.level.TWO}">
    {#if isSearchable}
      <div bind:this={search} class="search">
        <Search bind:value="{searchText}" on:clear="{ () => dispatch('searchClear') }"/>
      </div>
    {/if}

    <slot>
        <div style="{Styles}">
          {#if isSearchable}
          <DropdownMenuDivider noMargin />
          {/if}
          {#each FilteredItems as item}
            <DropdownMenuItem
              {isMulti}
              isSelected="{ isMulti ? arrayHasItem(selectedItem, item) : item === selectedItem }"
              on:click="{ () => onClick(item) }"
            >
              {#if isMulti}
              <div class="checkbox">
                <Checkbox isChecked="{arrayHasItem(selectedItem, item)}" />
              </div>
              <div>{ @html matchSearchResult(item[itemKey], searchText) }</div>
              {:else}
              {item[itemKey]}
              {/if}
              
            </DropdownMenuItem>
          {:else}
            <DropdownMenuItem>No results</DropdownMenuItem>
        {/each}
      </div>
    </slot>
  </Card>
</div>
