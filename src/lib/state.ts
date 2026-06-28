import type { EventMeta, Stage } from './data/types';

/** Returns the stage happening on `now`, or null if none (rest day / outside race). */
export function stageOn(event: EventMeta, now: Date): Stage | null {
	const iso = toISODate(now);
	return event.stages.find((s) => s.date === iso) ?? null;
}

/** The stage to scroll/jump to: today's stage, else the next upcoming, else the last. */
export function focusStage(event: EventMeta, now: Date): Stage {
	const iso = toISODate(now);
	const today = event.stages.find((s) => s.date === iso);
	if (today) return today;
	const upcoming = event.stages.find((s) => s.date > iso);
	if (upcoming) return upcoming;
	return event.stages[event.stages.length - 1];
}

/**
 * Where the race is relative to `now`: before it starts, on a stage day, on a rest/transfer day
 * within the window, or finished. Drives the masthead status pill. Pure — date comparisons only.
 */
export type RaceStatus =
	| { phase: 'pre'; startsISO: string }
	| { phase: 'stage'; dateISO: string; stage: Stage }
	| { phase: 'rest'; dateISO: string; location?: string }
	| { phase: 'post'; endedISO: string };

export function raceStatus(event: EventMeta, now: Date): RaceStatus {
	const iso = toISODate(now);
	if (iso < event.startDate) return { phase: 'pre', startsISO: event.startDate };
	if (iso > event.endDate) return { phase: 'post', endedISO: event.endDate };
	const stage = stageOn(event, now);
	if (stage) return { phase: 'stage', dateISO: iso, stage };
	const rest = event.restDays.find((r) => r.date === iso);
	return { phase: 'rest', dateISO: iso, location: rest?.location };
}

export type StageState = 'past' | 'today' | 'upcoming';

/** Past/today/upcoming for any ISO date relative to `now`. */
export function dayState(iso: string, now: Date): StageState {
	const today = toISODate(now);
	if (iso === today) return 'today';
	return iso < today ? 'past' : 'upcoming';
}

export function stageState(stage: Stage, now: Date): StageState {
	return dayState(stage.date, now);
}

export function isRestDay(event: EventMeta, now: Date): boolean {
	const iso = toISODate(now);
	return event.restDays.some((r) => r.date === iso);
}

/** A stage card or a rest-day marker, used to render the index in date order. */
export type TimelineItem =
	| { kind: 'stage'; date: string; stage: Stage }
	| { kind: 'rest'; date: string; location?: string };

/** Stages + rest days merged in chronological order. */
export function timeline(event: EventMeta): TimelineItem[] {
	const items: TimelineItem[] = [
		...event.stages.map((stage): TimelineItem => ({ kind: 'stage', date: stage.date, stage })),
		...event.restDays.map(
			(r): TimelineItem => ({ kind: 'rest', date: r.date, location: r.location })
		)
	];
	return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function toISODate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string, locale = 'en-GB'): string {
	return new Date(iso + 'T12:00:00').toLocaleDateString(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export function formatDateLong(iso: string, locale = 'en-GB'): string {
	return new Date(iso + 'T12:00:00').toLocaleDateString(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}
