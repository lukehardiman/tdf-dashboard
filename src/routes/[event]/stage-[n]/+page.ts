import { error } from '@sveltejs/kit';
import { events, getEvent } from '$lib';
import { loadStageRender } from '$lib/data/profiles';
import type { EntryGenerator, PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const event = getEvent(params.event);
	if (!event) throw error(404, 'Event not found');

	const n = Number(params.n);
	const stage = event.stages.find((s) => s.n === n);
	if (!stage) throw error(404, 'Stage not found');

	const idx = event.stages.indexOf(stage);
	// Real GPX-derived render data (profile series + map track); null → synthesise fallback.
	const render = await loadStageRender(n);
	return {
		event,
		stage,
		series: render?.series ?? null,
		track: render?.track ?? null,
		// GPX-derived climbs are the source of truth; fall back to hand-seeded only if
		// no GPX profile exists for the stage.
		climbs: render?.climbs ?? null,
		uncategorisedKomCount: render?.uncategorisedKomCount ?? 0,
		prev: event.stages[idx - 1] ?? null,
		next: event.stages[idx + 1] ?? null
	};
};

// Prerender every stage of every event.
export const entries: EntryGenerator = () => {
	const out: { event: string; n: string }[] = [];
	for (const ev of Object.values(events)) {
		for (const s of ev.stages) {
			out.push({ event: ev.slug, n: String(s.n) });
		}
	}
	return out;
};
