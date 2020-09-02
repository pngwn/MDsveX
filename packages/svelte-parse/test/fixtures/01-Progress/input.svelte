<script>
import { get } from 'svelte/store'
import { tweened } from 'svelte/motion'
import { cubicOut } from 'svelte/easing'

/** Value of progress bar
 * @svelte-prop {Number} value
 * */
export let value = null

/** Type (color) of progress bar
 * @svelte-prop {String} [type]
 * @values $$colors$$
 * */
export let type = ''

/** Maximum value of progress bar
 * @svelte-prop {Number} [max=100]
 * */
export let max = 100

/** Duration of progress change animation (in ms)
 * @svelte-prop {Number} [duration=400]
 * */
export let duration = 400

/** Easing function to use for animation
 * @svelte-prop {Function} [cubicOut]
 * @values Any function from <code>svelte/easing</code>, or a custom one
 * */
export let easing = cubicOut

let el
let newValue = tweened(value, { duration, easing })

$: newValue.set(value)

newValue.subscribe(val => {
  if (el && typeof(value !== undefined)) {
    el.setAttribute('value', get(newValue))
  }
})

</script>

<progress class="progress {type}" bind:this={el} {max}>{value}%</progress>