// the frame's theme as the root layout holds it, so a page can offer a switch.
// `?theme=light` or `?theme=dark` on any page sets it too, for checking dark,
// which is still a proposal
import { getContext, setContext } from 'svelte';

export type Theme = 'auto' | 'light' | 'dark';

const KEY = Symbol('theme');

export class ThemeChoice {
	value = $state<Theme>('auto');

	/** take ?theme from a url when it names one, and keep the last choice otherwise */
	from(url: URL) {
		const asked = url.searchParams.get('theme');
		if (asked === 'auto' || asked === 'light' || asked === 'dark') this.value = asked;
	}
}

export const provide_theme = () => setContext(KEY, new ThemeChoice());

export const use_theme = () => getContext<ThemeChoice | undefined>(KEY);
