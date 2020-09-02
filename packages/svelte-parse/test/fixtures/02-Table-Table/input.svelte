<script>
  import { beforeUpdate, createEventDispatcher, onMount } from 'svelte';
  import { classnames } from '../../helpers/classnames';
  import orderBy from 'lodash/orderBy';
  import Pagination from '../Pagination/Pagination.svelte';
  import Spinner from '../Spinner/Spinner.svelte';

  const dispatch = createEventDispatcher();

  let tableData = undefined;

  export let isLoading = false;
  export let hasBorder = false;
  export let isRowClickable = false;
  export let activeSort = undefined;
  export let activeSortDirection = undefined;
  export let currentPage = 1;
  export let pageSize = 10;
  export let isDynamic = false;
  export let columns = [];
  export let showHeader = true;
  export let noResultsMessage = 'No results available';
  export let hasPagination = false;
  export let itemTotal = 0;
  export let data = [];
  export let rowCssClass = () => {};

  let ClassNames;

  $: {
    ClassNames = classnames({
      hasBorder,
      isLoading,
      isRowClickable,
      noHeader: !showHeader
    });
  }

  $: {
    if(data) {
      tableData = data;
    }
  }

  $: {
    itemTotal = isDynamic ? itemTotal : data.length;
  }

  let Data;

  $: {
    if (!tableData) {
      Data = [];
    } else if (isDynamic) {
      Data = tableData;
    } else {
      let processedData = tableData;

      if (activeSort) {
        processedData = orderBy(tableData, activeSort, activeSortDirection);
      }

      const currentPageSize = pageSize || processedData.length;

      Data = processedData.slice((currentPage * currentPageSize) - currentPageSize, currentPage * currentPageSize);
    }
  }

  export function sort(selectedHeaderItem) {
    const currentActiveSort = activeSort;
    const currentDirection = activeSortDirection;
    const dataLookup = typeof selectedHeaderItem.cell === 'string' ? selectedHeaderItem.cell : '';
    const selectedSort = typeof selectedHeaderItem.sort === 'boolean' ? dataLookup : selectedHeaderItem.sort;

    let newActiveSort = null;
    let newSortDirection = null;

    if (currentActiveSort !== selectedSort) {
      newActiveSort = selectedSort;
      newSortDirection = 'asc';
    } else {

      if (!currentDirection) {
        newSortDirection = 'asc';
      } else if (currentDirection === 'asc') {
        newSortDirection = 'desc';
      } else {
        newSortDirection = null;
      }

      newActiveSort = newSortDirection ? currentActiveSort : null;
    }

    activeSort = newActiveSort, activeSortDirection = newSortDirection;

    onChange();
  }

  function onChange() {
    dispatch('change', {
      currentPage,
      pageSize,
      activeSort,
      activeSortDirection
    });
  }

  function onRowClick(rowItem) {
    dispatch('rowClick', rowItem);
  }

  function colWidth(col) {
    return col.width ? `width:${col.width};min-width:${col.width};` : '';
  }

  function cellAlign(cell) {
    return cell.align ? `text-align:${cell.align};` : '';
  }

  function sortClassNames(sort, lookup, activeSort, activeSortDirection) {
    const dataLookup = typeof lookup === 'string' ? lookup : '';
    const actualSort = typeof sort === 'boolean' ? dataLookup : sort;

    return classnames({
      'sort-asc': actualSort === activeSort && activeSortDirection === 'asc',
      'sort-desc': actualSort === activeSort && activeSortDirection === 'desc'
    });
  }


  let previous = false;
  let data_prev = undefined;

  onMount(() => {
    isRowClickable = !!arguments[0].$$.callbacks.rowClick;
  });
</script>

