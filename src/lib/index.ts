import { tdf2026 } from './data/tdf2026';
import type { EventMeta } from './data/types';

// Event registry. Add future events here; routing and pages derive from this.
export const events: Record<string, EventMeta> = {
	[tdf2026.slug]: tdf2026
};

// The event considered "current" — the home page redirects here, and the
// live/today logic keys off it. Update per season.
export const CURRENT_EVENT_SLUG = tdf2026.slug;

export function getEvent(slug: string): EventMeta | undefined {
	return events[slug];
}

export function getCurrentEvent(): EventMeta {
	return events[CURRENT_EVENT_SLUG];
}
