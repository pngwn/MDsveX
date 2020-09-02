<script>
  import { classnames } from '../../helpers/classnames';
  import inlinestyles from '../../helpers/inlineStyles';
  import options from './options';

  export let isAnimated = false;
  export let size = options.size.SMALL;
  export let value = 0;
  export let maxValue = 100;
  export let target = 0;
  export let positiveColour = '#51ce6c';
  export let negativeColour = '#ff5373';
  export let indicators = [];

  export let BarClassNames;
  $: {
    BarClassNames = classnames({
      isAnimated
    });
  }

  export let ClassNames;
  $: {
    ClassNames = classnames(`size-${size}`);
  }

  export let PercentComplete;
  $: {
    PercentComplete = (value / maxValue) * 100;
  }

  export let Styles;
  $: {
    Styles = inlinestyles(
      {
        'width': `${PercentComplete}%`,
        'background': value >= target ? positiveColour : negativeColour
      }
    );
  }

  const indicatorPercent = (value, maxValue) => {
    return (value / maxValue) * 100;
  };
</script>


<style>
  .progressBar {
    background-color: var(--neutral_0);
    border-radius: 5px;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .size-xsmall {
    height: 2px;
  }

  .size-small {
    height: 4px;
  }

  .size-medium {
    height: 6px;
  }

  .size-large {
    height: 10px;
  }

  .bar {
    border-radius: 5px;
    opacity: 0.95;
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 0;
  }

  .isAnimated {
    transition: all 1s ease;
  }

  .indicator {
    background: var(--white);
    border-radius: 5px;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    z-index: 1;
  }
</style>

<div class="progressBar { ClassNames }">
  <div class="bar { BarClassNames }" style="{ Styles }"></div>

  {#each indicators as indicator}
    <span class="indicator" style="left:{ indicatorPercent(indicator,maxValue) }%"></span>
  {/each}
</div>
