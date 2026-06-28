import { error } from '@sveltejs/kit';
import { events, getEvent } from '$lib';
import { previewSeries } from '$lib/data/profiles';
import type { ElePoint } from '$lib/render/profile';
import type { EntryGenerator, PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const event = getEvent(params.event);
	if (!event) throw error(404, 'Event not found');
	// GPX-derived preview series per stage for the cards; null → synthesise fallback.
	const previews: Record<number, ElePoint[] | null> = {};
	for (const s of event.stages) previews[s.n] = previewSeries(s.n);
	return { event, previews };
};

// Tell the prerenderer which event slugs exist.
export const entries: EntryGenerator = () => {
	return Object.keys(events).map((event) => ({ event }));
};
