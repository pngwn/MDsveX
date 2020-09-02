<script>
  import randomColor from 'randomcolor';
  import tinycolor from 'tinycolor2';
  import inlinestyles from '../../helpers/inlineStyles';
  import options from './options';

  const MAX_LENGTH = 4;
  const DEFAULT_BG_COLOR = '#d5d8dc';

  export let alt = '';
  export let bgColour = undefined;
  export let size = options.size.SMALL;
  export let textColour = undefined;
  export let src = null;
  export let Component = undefined;
  export let componentProps = {};

  $: AltText = alt.substring(0, MAX_LENGTH);

  let BgColor;
  $: {
    if (bgColour) {
      BgColor = bgColour;
    } else {
      BgColor =
        AltText.length < 2
          ? DEFAULT_BG_COLOR
          : randomColor({ seed: AltText, luminosity: 'light' });
    }
  }

  $: TextColor =
    textColour ||
    tinycolor(BgColor)
      .saturate(50)
      .darken(40)
      .setAlpha(0.8)
      .toString();

  let Width;
  $: {
    const sizeOptions = {
      [options.size.X_SMALL]: 24,
      [options.size.SMALL]: 30,
      [options.size.MEDIUM]: 64,
      [options.size.LARGE]: 88
    };

    Width = sizeOptions[size] || (size || sizeOptions[options.size.SMALL]);
  }

  let FontSize;
  $: {
    const scale = 1.3;
    const minAltLengthForSizing = 2;
    let altLength = AltText.length;

    if (altLength < minAltLengthForSizing) {
      altLength = minAltLengthForSizing;
    }

    FontSize = Width / altLength / scale;
  }

  let Styles;
  $: {
    Styles = inlinestyles(
      {
        'background-color': BgColor,
        color: TextColor,
        'font-size': `${FontSize}px`,
        width: `${Width}px`,
        height: `${Width}px`
      },
      src && {
        'background-image': `url('${src}')`
      }
    );
  }
</script>

<style>
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background-position: 50% 50%;
    background-size: var(--Avatar-background-size, cover);
    border-radius: var(--Avatar-border-radius, 50%);
    font-weight: var(--Avatar-font-weight, 700);
  }

  .alt {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    text-align: center;
  }

  .component {
    width: var(--Avatar-component-width, 70%);
    height: var(--Avatar-component-height, 70%);
  }
</style>

<div class="avatar" style={Styles}>
  {#if !src && !Component}
    <span class="alt">{AltText}</span>
  {:else if Component}
    <div class="component">
      <svelte:component this={Component} {...componentProps} />
    </div>
  {/if}
</div>
