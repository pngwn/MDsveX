<script>
  import { beforeUpdate, createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import getPosition from '../../helpers/getPosition';
  import DropdownMenu from './_DropdownMenu.svelte';

  import generateUniqueId from '../../helpers/generateUniqueId';

  const dispatch = createEventDispatcher();

  export let items = [];
  export let itemKey = 'label';
  export let isBlock = false;
  export let MenuComponent = DropdownMenu;
  export let width = '150px';
  export let getMenuContainer = () => {
    return document.body;
  };
  export let isActive = false;
  export let isHoverable = false;
  export let placement = 'bottomLeft';
  export let selectedItem = null;
  export let isSearchable = false;
  export let isMulti = false;
  export let maxHeight = null;

  let id = `dropdown-${generateUniqueId()}`;
  let searchClear = false;
  let dropdownMenu = undefined;
  let elem = undefined;
  let menuOffset = undefined;
  let toggle = null;

  $: {
    if (dropdownMenu) dropdownMenu.$set({ isActive, width, items, selectedItem, itemKey });
  }

  function showMenu() {
    isActive = true;
    elem.style.display = '';
    positionMenu();
  }

  function hideMenu() {
    isActive = false;
    elem.style.display = 'none';
    dropdownMenu.$set({ searchText: '' });
  }

  function clickEd() {
    if (elem.style.display === 'none') {
      showMenu();
    } else {
      hideMenu();
    }
  }

  function onMouseEnter() {
    if (elem.style.display === 'none') {
      showMenu();
    }
  }

  function onMouseLeave(event) {
    if (toggle.contains(event.relatedTarget)) return;
    if (elem.contains(event.relatedTarget)) return;

    if (isHoverable) {
      hideMenu();
    }
  }

  function onWindowClick(event) {
    if (toggle.contains(event.target)) return;

    if (isMulti) {
      if (dropdownMenu.dropdownMenu.contains(event.target)) return;
    }
    if (isSearchable) {
      if (searchClear) {
        searchClear = false;
        return;
      }
      if (dropdownMenu.search.contains(event.target)) return;
    }

    if(isActive) {
      hideMenu();
    }
  }

  function onResize() {
    if (elem.style.display !== 'none') {
      positionMenu();
    }

    if (!isVisible(toggle.firstElementChild)) {
      hideMenu();
    }
  }

  function onScroll() {
    if (elem.style.display !== 'none') {
      positionMenu();
    }
  }

  function onMenuSelect(event) {
    const item = event.detail;

    const selected = isMulti ? item.selected : item;
    dispatch('select', selected);

    if (isMulti) {
      const newSelectedItems = (selectedItem || []).concat([selected]);
      selectedItem = newSelectedItems;
    } else {
      selectedItem = selected;
    }
  }

  function onMenuClearSelect(event) {
    const item = event.detail;

    const { selected, itemKey } = item;
    if (isMulti) {
      const newSelectedItems = selectedItem.filter(item => {
        return item[itemKey] !== selected[itemKey];
      });
      selectedItem = newSelectedItems;
      dispatch('clearSelect', selected);
    }
  };

  function positionMenu() {
    if (!getMenuContainer) return;

    const togglePos = getPosition(toggle, getMenuContainer());

    elem.style.padding = /^top/.test(placement) ? `0 0 ${menuOffset}px 0` : `${menuOffset}px 0 0 0`;

    const pos = getPlacement(togglePos);
    elem.style.top = `${pos.top}px`;
    elem.style.left = `${pos.left}px`;
  }

  function isVisible(elem) {
    if (!elem) return;
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  }

  export function getPlacement(srcPos) {

    const pos = {
      top: 0,
      left: 0
    };

    if (!toggle) {
      return pos;
    }

    if (/^top/.test(placement)) {
      pos.top = srcPos.top - elem.offsetHeight;
    } else {
      pos.top = srcPos.top + toggle.offsetHeight;
    }

    if (/Centre$/.test(placement)) {
      pos.left = (srcPos.left + (toggle.offsetWidth / 2)) - (elem.offsetWidth / 2);
    } else if (/Right$/.test(placement)) {
      pos.left = srcPos.left + toggle.offsetWidth - elem.offsetWidth;
    } else {
      pos.left = srcPos.left;
    }

    return pos;
  }

  onMount(async () => {
    await tick();
    if (!getMenuContainer || !MenuComponent) return;

    document.addEventListener('scroll', onScroll, true);

    if (isHoverable) {
      toggle.addEventListener('mouseenter', onMouseEnter);
      toggle.addEventListener('mouseleave', onMouseLeave);
    }

    elem = document.createElement('div');

    elem.id = id;
    elem.style.display = 'none';
    elem.style.position = 'absolute';
    elem.style.zIndex = '2';

    menuOffset = 8;

    dropdownMenu = new MenuComponent({
      target: elem,
      props: { width, items, selectedItem, itemKey, isMulti, isSearchable, maxHeight }
    });

    dropdownMenu.$on('select', onMenuSelect);
    dropdownMenu.$on('clearSelect', onMenuClearSelect);
    dropdownMenu.$on('searchClear', () => { searchClear = true });
    elem.addEventListener('mouseleave', onMouseLeave);

    getMenuContainer().appendChild(elem);
  });

  onDestroy(() => {
    if (elem) {
      elem.removeEventListener('scroll', onScroll, true);
      elem.removeEventListener('mouseleave', onMouseLeave);

      const menuContainer = getMenuContainer();

      if (menuContainer && menuContainer.contains(elem)) {
        menuContainer.removeChild(elem);
      }
    }

    if (dropdownMenu) dropdownMenu.$destroy();
  });
</script>

<style>
  .toggle {
    display: inline-block;
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .toggle-isBlock {
    display: block;
  }
</style>

<svelte:window on:resize="{onResize}" on:click="{onWindowClick}" />

<div
  bind:this={toggle}
  class="toggle { isBlock ? 'toggle-isBlock' : '' }"
  on:click="{ clickEd }"
  aria-controls="{id}"
>
  <slot></slot>
</div>
