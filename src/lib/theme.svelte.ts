import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tdf-theme';

/** Read the theme the pre-paint script already resolved onto <html data-theme>. */
function resolveInitial(): Theme {
	if (!browser) return 'dark';
	return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Theme controller. Dark is the default identity; light is opt-in but remembered.
 * The actual <html data-theme> attribute is first set by the inline pre-paint script
 * in app.html (no flash); this just keeps it and localStorage in sync afterwards.
 */
class ThemeStore {
	current = $state<Theme>('dark');

	constructor() {
		this.current = resolveInitial();
	}

	set(t: Theme) {
		this.current = t;
		if (!browser) return;
		document.documentElement.dataset.theme = t;
		try {
			localStorage.setItem(STORAGE_KEY, t);
		} catch {
			/* private mode / storage disabled — theme still applies for this session */
		}
	}

	toggle() {
		this.set(this.current === 'dark' ? 'light' : 'dark');
	}
}

export const theme = new ThemeStore();
