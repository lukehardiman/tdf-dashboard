import { error } from '@sveltejs/kit';
import { events, getEvent } from '$lib';
import { previewSeries } from '$lib/data/profiles';
import { stageTimes } from '$lib/data/times';
import type { ElePoint } from '$lib/render/profile';
import type { StageTimes } from '$lib/data/types';
import type { EntryGenerator, PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const event = getEvent(params.event);
	if (!event) throw error(404, 'Event not found');
	// GPX-derived preview series per stage for the cards; null → synthesise fallback.
	const previews: Record<number, ElePoint[] | null> = {};
	// Official start times per stage for the cards; null → omit the line.
	const times: Record<number, StageTimes | null> = {};
	for (const s of event.stages) {
		previews[s.n] = previewSeries(s.n);
		times[s.n] = stageTimes(s.n);
	}
	return { event, previews, times };
};

// Tell the prerenderer which event slugs exist.
export const entries: EntryGenerator = () => {
	return Object.keys(events).map((event) => ({ event }));
};
