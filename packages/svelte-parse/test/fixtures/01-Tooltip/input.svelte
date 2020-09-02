<script>
  /** Type (color) of the tooltip 
   * @svelte-prop {String} [type=is-primary]
   * @values <code>is-white</code>, <code>is-black</code>, <code>is-light</code>, <code>is-dark</code>, <code>is-primary</code>, <code>is-info</code>, <code>is-success</code>, <code>is-warning</code>, <code>is-danger</code>, and any other colors you've set in the <code>$colors</code> list on Sass
   * */
  export let type = 'is-primary'

  /** Whether tooltip is active or not  
   * @svelte-prop {Boolean} [active=true]
   * */
  export let active = true
  
  /** Tooltip text  
   * @svelte-prop {String} label
   * */
  export let label = ''
  
  /** Tooltip position in relation to the element 
   * @svelte-prop {String} [position=is-top]
   * @values <code>is-top</code>, <code>is-bottom</code>, <code>is-top-left</code>, <code>is-top-right</code>, <code>is-bottom-left</code>, <code>is-bottom-right</code>
   * */
  export let position = 'is-top'

  /** Tooltip will be always active 
   * @svelte-prop {Boolean} [always=false]
   * */
  export let always = false

  /** Tooltip will have a little fade animation 
   * @svelte-prop {Boolean} [animated=false]
   * */
  export let animated = false

  /** Tooltip will be square (not rounded corners)  
   * @svelte-prop {Boolean} [square=false]
   * */
  export let square = false

  /** Tooltip slot will have a dashed underline 
   * @svelte-prop {Boolean} [dashed=false]
   * */
  export let dashed = false

  /** Tooltip will be multilined  
   * @svelte-prop {Boolean} [multilined=false]
   * */
  export let multilined = false

  /** Tooltip multiline size (only works for multilined tooltips) 
   * @svelte-prop {Boolean} [size=is-medium]
   * @values <code>is-small</code>, <code>is-medium</code>, <code>is-large</code>
   * */
  export let size = 'is-medium'

</script>

<style lang="scss">
  @import 'node_modules/bulma/sass/utilities/all';

  $tooltip-arrow-size: 5px;
  $tooltip-arrow-margin: 2px;

  $tooltip-multiline-sizes: (
      small: 180px,
      medium: 240px,
      large: 300px
  );

  @mixin tooltip-arrow($direction, $color) {
      @if ($direction == "is-top") {
          border-top: $tooltip-arrow-size solid $color;
          border-right: $tooltip-arrow-size solid transparent;
          border-left: $tooltip-arrow-size solid transparent;
          bottom: calc(100% + #{$tooltip-arrow-margin});
      } @else if ($direction == "is-bottom") {
          border-right: $tooltip-arrow-size solid transparent;
          border-bottom: $tooltip-arrow-size solid $color;
          border-left: $tooltip-arrow-size solid transparent;
          top: calc(100% + #{$tooltip-arrow-margin});
      } @else if ($direction == "is-right") {
          border-top: $tooltip-arrow-size solid transparent;
          border-right: $tooltip-arrow-size solid $color;
          border-bottom: $tooltip-arrow-size solid transparent;
          left: calc(100% + #{$tooltip-arrow-margin});
      } @else if ($direction == "is-left") {
          border-top: $tooltip-arrow-size solid transparent;
          border-bottom: $tooltip-arrow-size solid transparent;
          border-left: $tooltip-arrow-size solid $color;
          right: calc(100% + #{$tooltip-arrow-margin});
      }
  }

  @mixin tooltip($direction) {
      &.#{$direction} {
          &:before,
          &:after {
              @if ($direction == "is-top") {
                  top: auto;
                  right: auto;
                  bottom: calc(100% + #{$tooltip-arrow-size} + #{$tooltip-arrow-margin});
                  left: 50%;
                  transform: translateX(-50%);
              } @else if ($direction == "is-bottom") {
                  top: calc(100% + #{$tooltip-arrow-size} + #{$tooltip-arrow-margin});
                  right: auto;
                  bottom: auto;
                  left: 50%;
                  transform: translateX(-50%);
              } @else if ($direction == "is-right") {
                  top: 50%;
                  right: auto;
                  bottom: auto;
                  left: calc(100% + #{$tooltip-arrow-size} + #{$tooltip-arrow-margin});
                  transform: translateY(-50%);
              } @else if ($direction == "is-left") {
                  top: 50%;
                  right: calc(100% + #{$tooltip-arrow-size} + #{$tooltip-arrow-margin});
                  bottom: auto;
                  left: auto;
                  transform: translateY(-50%);
              }
          }
          @each $name, $pair in $colors {
              $color: nth($pair, 1);
              &.is-#{$name}:before {
                  @include tooltip-arrow($direction, $color)
              }
          }
          &.is-multiline {
              @each $name, $size in $tooltip-multiline-sizes {
                  &.is-#{$name}:after {
                      width: $size;
                  }
              }
          }
      }
  }

  // Base
  .tooltip {
      @include tooltip("is-top");
      @include tooltip("is-right");
      @include tooltip("is-bottom");
      @include tooltip("is-left");
      position: relative;
      display: inline-flex;
      &:before,
      &:after {
          position: absolute;
          content: "";
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
      }
      &:before {
          z-index: 889;
      }
      &:after {
          content: attr(data-label);
          width: auto;
          padding: 0.35rem 0.75rem;
          border-radius: $radius-large;
          font-size: 0.85rem;
          font-weight: $weight-normal;
          box-shadow: 0px 1px 2px 1px rgba(0, 1, 0, 0.2);
          z-index: 888;
          white-space: nowrap;
      }
      &:not([data-label=""]):hover:before,
      &:not([data-label=""]):hover:after {
          opacity: 1;
          visibility: visible;
      }
      // Modifiers
      @each $name, $pair in $colors {
          $color: nth($pair, 1);
          $color-invert: nth($pair, 2);
          &.is-#{$name}:after {
              background: $color;
              color: $color-invert;
          }
      }
      &:not([data-label=""]).is-always {
          &:before,
          &:after {
              opacity: 1;
              visibility: visible;
          }
      }
      &.is-multiline {
          &:after {
              display: flex-block;
              text-align: center;
              white-space: normal;
          }
      }
      &.is-dashed {
          border-bottom: 1px dashed $grey-light;
          cursor: default;
      }
      &.is-square {
          &:after {
              border-radius: 0;
          }
      }
      &.is-animated {
          &:before,
          &:after {
              transition: opacity $speed $easing, visibility $speed $easing;
          }
      }
  }
</style>

<span data-label={label}
      class="{type} {position} {size}"
      class:tooltip={active} 
      class:is-square={square}
      class:is-animated={animated} 
      class:is-always={always} 
      class:is-multiline={multilined} 
      class:is-dashed={dashed}
      >
  <slot/>
</span>