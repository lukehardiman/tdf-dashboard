// Core data model for the event dashboard.
// Designed to be event-agnostic so future races (Giro, Vuelta) reuse it.

export type StageType = 'ttt' | 'itt' | 'flat' | 'hills' | 'mountains';

export interface Climb {
	name: string;
	/** Category: 4 (easiest) → 1 (hardest), or 'hc' for hors catégorie */
	category: 1 | 2 | 3 | 4 | 'hc';
	/** Distance from stage start to the summit, km */
	summitKm: number;
	/** Length of the climb, km */
	lengthKm: number;
	/** Average gradient, % */
	avgGradient: number;
	/** Summit elevation, m */
	summitElevation: number;
}

export interface TownInfo {
	name: string;
	/** Short editorial note — character of the place. Hand-written, not generated. */
	note?: string;
	elevation?: number;
}

export interface Stage {
	/** 1–21 */
	n: number;
	/** ISO date, race-local */
	date: string;
	type: StageType;
	start: TownInfo;
	finish: TownInfo;
	/** Stage distance, km */
	distanceKm: number;
	/** Total elevation gain, m */
	elevationGainM: number;
	/** One-line editorial summary of the stage. */
	summary: string;
	/** Categorised climbs on the stage, in route order. */
	climbs: Climb[];
	/** Path to the GPX file for this stage, served from /static. */
	gpxPath?: string;
	/** True for summit finishes — drives the finish-analysis framing. */
	summitFinish?: boolean;
}

export interface EventMeta {
	slug: string;
	name: string;
	year: number;
	/** ISO date of stage 1 */
	startDate: string;
	/** ISO date of final stage */
	endDate: string;
	totalDistanceKm: number;
	totalElevationM: number;
	/** Number of teams on the startlist. Optional — omit rather than fabricate before it's official. */
	teamCount?: number;
	/** Number of riders on the startlist. Optional — omit rather than fabricate before it's official. */
	riderCount?: number;
	stages: Stage[];
	/** Rest days in date order. */
	restDays: RestDayMeta[];
}

export interface RestDayMeta {
	/** ISO date of the rest day */
	date: string;
	/** Where the race rests (region/town). Optional — omit rather than fabricate. */
	location?: string;
}

export const TYPE_LABELS: Record<StageType, string> = {
	ttt: 'Team time trial',
	itt: 'Individual time trial',
	flat: 'Flat',
	hills: 'Hilly',
	mountains: 'Mountain'
};

export const TYPE_SHORT: Record<StageType, string> = {
	ttt: 'TTT',
	itt: 'ITT',
	flat: 'Flat',
	hills: 'Hills',
	mountains: 'Mtn'
};
