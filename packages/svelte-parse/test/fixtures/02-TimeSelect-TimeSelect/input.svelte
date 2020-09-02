<script>
  import { createEventDispatcher } from 'svelte';
  import dayjs from 'dayjs';
  import Select from 'svelte-select/Select';

  import ClockIcon from '../Icons/Clock.svelte';

  const dispatch = createEventDispatcher();

  export let selected = undefined;
  export let format = 'h:mma';
  export let increment = 30;
  export let containerStyles = 'padding-left:43px;';
  export let inputStyles = 'padding-left:43px;';
  export let isClearable = true;
  export let isDisabled = false;
  export let placeholder = 'Select a time';
  export let getOptionLabel = (option) => {
    return option.value;
  };
  export let getSelectionLabel = (option) => {
    return option.value;
  };

  let selectedValue = undefined;

  $: {
    selectedValue = selected ? { value: selected } : undefined;
  }

  export let items;

  $: {
    const options = [];
    let day = dayjs().set('minute', 0).set('hour', 0);
    const dayEnd = day.add(1, 'day');

    while (day.isBefore(dayEnd, 'day')) {
      options.push({
        value: day.format(format),
        label: day.format(format)
      });

      day = day.add(increment, 'minute');
    }

    items = options;
  }

  function onClear() {
    selected = undefined;

    dispatch('clear');
  }

  function onSelect(event) {
    selected = event.detail.value;
    dispatch('select', selected);
  }
</script>

<style>
  .timeSelect {
    color: #2c3e50;
    position: relative;
  }

  .icon {
    height: 20px;
    width: 20px;
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1;
  }
</style>


<div class="timeSelect">
  <div class="icon">
    <ClockIcon />
  </div>

  <Select 
    on:select="{onSelect}" 
    on:clear="{onClear}" 
    isSearchable="{ false }"
    { selectedValue } 
    { containerStyles } 
    { inputStyles } 
    { isClearable } 
    { isDisabled } 
    { placeholder } 
    { items } 
    { getOptionLabel } 
    { getSelectionLabel }
  >
  </Select>
</div>
