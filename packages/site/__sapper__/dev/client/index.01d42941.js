import { F as identity } from './client.9a8e7d1e.js';

/*
Adapted from https://github.com/mattdesl
Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
*/

/**
 * https://svelte.dev/docs/svelte-easing
 * @param {number} t
 * @returns {number}
 */
function cubicOut(t) {
	const f = t - 1.0;
	return f * f * f + 1.0;
}

/**
 * Animates the opacity of an element from 0 to the current opacity for `in` transitions and from the current opacity to 0 for `out` transitions.
 *
 * https://svelte.dev/docs/svelte-transition#fade
 * @param {Element} node
 * @param {import('./public').FadeParams} [params]
 * @returns {import('./public').TransitionConfig}
 */
function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
	const o = +getComputedStyle(node).opacity;
	return {
		delay,
		duration,
		easing,
		css: (t) => `opacity: ${t * o}`
	};
}

/**
 * Slides an element in and out.
 *
 * https://svelte.dev/docs/svelte-transition#slide
 * @param {Element} node
 * @param {import('./public').SlideParams} [params]
 * @returns {import('./public').TransitionConfig}
 */
function slide(node, { delay = 0, duration = 400, easing = cubicOut, axis = 'y' } = {}) {
	const style = getComputedStyle(node);
	const opacity = +style.opacity;
	const primary_property = axis === 'y' ? 'height' : 'width';
	const primary_property_value = parseFloat(style[primary_property]);
	const secondary_properties = axis === 'y' ? ['top', 'bottom'] : ['left', 'right'];
	const capitalized_secondary_properties = secondary_properties.map(
		(e) => `${e[0].toUpperCase()}${e.slice(1)}`
	);
	const padding_start_value = parseFloat(style[`padding${capitalized_secondary_properties[0]}`]);
	const padding_end_value = parseFloat(style[`padding${capitalized_secondary_properties[1]}`]);
	const margin_start_value = parseFloat(style[`margin${capitalized_secondary_properties[0]}`]);
	const margin_end_value = parseFloat(style[`margin${capitalized_secondary_properties[1]}`]);
	const border_width_start_value = parseFloat(
		style[`border${capitalized_secondary_properties[0]}Width`]
	);
	const border_width_end_value = parseFloat(
		style[`border${capitalized_secondary_properties[1]}Width`]
	);
	return {
		delay,
		duration,
		easing,
		css: (t) =>
			'overflow: hidden;' +
			`opacity: ${Math.min(t * 20, 1) * opacity};` +
			`${primary_property}: ${t * primary_property_value}px;` +
			`padding-${secondary_properties[0]}: ${t * padding_start_value}px;` +
			`padding-${secondary_properties[1]}: ${t * padding_end_value}px;` +
			`margin-${secondary_properties[0]}: ${t * margin_start_value}px;` +
			`margin-${secondary_properties[1]}: ${t * margin_end_value}px;` +
			`border-${secondary_properties[0]}-width: ${t * border_width_start_value}px;` +
			`border-${secondary_properties[1]}-width: ${t * border_width_end_value}px;`
	};
}

