<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { classnames } from '../../helpers/classnames';

  const dispatch = createEventDispatcher();

  export let animate = true;
  export let isCentered = false;
  export let tabs = [];
  export let activeTab = {};
  export let itemWidth = 'auto';

  export let ActiveTabClassNames;
  $: {
    ActiveTabClassNames = classnames('activeTab', {
      animateActiveTab: animate
    });
  }

  export let ClassNames;
  $: {
    ClassNames = classnames({
      isCentered
    });
  }

  async function onTabClick(tab) {
    activeTab = tab;
    await tick();
    dispatch('change', tab);
  }

</script>


<style>
  .tabs {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
    width: 100%;
  }

  .isCentered {
    justify-content: center;
  }

  li {
    display: inline-block;
    margin: 0;
    padding: 0;
  }

  .tab {
    display: block;
    color: var(--neutral_5);
    cursor: pointer;
    padding: 7px 12px 10px;
    border-bottom: 2px solid transparent;
    transition: all linear .2s;
    font-weight: 500;
    text-align: center;
  }

  .tab:hover {
    color: var(--neutral_6);
  }

  li.active .tab {
    color: var(--neutral_7);
    border-bottom: 2px solid var(--blue_4);
  }

  a.tab {
    text-decoration: none;
  }

  .animateActiveTab {
    animation: 0.3s animateActiveTabEnter cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @keyframes animateActiveTabEnter {
    0% {
      opacity: 0;
      transform: translateY(-20px);
    }

    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>


<div class="tabs-container">
  <ul class="tabs { ClassNames }">
    {#each tabs as tab, i}
      <li class="{ (activeTab && activeTab.label === tab.label) ? 'active': ''}" style="width:{ itemWidth };">
        {#if tab.href}
          <a href="{tab.href}" class="tab">{tab.label}</a>
        {:else}
          <span on:click="{() => onTabClick(tab)}" class="tab">{tab.label}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#each tabs as tab}
    {#if tab === activeTab && tab.component}
      <div class={ ActiveTabClassNames }>
        <svelte:component this="{ tab.component }" { ...tab.attributes } />
      </div>
    {/if}
  {/each}
</div>
