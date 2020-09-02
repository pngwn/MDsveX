<script>
  import dayjs from 'dayjs';
  import customParseFormat from 'dayjs/plugin/customParseFormat';
  import Card, { options as cardOptions } from '@sveltekit/ui/Card';
  import Tabs from '@sveltekit/ui/Tabs';
  import TimeOptions from './_TimeOptions.svelte';

  dayjs.extend(customParseFormat);

  export let selectedItem;
  export let isActive = false;

  function timeOptions(startTime, endTime) {
    const options = [];
    let current = parseTime(startTime);
    let last = parseTime(endTime);

    while(!current.isAfter(last)) {
      options.push(current.format('h:mma'));
      current = current.add(30, 'minutes');
    }

    return options;
  }

  function onClick(event) {
    if(event.target.nodeName !== 'BUTTON') {
      event.stopPropagation();
    }
  }

  const tabs = [
    {
      label: 'Morning',
      min: '12:00am',
      max: '11:30am'
    },
    {
      label: 'Day',
      min: '12:00pm',
      max: '6:30pm'
    },
    {
      label: 'Night',
      min: '7:00pm',
      max: '11:30pm'
    }
  ];

  let activeTab = getActiveTab();

  $: {
    if(!isActive) {
      activeTab = getActiveTab();
    }
  }

  function getActiveTab() {
    const selectedTime = parseTime(selectedItem);
    let activeTab = tabs[0];

    tabs.forEach((tab) => {
      const thisMin = parseTime(tab.min);
      const thisMax = parseTime(tabs.max); 

      if(selectedTime.isSame(thisMin) || selectedTime.isSame(thisMax) || (selectedTime.isAfter(thisMin) || selectedTime.isBefore(thisMax))) {
        activeTab = tab;
      }
    });

    return activeTab;
  }

  function parseTime(time) {
    return dayjs(time, 'h:mma');
  }
</script>

<style>
  .card {
    padding: 10px 0;
  }
</style>

<div on:click="{ onClick }">
  <Card level="{ cardOptions.level.TWO }">
    <div class="card">
      <Tabs { tabs } bind:activeTab animate="{ false }" itemWidth="calc(100%/3)" />

      { #each tabs as tab }
        { #if tab === activeTab }
        <TimeOptions options="{ timeOptions(tab.min, tab.max) }" { selectedItem } on:select></TimeOptions>
        { /if }
      { /each }
    </div>
  </Card>
</div>
