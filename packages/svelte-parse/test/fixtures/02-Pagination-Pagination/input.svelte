<script>
  import { beforeUpdate, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  import { classnames } from '../../helpers/classnames';
  import getPages from '../../helpers/getPages';

  import Button from '../Button/Button.svelte';
  import buttonOptions from '../Button/options';
  import ChevronLeftIcon from '../Icons/ChevronLeft.svelte';
  import ChevronRightIcon from '../Icons/ChevronRight.svelte';

  export let canNavigate = true;
  export let current = 1;
  export let pageSize = 10;
  export let total = 0;
  export let showSummary = true;
  export let showPages = true;

  let prev_total = undefined;
  let prev_pageSize = undefined;

  beforeUpdate(() => {
    if ((prev_total !== undefined && total !== prev_total) || (prev_pageSize !== undefined && pageSize !== prev_pageSize)) {
      const newLastPage = Math.ceil(total / pageSize);
      if (current > newLastPage) {
        current = newLastPage;
      }
    }

    prev_total = total;
    prev_pageSize = pageSize;
  });

  let ClassNames;
  $: {
    ClassNames = classnames({
      canNavigate
    });
  }

  let From;
  $: {
    From = (current * pageSize) - pageSize + 1;
  }

  let To;
  $: {
    const to = current * pageSize;
    To = to <= total ? to : total;
  }

  let IsFirstPage;
  $: {
    IsFirstPage = current === 1;
  }

  let IsLastPage;
  $: {
    IsLastPage = current === Math.ceil(total / pageSize);
  }

  function onPrevClick() {
    current -= 1;

    dispatch('change', {
      current,
      pageSize
    });
  }

  function onNextClick() {
    current += 1;

    dispatch('change', {
      current,
      pageSize
    });
  }

  function onPageClick(pageNumber) {
    if(pageNumber !== current) {
      current = pageNumber;

      dispatch('change', {
        current,
        pageSize
      });
    }
  }
</script>


<style>
  .pagination {
    color: var(--neutral_4);
    font-size: 12px;
    font-weight: 600;
    line-height: 24px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    -webkit-touch-callout: none;
    user-select: none;
    text-align: right;

    --Button-font-size: 12px;	
    --Button-line-height:	16px;
    --Button-padding: 4px 6px;
  }

  .summary {
    margin-right: 10px;
  }

  .pages {
    display: flex;
    margin-right: 6px;
  }

  .page {
    margin: 0 2px;
    width: 24px;
  }

  .arrow {
    color: var(--neutral_4);
    display: inline-block;
    vertical-align: middle;

    --Button-padding: 0;
    --Button-icon-only-width: 24px;
    --Button-icon-only-height: 24px;

  }
</style>

<div class="pagination { ClassNames }">
  { #if showSummary }
  <div class="summary">
    { From } - { To } of { total }
  </div>
  { /if }

  { #if showPages }
  <div class="pages">
    {#each getPages(current, pageSize, total) as page}
        <div class="page">
          <Button
            isBlock
            isSelected="{current === page}"
            on:click="{() => onPageClick(page)}">
            { page }
          </Button>
        </div>
      {/each}
    </div>
  { /if }

  { #if canNavigate }
    <div class="navigationnavigation">
      <div class="arrow">
        <Button Icon="{ ChevronLeftIcon }"
          isDisabled="{ IsFirstPage }" on:click="{onPrevClick}">
        </Button>
      </div>
      <div class="arrow">
        <Button Icon="{ ChevronRightIcon }"
          isDisabled="{ IsLastPage }" on:click="{onNextClick}">
        </Button>
      </div>
    </div>
  {/if}
</div>
