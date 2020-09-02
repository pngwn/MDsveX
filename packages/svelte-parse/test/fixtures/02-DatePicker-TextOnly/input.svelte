<script>
  import DatePicker from '@sveltekit/ui/DatePicker';

  let date = '01/11/2011';
  let altFormat = 'd/m/Y';
</script>

<div class="gridRow">
  <div class="gridCol-4">
    <DatePicker placeholder="Please click to select a date" bind:date {altFormat} hasDropdown="{false}"/>
    <p>Date: {date}</p>
  </div>
</div>