<style>
  .wrapper {
    position: relative;
  }

  .table.hasBorder {
    border: 1px solid #EBEDEF;
    border-radius: 4px;
  }

  .isLoading {
    min-height: 150px;
    opacity: 0.6;
  }

  .loader {
    cursor: wait;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .loader_spinner {
    color: var(--green_4, #51ce6c);
    width: 25px;
    height: 25px;
    position: absolute;
    top: 50%;
    left: 50%;
    margin: -25px 0 0 -25px;
  }

  .pagination {
    padding: 20px 0;
  }

  table {
    border: none;
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
  }

  table thead th {
    border-bottom: 1px solid var(--neutral_0);
    box-sizing: border-box;
    color: var(--neutral_6);
    font-size: 12px;
    font-weight: 600;
    padding: 15px 28px;
    text-align: left;
    white-space: nowrap;
  }

  .sort {
    display: inline-block;
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
    position: relative;
  }

  .sort::after,
  .sort::before {
    border-width: 3px;
    border-style: solid;
    display: block;
    height: 0;
    position: absolute;
    right: -11px;
    width: 0;
    content: " ";
  }

  .sort::before {
    border-color: transparent transparent rgba(0, 0, 0, 0.2);
    bottom: 8px;
  }

  .sort:hover::before {
    border-color: transparent transparent rgba(0, 0, 0, 0.3);
  }

  .sort.sort-asc::before {
    border-color: transparent transparent rgba(0, 0, 0, 0.6);
  }

  .sort::after {
    border-color: rgba(0, 0, 0, 0.2) transparent transparent;
    bottom: 0;
  }

  .sort:hover::after {
    border-color: rgba(0, 0, 0, 0.3) transparent transparent;
  }

  .sort.sort-desc::after {
    border-color: rgba(0, 0, 0, 0.6) transparent transparent;
  }

  .isRowClickable tbody tr:not(.noResultsMessage) {
    cursor: pointer;
    transition: all 0.15s;
  }

  .isRowClickable tbody tr:not(.noResultsMessage):hover {
    background-color: var(--blue_0);
  }

  table tbody td {
    color: var(--neutral_6);
    border-bottom: 1px solid var(--neutral_0);
    box-sizing: border-box;
    font-size: 13px;
    padding: 18px 28px;
    text-align: left;
    vertical-align: middle;
  }

  .hasBorder tr:last-of-type td {
    border-bottom: none;
  }

  .hasBorder thead tr:first-child th:first-child,
  .hasBorder.noHeader tbody tr:first-child td:first-child {
    border-top-left-radius: 4px;
  }

  .hasBorder thead tr:first-child th:last-child,
  .hasBorder.noHeader tbody tr:first-child td:last-child {
    border-top-right-radius: 4px;
  }

  .hasBorder tbody tr:last-child td:first-child {
    border-bottom-left-radius: 4px;
  }

  .hasBorder tbody tr:last-child td:last-child {
    border-bottom-right-radius: 4px;
  }
</style>


<div class="wrapper">
  <div class="table { ClassNames }">
    <table>

      <colgroup>
        { #each columns as col }
        <col style="{ colWidth(col) }" />
        { /each }
      </colgroup>

      { #if showHeader }
      <thead>
        <tr>
          { #each columns as headerItem }
          <th style="{ cellAlign(headerItem) }">
            { #if headerItem.sort }
            <span on:click="{() => sort(headerItem)}"
              class="sort { sortClassNames(headerItem.sort, headerItem.cell, activeSort, activeSortDirection) }">
              { #if headerItem.title.component }
              <svelte:component this={headerItem.title.component} {...headerItem.title.props} />
              { :else }
              { @html headerItem.title }
              { /if }
            </span>
            { :else }
            { #if headerItem.title.component }
            <svelte:component this={headerItem.title.component} {...headerItem.title.data} />
            { :else }
            { @html headerItem.title }
            { /if }
            { /if }
          </th>
          { /each }
        </tr>
      </thead>
      { /if }
      <tbody>
        { #if Data.length <= 0 && !isLoading } 
          <tr class="noResultsMessage">
            <td colspan="{ columns.length }">
              <slot name="noResults">{ noResultsMessage }</slot>
            </td>
          </tr>
          { /if }

          { #each Data as row }
          <tr class="{ rowCssClass ? rowCssClass(row) : '' }" on:click="{() => onRowClick(row)}">
            { #each columns as item }
            <td style="{ cellAlign(item) }">
              { #if typeof item.cell === 'function' }
              { @html item.cell(row) }
              { :else if item.cell.component }
              <svelte:component this={item.cell.component} {...item.cell.props} item="{row}" />
              { :else }
              { @html row[item.cell] }
              { /if }
            </td>
            { /each }
          </tr>
          { /each }
      </tbody>
    </table>
  </div>

  { #if hasPagination }
  { #if itemTotal > 0 && currentPage > 0 }
  <div class="pagination">
    <Pagination on:change="{onChange}" bind:pageSize="{pageSize}" bind:current="{currentPage}" total="{ itemTotal }">
    </Pagination>
  </div>
  { /if }
  { /if }
 
  { #if isLoading }
  <div class="loader">
    <div class="loader_spinner">
      <Spinner></Spinner>
    </div>
  </div>
  { /if }
</div>
