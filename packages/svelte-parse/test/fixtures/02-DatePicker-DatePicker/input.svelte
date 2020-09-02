<script>
  import { beforeUpdate, createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import assignIn from 'lodash/assignIn';
  import flatpickr from 'flatpickr';
  import { classnames } from '../../helpers/classnames';

  import dayjs from 'dayjs';
  import customParseFormat from 'dayjs/plugin/customParseFormat';
  dayjs.extend(customParseFormat);

  import DateIcon from '../Icons/Date.svelte';
  import ChevronLeftIcon from '../Icons/ChevronLeft.svelte';
  import ChevronRightIcon from '../Icons/ChevronRight.svelte';

  const dispatch = createEventDispatcher();

  const defaults = {
    allowInput: true,
    altInput: true,
    locale: {
      weekdays: {
        shorthand: ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa']
      }
    }
  };

  export let hasIcon = true;
  export let canNavigate = false;
  export let isInline = false;
  export let date = null;
  export let minDate = undefined;
  export let maxDate = undefined;
  export let placeholder = 'Select a date';
  export let altFormat = 'F j, Y';
  export let dateFormat = 'd/m/Y';
  export let toDate = null;
  
  export let hasDropdown = true;
  export let isRange = false;
  export let position = 'auto';
  export let defaultToday = undefined;
  export let isDisabled = undefined;

  let hasFocus = false;
  let datePicker = undefined;
  let picker = undefined;
  let input = undefined;
  let toDateBackup = null;

  $: {
    if(!isRange) {
      toDate = null;
    }
  }

  $: {
    if(datePicker) {
      datePicker.set({
        mode: isRange ? 'range' : 'single'
      });
    }
  }

  $: {
    if(datePicker) {
      datePicker.setDate([date, toDate], true);
    }
  }

  let ClassNames;
  
  $: {
    ClassNames = classnames({
      'noIcon': !hasIcon,
      canNavigate,
      isInline,
      hasFocus
    })
  }

  let DisablePrev;
  $: {
    DisablePrev = date === minDate;
  }

  let DisableNext;
  $: {
    DisableNext = date === maxDate;
  }

  let NavigatePrevClassNames;
  $: {
    NavigatePrevClassNames = classnames({ disabled: DisablePrev });
  }

  let NavigateNextClassNames;
  $: {
    NavigateNextClassNames = classnames({ disabled: DisableNext });
  }

  function onDatePickerReady() {
    picker.querySelector('.form-control').addEventListener('focus', onInputFocus);
    picker.querySelector('.form-control').addEventListener('blur', onInputBlur);
  }

  function onInputFocus() {
    hasFocus = true;
  }

  function onInputBlur() {
    if (!isRange) datePicker.setDate(date);
    hasFocus = false;
  }

  function onDatePickerChange(selectedDates) {
    let _date = selectedDates[0] ? datePicker.formatDate(selectedDates[0], datePicker.config.dateFormat) : null;
    let _toDate = selectedDates[1] ? datePicker.formatDate(selectedDates[1], datePicker.config.dateFormat) : null;

    const isNotRangedAndDirty = !isRange && date !== _date;
    const isRangedAndDirty = isRange && (date !== _date || toDate !== _toDate);
    
    if (isNotRangedAndDirty || isRangedAndDirty) {
      date = _date;
      toDate = _toDate;
      
      dispatch('select', { date, toDate });
    }
  }

  function nextDay() {
    if (DisableNext) return;

    const next = dayjs(date, 'DD/MM/YYYY').add(1, 'day').format('DD/MM/YYYY');
    datePicker.setDate(next, true);
  }

  function prevDay() {
    if (DisablePrev) return;

    const prev = dayjs(date, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY');
    datePicker.setDate(prev, true);
  }

  function setInputDisabled(isDisabled) {
    if (isDisabled) {
      datePicker.altInput.setAttribute('disabled', '');
    } else {
      datePicker.altInput.removeAttribute('disabled');
    }
  }


  let prevIcon = undefined;
  let nextIcon = undefined;

  function createDatePicker() {
    const defaultDate = defaultToday || canNavigate ? dayjs().format('DD/MM/YYYY') : null;
    const fromDate = date || defaultDate;

    const prevArrow = document.createElement('div');
    prevIcon = new ChevronLeftIcon({ target: prevArrow });

    const nextArrow = document.createElement('div');
    nextIcon = new ChevronRightIcon({ target: nextArrow });

    if (input) {
      datePicker = flatpickr(input, assignIn({}, defaults, {
        altFormat,
        dateFormat,
        defaultDate: [fromDate, toDate],
        clickOpens: hasDropdown,
        inline: isInline,
        minDate,
        maxDate,
        position,
        mode: isRange ? 'range' : 'single',
        prevArrow: prevArrow.innerHTML,
        nextArrow: nextArrow.innerHTML,
        onChange: onDatePickerChange,
        onReady: onDatePickerReady,
        locale: {
          rangeSeparator: '  -  '
        }
      }));

      date = fromDate;
      toDate = toDate;
      setInputDisabled(isDisabled);
    }
  }

  onMount(async () => {
    await tick();
    createDatePicker();
  });

  let prev_isRange = isRange;
  let prev_isDisabled = isDisabled;
  let prev_date = date;
  let prev_toDate = toDate;
  let prev_minDate = minDate;
  let prev_maxDate = maxDate;

  let previous = false;

  beforeUpdate(() => {
    if (!previous) {
      previous = true;
    } else {      
      

      if (prev_isDisabled !== isDisabled) {
        setInputDisabled(isDisabled);
      }

      if (prev_minDate !== minDate) {
        const dates = datePicker.selectedDates;

        datePicker.set('minDate', minDate, true);

        if (dayjs(minDate, 'DD/MM/YYYY').isAfter(dayjs(dates[0]))) {
          dates[0] = dayjs(minDate, 'DD/MM/YYYY').toDate();
        }

        if (dates[1]) {
          if (dayjs(minDate, 'DD/MM/YYYY').isAfter(dayjs(dates[1]))) {
            dates[1] = dayjs(minDate, 'DD/MM/YYYY').toDate();
          }
        }

        datePicker.setDate(dates, true);
      }

      if (prev_maxDate !== maxDate) {
        const dates = datePicker.selectedDates;

        datePicker.set('maxDate', maxDate, true);

        if (dayjs(maxDate, 'DD/MM/YYYY').isBefore(dayjs(dates[0]))) {
          dates[0] = dayjs(maxDate, 'DD/MM/YYYY').toDate();
        }

        if (dates[1]) {
          if (dayjs(maxDate, 'DD/MM/YYYY').isBefore(dayjs(dates[1]))) {
            dates[1] = dayjs(maxDate, 'DD/MM/YYYY').toDate();
          }
        }

        datePicker.setDate(dates, true);
      }

      prev_isRange = isRange;
      prev_isDisabled = isDisabled;
      prev_date = date;
      prev_toDate = toDate;
      prev_minDate = minDate;
      prev_maxDate = maxDate;
    }
  });

  onDestroy(async () => {
    if (picker) {
      picker.querySelector('.form-control').removeEventListener('focus', onInputFocus);
      picker.querySelector('.form-control').removeEventListener('blur', onInputBlur);
    }

    if (datePicker) { 
      datePicker.destroy();
      prevIcon.$destroy();
      nextIcon.$destroy();
    }
  });
</script>

<style>
  .datePicker {
    position: relative;
  }

  .isInline input {
    display: none;
  }

  .isInline .icon {
    display: none;
  }

  .userInput {
    border: 1px solid var(--neutral_1);
    border-radius: 4px;
    background-color: var(--white);
    color: var(--neutral_7);
    display: block;
    font-size: 14px;
    line-height: 16px;
    padding: 13px 10px 13px 45px;
    width: 100%;
  }

  .noIcon .userInput {
    padding-left: 10px;
  }

  .userInput:hover {
    border: 1px solid var(--neutral_3);
  }

  .userInput:disabled {
    background-color: var(--neutral_0);
    border-color: var(--neutral_0);
    color: #b2b8bf;
  }

  .userInput:focus {
    border-color: var(--blue_5);
    outline: none;
  }

  .userInput::-webkit-input-placeholder {
    color: var(--neutral_3);
  }

  .userInput:-ms-input-placeholder {
    color: var(--neutral_3);
  }

  .userInput::-moz-placeholder {
    color: var(--neutral_3);
  }

  .userInput:-moz-placeholder {
    color: var(--neutral_3);
  }

  .canNavigate .userInput {
    padding-right: 50px;
  }

  .icon {
    color: var(--neutral_6);
    position: absolute;
    top: 12px;
    left: 14px;
    width: 20px;
    height: 20px;
  }

  .hasFocus .icon {
    color: var(--blue_5);
  }

  .navigation {
    position: absolute;
    top: 13px;
    right: 14px;
    width: 40px;
    user-select: none;
  }

  .navigation_prev {
    color: var(--neutral_6);
    position: absolute;
    width: 20px;
    top: 0;
    left: 0;
  }

  .navigation_next {
    color: var(--neutral_6);
    position: absolute;
    width: 20px;
    top: 0;
    right: 0;
  }

  .navigation_next.disabled,
  .navigation_prev.disabled {
    color: var(--neutral_1);
  }

  .navigation_next:not(.disabled):hover,
  .navigation_prev:not(.disabled):hover {
    color: var(--neutral_6);
    cursor: pointer;
  }
</style>

<div class="datePicker { ClassNames }">
  {#if hasIcon}
    <div class="icon">
      <DateIcon />
    </div>
  {/if}
  
  <div class="datePicker_input" bind:this={picker}>
    <input type="text" class="userInput" bind:this={input} {placeholder}>
  </div>
  
  {#if canNavigate}
    <div class="navigation">
      <div class="navigation_prev { NavigatePrevClassNames }" on:click="{prevDay}">
        <ChevronLeftIcon />
      </div>
      <div class="navigation_next { NavigateNextClassNames }" on:click="{nextDay}">
        <ChevronRightIcon />
      </div>
    </div>
  {/if}
</div>
    