export { fade as f, slide as s };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguMDFkNDI5NDEuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9zdmVsdGVANC4wLjAvbm9kZV9tb2R1bGVzL3N2ZWx0ZS9zcmMvcnVudGltZS9lYXNpbmcvaW5kZXguanMiLCIuLi8uLi8uLi8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vc3ZlbHRlQDQuMC4wL25vZGVfbW9kdWxlcy9zdmVsdGUvc3JjL3J1bnRpbWUvdHJhbnNpdGlvbi9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuQWRhcHRlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGVzbFxuRGlzdHJpYnV0ZWQgdW5kZXIgTUlUIExpY2Vuc2UgaHR0cHM6Ly9naXRodWIuY29tL21hdHRkZXNsL2Vhc2VzL2Jsb2IvbWFzdGVyL0xJQ0VOU0UubWRcbiovXG5leHBvcnQgeyBpZGVudGl0eSBhcyBsaW5lYXIgfSBmcm9tICcuLi9pbnRlcm5hbC9pbmRleC5qcyc7XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYWNrSW5PdXQodCkge1xuXHRjb25zdCBzID0gMS43MDE1OCAqIDEuNTI1O1xuXHRpZiAoKHQgKj0gMikgPCAxKSByZXR1cm4gMC41ICogKHQgKiB0ICogKChzICsgMSkgKiB0IC0gcykpO1xuXHRyZXR1cm4gMC41ICogKCh0IC09IDIpICogdCAqICgocyArIDEpICogdCArIHMpICsgMik7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYWNrSW4odCkge1xuXHRjb25zdCBzID0gMS43MDE1ODtcblx0cmV0dXJuIHQgKiB0ICogKChzICsgMSkgKiB0IC0gcyk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYWNrT3V0KHQpIHtcblx0Y29uc3QgcyA9IDEuNzAxNTg7XG5cdHJldHVybiAtLXQgKiB0ICogKChzICsgMSkgKiB0ICsgcykgKyAxO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYm91bmNlT3V0KHQpIHtcblx0Y29uc3QgYSA9IDQuMCAvIDExLjA7XG5cdGNvbnN0IGIgPSA4LjAgLyAxMS4wO1xuXHRjb25zdCBjID0gOS4wIC8gMTAuMDtcblx0Y29uc3QgY2EgPSA0MzU2LjAgLyAzNjEuMDtcblx0Y29uc3QgY2IgPSAzNTQ0Mi4wIC8gMTgwNS4wO1xuXHRjb25zdCBjYyA9IDE2MDYxLjAgLyAxODA1LjA7XG5cdGNvbnN0IHQyID0gdCAqIHQ7XG5cdHJldHVybiB0IDwgYVxuXHRcdD8gNy41NjI1ICogdDJcblx0XHQ6IHQgPCBiXG5cdFx0PyA5LjA3NSAqIHQyIC0gOS45ICogdCArIDMuNFxuXHRcdDogdCA8IGNcblx0XHQ/IGNhICogdDIgLSBjYiAqIHQgKyBjY1xuXHRcdDogMTAuOCAqIHQgKiB0IC0gMjAuNTIgKiB0ICsgMTAuNzI7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBib3VuY2VJbk91dCh0KSB7XG5cdHJldHVybiB0IDwgMC41ID8gMC41ICogKDEuMCAtIGJvdW5jZU91dCgxLjAgLSB0ICogMi4wKSkgOiAwLjUgKiBib3VuY2VPdXQodCAqIDIuMCAtIDEuMCkgKyAwLjU7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBib3VuY2VJbih0KSB7XG5cdHJldHVybiAxLjAgLSBib3VuY2VPdXQoMS4wIC0gdCk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaXJjSW5PdXQodCkge1xuXHRpZiAoKHQgKj0gMikgPCAxKSByZXR1cm4gLTAuNSAqIChNYXRoLnNxcnQoMSAtIHQgKiB0KSAtIDEpO1xuXHRyZXR1cm4gMC41ICogKE1hdGguc3FydCgxIC0gKHQgLT0gMikgKiB0KSArIDEpO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2lyY0luKHQpIHtcblx0cmV0dXJuIDEuMCAtIE1hdGguc3FydCgxLjAgLSB0ICogdCk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaXJjT3V0KHQpIHtcblx0cmV0dXJuIE1hdGguc3FydCgxIC0gLS10ICogdCk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjdWJpY0luT3V0KHQpIHtcblx0cmV0dXJuIHQgPCAwLjUgPyA0LjAgKiB0ICogdCAqIHQgOiAwLjUgKiBNYXRoLnBvdygyLjAgKiB0IC0gMi4wLCAzLjApICsgMS4wO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3ViaWNJbih0KSB7XG5cdHJldHVybiB0ICogdCAqIHQ7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjdWJpY091dCh0KSB7XG5cdGNvbnN0IGYgPSB0IC0gMS4wO1xuXHRyZXR1cm4gZiAqIGYgKiBmICsgMS4wO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZWxhc3RpY0luT3V0KHQpIHtcblx0cmV0dXJuIHQgPCAwLjVcblx0XHQ/IDAuNSAqIE1hdGguc2luKCgoKzEzLjAgKiBNYXRoLlBJKSAvIDIpICogMi4wICogdCkgKiBNYXRoLnBvdygyLjAsIDEwLjAgKiAoMi4wICogdCAtIDEuMCkpXG5cdFx0OiAwLjUgKlxuXHRcdFx0XHRNYXRoLnNpbigoKC0xMy4wICogTWF0aC5QSSkgLyAyKSAqICgyLjAgKiB0IC0gMS4wICsgMS4wKSkgKlxuXHRcdFx0XHRNYXRoLnBvdygyLjAsIC0xMC4wICogKDIuMCAqIHQgLSAxLjApKSArXG5cdFx0XHRcdDEuMDtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVsYXN0aWNJbih0KSB7XG5cdHJldHVybiBNYXRoLnNpbigoMTMuMCAqIHQgKiBNYXRoLlBJKSAvIDIpICogTWF0aC5wb3coMi4wLCAxMC4wICogKHQgLSAxLjApKTtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVsYXN0aWNPdXQodCkge1xuXHRyZXR1cm4gTWF0aC5zaW4oKC0xMy4wICogKHQgKyAxLjApICogTWF0aC5QSSkgLyAyKSAqIE1hdGgucG93KDIuMCwgLTEwLjAgKiB0KSArIDEuMDtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4cG9Jbk91dCh0KSB7XG5cdHJldHVybiB0ID09PSAwLjAgfHwgdCA9PT0gMS4wXG5cdFx0PyB0XG5cdFx0OiB0IDwgMC41XG5cdFx0PyArMC41ICogTWF0aC5wb3coMi4wLCAyMC4wICogdCAtIDEwLjApXG5cdFx0OiAtMC41ICogTWF0aC5wb3coMi4wLCAxMC4wIC0gdCAqIDIwLjApICsgMS4wO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhwb0luKHQpIHtcblx0cmV0dXJuIHQgPT09IDAuMCA/IHQgOiBNYXRoLnBvdygyLjAsIDEwLjAgKiAodCAtIDEuMCkpO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhwb091dCh0KSB7XG5cdHJldHVybiB0ID09PSAxLjAgPyB0IDogMS4wIC0gTWF0aC5wb3coMi4wLCAtMTAuMCAqIHQpO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcXVhZEluT3V0KHQpIHtcblx0dCAvPSAwLjU7XG5cdGlmICh0IDwgMSkgcmV0dXJuIDAuNSAqIHQgKiB0O1xuXHR0LS07XG5cdHJldHVybiAtMC41ICogKHQgKiAodCAtIDIpIC0gMSk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWFkSW4odCkge1xuXHRyZXR1cm4gdCAqIHQ7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWFkT3V0KHQpIHtcblx0cmV0dXJuIC10ICogKHQgLSAyLjApO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcXVhcnRJbk91dCh0KSB7XG5cdHJldHVybiB0IDwgMC41ID8gKzguMCAqIE1hdGgucG93KHQsIDQuMCkgOiAtOC4wICogTWF0aC5wb3codCAtIDEuMCwgNC4wKSArIDEuMDtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHF1YXJ0SW4odCkge1xuXHRyZXR1cm4gTWF0aC5wb3codCwgNC4wKTtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHF1YXJ0T3V0KHQpIHtcblx0cmV0dXJuIE1hdGgucG93KHQgLSAxLjAsIDMuMCkgKiAoMS4wIC0gdCkgKyAxLjA7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWludEluT3V0KHQpIHtcblx0aWYgKCh0ICo9IDIpIDwgMSkgcmV0dXJuIDAuNSAqIHQgKiB0ICogdCAqIHQgKiB0O1xuXHRyZXR1cm4gMC41ICogKCh0IC09IDIpICogdCAqIHQgKiB0ICogdCArIDIpO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcXVpbnRJbih0KSB7XG5cdHJldHVybiB0ICogdCAqIHQgKiB0ICogdDtcbn1cblxuLyoqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtZWFzaW5nXG4gKiBAcGFyYW0ge251bWJlcn0gdFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHF1aW50T3V0KHQpIHtcblx0cmV0dXJuIC0tdCAqIHQgKiB0ICogdCAqIHQgKyAxO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2luZUluT3V0KHQpIHtcblx0cmV0dXJuIC0wLjUgKiAoTWF0aC5jb3MoTWF0aC5QSSAqIHQpIC0gMSk7XG59XG5cbi8qKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLWVhc2luZ1xuICogQHBhcmFtIHtudW1iZXJ9IHRcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaW5lSW4odCkge1xuXHRjb25zdCB2ID0gTWF0aC5jb3ModCAqIE1hdGguUEkgKiAwLjUpO1xuXHRpZiAoTWF0aC5hYnModikgPCAxZS0xNCkgcmV0dXJuIDE7XG5cdGVsc2UgcmV0dXJuIDEgLSB2O1xufVxuXG4vKipcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS1lYXNpbmdcbiAqIEBwYXJhbSB7bnVtYmVyfSB0XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2luZU91dCh0KSB7XG5cdHJldHVybiBNYXRoLnNpbigodCAqIE1hdGguUEkpIC8gMik7XG59XG4iLCJpbXBvcnQgeyBjdWJpY091dCwgY3ViaWNJbk91dCwgbGluZWFyIH0gZnJvbSAnLi4vZWFzaW5nL2luZGV4LmpzJztcbmltcG9ydCB7IGFzc2lnbiwgc3BsaXRfY3NzX3VuaXQsIGlzX2Z1bmN0aW9uIH0gZnJvbSAnLi4vaW50ZXJuYWwvaW5kZXguanMnO1xuXG4vKipcbiAqIEFuaW1hdGVzIGEgYGJsdXJgIGZpbHRlciBhbG9uZ3NpZGUgYW4gZWxlbWVudCdzIG9wYWNpdHkuXG4gKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLXRyYW5zaXRpb24jYmx1clxuICogQHBhcmFtIHtFbGVtZW50fSBub2RlXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi9wdWJsaWMnKS5CbHVyUGFyYW1zfSBbcGFyYW1zXVxuICogQHJldHVybnMge2ltcG9ydCgnLi9wdWJsaWMnKS5UcmFuc2l0aW9uQ29uZmlnfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmx1cihcblx0bm9kZSxcblx0eyBkZWxheSA9IDAsIGR1cmF0aW9uID0gNDAwLCBlYXNpbmcgPSBjdWJpY0luT3V0LCBhbW91bnQgPSA1LCBvcGFjaXR5ID0gMCB9ID0ge31cbikge1xuXHRjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUobm9kZSk7XG5cdGNvbnN0IHRhcmdldF9vcGFjaXR5ID0gK3N0eWxlLm9wYWNpdHk7XG5cdGNvbnN0IGYgPSBzdHlsZS5maWx0ZXIgPT09ICdub25lJyA/ICcnIDogc3R5bGUuZmlsdGVyO1xuXHRjb25zdCBvZCA9IHRhcmdldF9vcGFjaXR5ICogKDEgLSBvcGFjaXR5KTtcblx0Y29uc3QgW3ZhbHVlLCB1bml0XSA9IHNwbGl0X2Nzc191bml0KGFtb3VudCk7XG5cdHJldHVybiB7XG5cdFx0ZGVsYXksXG5cdFx0ZHVyYXRpb24sXG5cdFx0ZWFzaW5nLFxuXHRcdGNzczogKF90LCB1KSA9PiBgb3BhY2l0eTogJHt0YXJnZXRfb3BhY2l0eSAtIG9kICogdX07IGZpbHRlcjogJHtmfSBibHVyKCR7dSAqIHZhbHVlfSR7dW5pdH0pO2Bcblx0fTtcbn1cblxuLyoqXG4gKiBBbmltYXRlcyB0aGUgb3BhY2l0eSBvZiBhbiBlbGVtZW50IGZyb20gMCB0byB0aGUgY3VycmVudCBvcGFjaXR5IGZvciBgaW5gIHRyYW5zaXRpb25zIGFuZCBmcm9tIHRoZSBjdXJyZW50IG9wYWNpdHkgdG8gMCBmb3IgYG91dGAgdHJhbnNpdGlvbnMuXG4gKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLXRyYW5zaXRpb24jZmFkZVxuICogQHBhcmFtIHtFbGVtZW50fSBub2RlXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi9wdWJsaWMnKS5GYWRlUGFyYW1zfSBbcGFyYW1zXVxuICogQHJldHVybnMge2ltcG9ydCgnLi9wdWJsaWMnKS5UcmFuc2l0aW9uQ29uZmlnfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmFkZShub2RlLCB7IGRlbGF5ID0gMCwgZHVyYXRpb24gPSA0MDAsIGVhc2luZyA9IGxpbmVhciB9ID0ge30pIHtcblx0Y29uc3QgbyA9ICtnZXRDb21wdXRlZFN0eWxlKG5vZGUpLm9wYWNpdHk7XG5cdHJldHVybiB7XG5cdFx0ZGVsYXksXG5cdFx0ZHVyYXRpb24sXG5cdFx0ZWFzaW5nLFxuXHRcdGNzczogKHQpID0+IGBvcGFjaXR5OiAke3QgKiBvfWBcblx0fTtcbn1cblxuLyoqXG4gKiBBbmltYXRlcyB0aGUgeCBhbmQgeSBwb3NpdGlvbnMgYW5kIHRoZSBvcGFjaXR5IG9mIGFuIGVsZW1lbnQuIGBpbmAgdHJhbnNpdGlvbnMgYW5pbWF0ZSBmcm9tIHRoZSBwcm92aWRlZCB2YWx1ZXMsIHBhc3NlZCBhcyBwYXJhbWV0ZXJzIHRvIHRoZSBlbGVtZW50J3MgZGVmYXVsdCB2YWx1ZXMuIGBvdXRgIHRyYW5zaXRpb25zIGFuaW1hdGUgZnJvbSB0aGUgZWxlbWVudCdzIGRlZmF1bHQgdmFsdWVzIHRvIHRoZSBwcm92aWRlZCB2YWx1ZXMuXG4gKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLXRyYW5zaXRpb24jZmx5XG4gKiBAcGFyYW0ge0VsZW1lbnR9IG5vZGVcbiAqIEBwYXJhbSB7aW1wb3J0KCcuL3B1YmxpYycpLkZseVBhcmFtc30gW3BhcmFtc11cbiAqIEByZXR1cm5zIHtpbXBvcnQoJy4vcHVibGljJykuVHJhbnNpdGlvbkNvbmZpZ31cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZseShcblx0bm9kZSxcblx0eyBkZWxheSA9IDAsIGR1cmF0aW9uID0gNDAwLCBlYXNpbmcgPSBjdWJpY091dCwgeCA9IDAsIHkgPSAwLCBvcGFjaXR5ID0gMCB9ID0ge31cbikge1xuXHRjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUobm9kZSk7XG5cdGNvbnN0IHRhcmdldF9vcGFjaXR5ID0gK3N0eWxlLm9wYWNpdHk7XG5cdGNvbnN0IHRyYW5zZm9ybSA9IHN0eWxlLnRyYW5zZm9ybSA9PT0gJ25vbmUnID8gJycgOiBzdHlsZS50cmFuc2Zvcm07XG5cdGNvbnN0IG9kID0gdGFyZ2V0X29wYWNpdHkgKiAoMSAtIG9wYWNpdHkpO1xuXHRjb25zdCBbeFZhbHVlLCB4VW5pdF0gPSBzcGxpdF9jc3NfdW5pdCh4KTtcblx0Y29uc3QgW3lWYWx1ZSwgeVVuaXRdID0gc3BsaXRfY3NzX3VuaXQoeSk7XG5cdHJldHVybiB7XG5cdFx0ZGVsYXksXG5cdFx0ZHVyYXRpb24sXG5cdFx0ZWFzaW5nLFxuXHRcdGNzczogKHQsIHUpID0+IGBcblx0XHRcdHRyYW5zZm9ybTogJHt0cmFuc2Zvcm19IHRyYW5zbGF0ZSgkeygxIC0gdCkgKiB4VmFsdWV9JHt4VW5pdH0sICR7KDEgLSB0KSAqIHlWYWx1ZX0ke3lVbml0fSk7XG5cdFx0XHRvcGFjaXR5OiAke3RhcmdldF9vcGFjaXR5IC0gb2QgKiB1fWBcblx0fTtcbn1cblxuLyoqXG4gKiBTbGlkZXMgYW4gZWxlbWVudCBpbiBhbmQgb3V0LlxuICpcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS10cmFuc2l0aW9uI3NsaWRlXG4gKiBAcGFyYW0ge0VsZW1lbnR9IG5vZGVcbiAqIEBwYXJhbSB7aW1wb3J0KCcuL3B1YmxpYycpLlNsaWRlUGFyYW1zfSBbcGFyYW1zXVxuICogQHJldHVybnMge2ltcG9ydCgnLi9wdWJsaWMnKS5UcmFuc2l0aW9uQ29uZmlnfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2xpZGUobm9kZSwgeyBkZWxheSA9IDAsIGR1cmF0aW9uID0gNDAwLCBlYXNpbmcgPSBjdWJpY091dCwgYXhpcyA9ICd5JyB9ID0ge30pIHtcblx0Y29uc3Qgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKG5vZGUpO1xuXHRjb25zdCBvcGFjaXR5ID0gK3N0eWxlLm9wYWNpdHk7XG5cdGNvbnN0IHByaW1hcnlfcHJvcGVydHkgPSBheGlzID09PSAneScgPyAnaGVpZ2h0JyA6ICd3aWR0aCc7XG5cdGNvbnN0IHByaW1hcnlfcHJvcGVydHlfdmFsdWUgPSBwYXJzZUZsb2F0KHN0eWxlW3ByaW1hcnlfcHJvcGVydHldKTtcblx0Y29uc3Qgc2Vjb25kYXJ5X3Byb3BlcnRpZXMgPSBheGlzID09PSAneScgPyBbJ3RvcCcsICdib3R0b20nXSA6IFsnbGVmdCcsICdyaWdodCddO1xuXHRjb25zdCBjYXBpdGFsaXplZF9zZWNvbmRhcnlfcHJvcGVydGllcyA9IHNlY29uZGFyeV9wcm9wZXJ0aWVzLm1hcChcblx0XHQoZSkgPT4gYCR7ZVswXS50b1VwcGVyQ2FzZSgpfSR7ZS5zbGljZSgxKX1gXG5cdCk7XG5cdGNvbnN0IHBhZGRpbmdfc3RhcnRfdmFsdWUgPSBwYXJzZUZsb2F0KHN0eWxlW2BwYWRkaW5nJHtjYXBpdGFsaXplZF9zZWNvbmRhcnlfcHJvcGVydGllc1swXX1gXSk7XG5cdGNvbnN0IHBhZGRpbmdfZW5kX3ZhbHVlID0gcGFyc2VGbG9hdChzdHlsZVtgcGFkZGluZyR7Y2FwaXRhbGl6ZWRfc2Vjb25kYXJ5X3Byb3BlcnRpZXNbMV19YF0pO1xuXHRjb25zdCBtYXJnaW5fc3RhcnRfdmFsdWUgPSBwYXJzZUZsb2F0KHN0eWxlW2BtYXJnaW4ke2NhcGl0YWxpemVkX3NlY29uZGFyeV9wcm9wZXJ0aWVzWzBdfWBdKTtcblx0Y29uc3QgbWFyZ2luX2VuZF92YWx1ZSA9IHBhcnNlRmxvYXQoc3R5bGVbYG1hcmdpbiR7Y2FwaXRhbGl6ZWRfc2Vjb25kYXJ5X3Byb3BlcnRpZXNbMV19YF0pO1xuXHRjb25zdCBib3JkZXJfd2lkdGhfc3RhcnRfdmFsdWUgPSBwYXJzZUZsb2F0KFxuXHRcdHN0eWxlW2Bib3JkZXIke2NhcGl0YWxpemVkX3NlY29uZGFyeV9wcm9wZXJ0aWVzWzBdfVdpZHRoYF1cblx0KTtcblx0Y29uc3QgYm9yZGVyX3dpZHRoX2VuZF92YWx1ZSA9IHBhcnNlRmxvYXQoXG5cdFx0c3R5bGVbYGJvcmRlciR7Y2FwaXRhbGl6ZWRfc2Vjb25kYXJ5X3Byb3BlcnRpZXNbMV19V2lkdGhgXVxuXHQpO1xuXHRyZXR1cm4ge1xuXHRcdGRlbGF5LFxuXHRcdGR1cmF0aW9uLFxuXHRcdGVhc2luZyxcblx0XHRjc3M6ICh0KSA9PlxuXHRcdFx0J292ZXJmbG93OiBoaWRkZW47JyArXG5cdFx0XHRgb3BhY2l0eTogJHtNYXRoLm1pbih0ICogMjAsIDEpICogb3BhY2l0eX07YCArXG5cdFx0XHRgJHtwcmltYXJ5X3Byb3BlcnR5fTogJHt0ICogcHJpbWFyeV9wcm9wZXJ0eV92YWx1ZX1weDtgICtcblx0XHRcdGBwYWRkaW5nLSR7c2Vjb25kYXJ5X3Byb3BlcnRpZXNbMF19OiAke3QgKiBwYWRkaW5nX3N0YXJ0X3ZhbHVlfXB4O2AgK1xuXHRcdFx0YHBhZGRpbmctJHtzZWNvbmRhcnlfcHJvcGVydGllc1sxXX06ICR7dCAqIHBhZGRpbmdfZW5kX3ZhbHVlfXB4O2AgK1xuXHRcdFx0YG1hcmdpbi0ke3NlY29uZGFyeV9wcm9wZXJ0aWVzWzBdfTogJHt0ICogbWFyZ2luX3N0YXJ0X3ZhbHVlfXB4O2AgK1xuXHRcdFx0YG1hcmdpbi0ke3NlY29uZGFyeV9wcm9wZXJ0aWVzWzFdfTogJHt0ICogbWFyZ2luX2VuZF92YWx1ZX1weDtgICtcblx0XHRcdGBib3JkZXItJHtzZWNvbmRhcnlfcHJvcGVydGllc1swXX0td2lkdGg6ICR7dCAqIGJvcmRlcl93aWR0aF9zdGFydF92YWx1ZX1weDtgICtcblx0XHRcdGBib3JkZXItJHtzZWNvbmRhcnlfcHJvcGVydGllc1sxXX0td2lkdGg6ICR7dCAqIGJvcmRlcl93aWR0aF9lbmRfdmFsdWV9cHg7YFxuXHR9O1xufVxuXG4vKipcbiAqIEFuaW1hdGVzIHRoZSBvcGFjaXR5IGFuZCBzY2FsZSBvZiBhbiBlbGVtZW50LiBgaW5gIHRyYW5zaXRpb25zIGFuaW1hdGUgZnJvbSBhbiBlbGVtZW50J3MgY3VycmVudCAoZGVmYXVsdCkgdmFsdWVzIHRvIHRoZSBwcm92aWRlZCB2YWx1ZXMsIHBhc3NlZCBhcyBwYXJhbWV0ZXJzLiBgb3V0YCB0cmFuc2l0aW9ucyBhbmltYXRlIGZyb20gdGhlIHByb3ZpZGVkIHZhbHVlcyB0byBhbiBlbGVtZW50J3MgZGVmYXVsdCB2YWx1ZXMuXG4gKlxuICogaHR0cHM6Ly9zdmVsdGUuZGV2L2RvY3Mvc3ZlbHRlLXRyYW5zaXRpb24jc2NhbGVcbiAqIEBwYXJhbSB7RWxlbWVudH0gbm9kZVxuICogQHBhcmFtIHtpbXBvcnQoJy4vcHVibGljJykuU2NhbGVQYXJhbXN9IFtwYXJhbXNdXG4gKiBAcmV0dXJucyB7aW1wb3J0KCcuL3B1YmxpYycpLlRyYW5zaXRpb25Db25maWd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzY2FsZShcblx0bm9kZSxcblx0eyBkZWxheSA9IDAsIGR1cmF0aW9uID0gNDAwLCBlYXNpbmcgPSBjdWJpY091dCwgc3RhcnQgPSAwLCBvcGFjaXR5ID0gMCB9ID0ge31cbikge1xuXHRjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUobm9kZSk7XG5cdGNvbnN0IHRhcmdldF9vcGFjaXR5ID0gK3N0eWxlLm9wYWNpdHk7XG5cdGNvbnN0IHRyYW5zZm9ybSA9IHN0eWxlLnRyYW5zZm9ybSA9PT0gJ25vbmUnID8gJycgOiBzdHlsZS50cmFuc2Zvcm07XG5cdGNvbnN0IHNkID0gMSAtIHN0YXJ0O1xuXHRjb25zdCBvZCA9IHRhcmdldF9vcGFjaXR5ICogKDEgLSBvcGFjaXR5KTtcblx0cmV0dXJuIHtcblx0XHRkZWxheSxcblx0XHRkdXJhdGlvbixcblx0XHRlYXNpbmcsXG5cdFx0Y3NzOiAoX3QsIHUpID0+IGBcblx0XHRcdHRyYW5zZm9ybTogJHt0cmFuc2Zvcm19IHNjYWxlKCR7MSAtIHNkICogdX0pO1xuXHRcdFx0b3BhY2l0eTogJHt0YXJnZXRfb3BhY2l0eSAtIG9kICogdX1cblx0XHRgXG5cdH07XG59XG5cbi8qKlxuICogQW5pbWF0ZXMgdGhlIHN0cm9rZSBvZiBhbiBTVkcgZWxlbWVudCwgbGlrZSBhIHNuYWtlIGluIGEgdHViZS4gYGluYCB0cmFuc2l0aW9ucyBiZWdpbiB3aXRoIHRoZSBwYXRoIGludmlzaWJsZSBhbmQgZHJhdyB0aGUgcGF0aCB0byB0aGUgc2NyZWVuIG92ZXIgdGltZS4gYG91dGAgdHJhbnNpdGlvbnMgc3RhcnQgaW4gYSB2aXNpYmxlIHN0YXRlIGFuZCBncmFkdWFsbHkgZXJhc2UgdGhlIHBhdGguIGBkcmF3YCBvbmx5IHdvcmtzIHdpdGggZWxlbWVudHMgdGhhdCBoYXZlIGEgYGdldFRvdGFsTGVuZ3RoYCBtZXRob2QsIGxpa2UgYDxwYXRoPmAgYW5kIGA8cG9seWxpbmU+YC5cbiAqXG4gKiBodHRwczovL3N2ZWx0ZS5kZXYvZG9jcy9zdmVsdGUtdHJhbnNpdGlvbiNkcmF3XG4gKiBAcGFyYW0ge1NWR0VsZW1lbnQgJiB7IGdldFRvdGFsTGVuZ3RoKCk6IG51bWJlciB9fSBub2RlXG4gKiBAcGFyYW0ge2ltcG9ydCgnLi9wdWJsaWMnKS5EcmF3UGFyYW1zfSBbcGFyYW1zXVxuICogQHJldHVybnMge2ltcG9ydCgnLi9wdWJsaWMnKS5UcmFuc2l0aW9uQ29uZmlnfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZHJhdyhub2RlLCB7IGRlbGF5ID0gMCwgc3BlZWQsIGR1cmF0aW9uLCBlYXNpbmcgPSBjdWJpY0luT3V0IH0gPSB7fSkge1xuXHRsZXQgbGVuID0gbm9kZS5nZXRUb3RhbExlbmd0aCgpO1xuXHRjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUobm9kZSk7XG5cdGlmIChzdHlsZS5zdHJva2VMaW5lY2FwICE9PSAnYnV0dCcpIHtcblx0XHRsZW4gKz0gcGFyc2VJbnQoc3R5bGUuc3Ryb2tlV2lkdGgpO1xuXHR9XG5cdGlmIChkdXJhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHNwZWVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGR1cmF0aW9uID0gODAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkdXJhdGlvbiA9IGxlbiAvIHNwZWVkO1xuXHRcdH1cblx0fSBlbHNlIGlmICh0eXBlb2YgZHVyYXRpb24gPT09ICdmdW5jdGlvbicpIHtcblx0XHRkdXJhdGlvbiA9IGR1cmF0aW9uKGxlbik7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRkZWxheSxcblx0XHRkdXJhdGlvbixcblx0XHRlYXNpbmcsXG5cdFx0Y3NzOiAoXywgdSkgPT4gYFxuXHRcdFx0c3Ryb2tlLWRhc2hhcnJheTogJHtsZW59O1xuXHRcdFx0c3Ryb2tlLWRhc2hvZmZzZXQ6ICR7dSAqIGxlbn07XG5cdFx0YFxuXHR9O1xufVxuXG4vKipcbiAqIFRoZSBgY3Jvc3NmYWRlYCBmdW5jdGlvbiBjcmVhdGVzIGEgcGFpciBvZiBbdHJhbnNpdGlvbnNdKC9kb2NzI3RlbXBsYXRlLXN5bnRheC1lbGVtZW50LWRpcmVjdGl2ZXMtdHJhbnNpdGlvbi1mbikgY2FsbGVkIGBzZW5kYCBhbmQgYHJlY2VpdmVgLiBXaGVuIGFuIGVsZW1lbnQgaXMgJ3NlbnQnLCBpdCBsb29rcyBmb3IgYSBjb3JyZXNwb25kaW5nIGVsZW1lbnQgYmVpbmcgJ3JlY2VpdmVkJywgYW5kIGdlbmVyYXRlcyBhIHRyYW5zaXRpb24gdGhhdCB0cmFuc2Zvcm1zIHRoZSBlbGVtZW50IHRvIGl0cyBjb3VudGVycGFydCdzIHBvc2l0aW9uIGFuZCBmYWRlcyBpdCBvdXQuIFdoZW4gYW4gZWxlbWVudCBpcyAncmVjZWl2ZWQnLCB0aGUgcmV2ZXJzZSBoYXBwZW5zLiBJZiB0aGVyZSBpcyBubyBjb3VudGVycGFydCwgdGhlIGBmYWxsYmFja2AgdHJhbnNpdGlvbiBpcyB1c2VkLlxuICpcbiAqIGh0dHBzOi8vc3ZlbHRlLmRldi9kb2NzL3N2ZWx0ZS10cmFuc2l0aW9uI2Nyb3NzZmFkZVxuICogQHBhcmFtIHtpbXBvcnQoJy4vcHVibGljJykuQ3Jvc3NmYWRlUGFyYW1zICYge1xuICogXHRmYWxsYmFjaz86IChub2RlOiBFbGVtZW50LCBwYXJhbXM6IGltcG9ydCgnLi9wdWJsaWMnKS5Dcm9zc2ZhZGVQYXJhbXMsIGludHJvOiBib29sZWFuKSA9PiBpbXBvcnQoJy4vcHVibGljJykuVHJhbnNpdGlvbkNvbmZpZztcbiAqIH19IHBhcmFtc1xuICogQHJldHVybnMge1sobm9kZTogYW55LCBwYXJhbXM6IGltcG9ydCgnLi9wdWJsaWMnKS5Dcm9zc2ZhZGVQYXJhbXMgJiB7IGtleTogYW55OyB9KSA9PiAoKSA9PiBpbXBvcnQoJy4vcHVibGljJykuVHJhbnNpdGlvbkNvbmZpZywgKG5vZGU6IGFueSwgcGFyYW1zOiBpbXBvcnQoJy4vcHVibGljJykuQ3Jvc3NmYWRlUGFyYW1zICYgeyBrZXk6IGFueTsgfSkgPT4gKCkgPT4gaW1wb3J0KCcuL3B1YmxpYycpLlRyYW5zaXRpb25Db25maWddfVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3Jvc3NmYWRlKHsgZmFsbGJhY2ssIC4uLmRlZmF1bHRzIH0pIHtcblx0LyoqIEB0eXBlIHtNYXA8YW55LCBFbGVtZW50Pn0gKi9cblx0Y29uc3QgdG9fcmVjZWl2ZSA9IG5ldyBNYXAoKTtcblx0LyoqIEB0eXBlIHtNYXA8YW55LCBFbGVtZW50Pn0gKi9cblx0Y29uc3QgdG9fc2VuZCA9IG5ldyBNYXAoKTtcblx0LyoqXG5cdCAqIEBwYXJhbSB7RWxlbWVudH0gZnJvbV9ub2RlXG5cdCAqIEBwYXJhbSB7RWxlbWVudH0gbm9kZVxuXHQgKiBAcGFyYW0ge2ltcG9ydCgnLi9wdWJsaWMnKS5Dcm9zc2ZhZGVQYXJhbXN9IHBhcmFtc1xuXHQgKiBAcmV0dXJucyB7aW1wb3J0KCcuL3B1YmxpYycpLlRyYW5zaXRpb25Db25maWd9XG5cdCAqL1xuXHRmdW5jdGlvbiBjcm9zc2ZhZGUoZnJvbV9ub2RlLCBub2RlLCBwYXJhbXMpIHtcblx0XHRjb25zdCB7XG5cdFx0XHRkZWxheSA9IDAsXG5cdFx0XHRkdXJhdGlvbiA9IChkKSA9PiBNYXRoLnNxcnQoZCkgKiAzMCxcblx0XHRcdGVhc2luZyA9IGN1YmljT3V0XG5cdFx0fSA9IGFzc2lnbihhc3NpZ24oe30sIGRlZmF1bHRzKSwgcGFyYW1zKTtcblx0XHRjb25zdCBmcm9tID0gZnJvbV9ub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHRvID0gbm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBkeCA9IGZyb20ubGVmdCAtIHRvLmxlZnQ7XG5cdFx0Y29uc3QgZHkgPSBmcm9tLnRvcCAtIHRvLnRvcDtcblx0XHRjb25zdCBkdyA9IGZyb20ud2lkdGggLyB0by53aWR0aDtcblx0XHRjb25zdCBkaCA9IGZyb20uaGVpZ2h0IC8gdG8uaGVpZ2h0O1xuXHRcdGNvbnN0IGQgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXHRcdGNvbnN0IHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShub2RlKTtcblx0XHRjb25zdCB0cmFuc2Zvcm0gPSBzdHlsZS50cmFuc2Zvcm0gPT09ICdub25lJyA/ICcnIDogc3R5bGUudHJhbnNmb3JtO1xuXHRcdGNvbnN0IG9wYWNpdHkgPSArc3R5bGUub3BhY2l0eTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVsYXksXG5cdFx0XHRkdXJhdGlvbjogaXNfZnVuY3Rpb24oZHVyYXRpb24pID8gZHVyYXRpb24oZCkgOiBkdXJhdGlvbixcblx0XHRcdGVhc2luZyxcblx0XHRcdGNzczogKHQsIHUpID0+IGBcblx0XHRcdFx0b3BhY2l0eTogJHt0ICogb3BhY2l0eX07XG5cdFx0XHRcdHRyYW5zZm9ybS1vcmlnaW46IHRvcCBsZWZ0O1xuXHRcdFx0XHR0cmFuc2Zvcm06ICR7dHJhbnNmb3JtfSB0cmFuc2xhdGUoJHt1ICogZHh9cHgsJHt1ICogZHl9cHgpIHNjYWxlKCR7dCArICgxIC0gdCkgKiBkd30sICR7XG5cdFx0XHRcdHQgKyAoMSAtIHQpICogZGhcblx0XHRcdH0pO1xuXHRcdFx0YFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtNYXA8YW55LCBFbGVtZW50Pn0gaXRlbXNcblx0ICogQHBhcmFtIHtNYXA8YW55LCBFbGVtZW50Pn0gY291bnRlcnBhcnRzXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gaW50cm9cblx0ICogQHJldHVybnMgeyhub2RlOiBhbnksIHBhcmFtczogaW1wb3J0KCcuL3B1YmxpYycpLkNyb3NzZmFkZVBhcmFtcyAmIHsga2V5OiBhbnk7IH0pID0+ICgpID0+IGltcG9ydCgnLi9wdWJsaWMnKS5UcmFuc2l0aW9uQ29uZmlnfVxuXHQgKi9cblx0ZnVuY3Rpb24gdHJhbnNpdGlvbihpdGVtcywgY291bnRlcnBhcnRzLCBpbnRybykge1xuXHRcdHJldHVybiAobm9kZSwgcGFyYW1zKSA9PiB7XG5cdFx0XHRpdGVtcy5zZXQocGFyYW1zLmtleSwgbm9kZSk7XG5cdFx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0XHRpZiAoY291bnRlcnBhcnRzLmhhcyhwYXJhbXMua2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG90aGVyX25vZGUgPSBjb3VudGVycGFydHMuZ2V0KHBhcmFtcy5rZXkpO1xuXHRcdFx0XHRcdGNvdW50ZXJwYXJ0cy5kZWxldGUocGFyYW1zLmtleSk7XG5cdFx0XHRcdFx0cmV0dXJuIGNyb3NzZmFkZShvdGhlcl9ub2RlLCBub2RlLCBwYXJhbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGlmIHRoZSBub2RlIGlzIGRpc2FwcGVhcmluZyBhbHRvZ2V0aGVyXG5cdFx0XHRcdC8vIChpLmUuIHdhc24ndCBjbGFpbWVkIGJ5IHRoZSBvdGhlciBsaXN0KVxuXHRcdFx0XHQvLyB0aGVuIHdlIG5lZWQgdG8gc3VwcGx5IGFuIG91dHJvXG5cdFx0XHRcdGl0ZW1zLmRlbGV0ZShwYXJhbXMua2V5KTtcblx0XHRcdFx0cmV0dXJuIGZhbGxiYWNrICYmIGZhbGxiYWNrKG5vZGUsIHBhcmFtcywgaW50cm8pO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9XG5cdHJldHVybiBbdHJhbnNpdGlvbih0b19zZW5kLCB0b19yZWNlaXZlLCBmYWxzZSksIHRyYW5zaXRpb24odG9fcmVjZWl2ZSwgdG9fc2VuZCwgdHJ1ZSldO1xufVxuIl0sIm5hbWVzIjpbImxpbmVhciJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQXVIQTtB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