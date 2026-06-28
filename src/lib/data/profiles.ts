// Accessor for build-time-generated profile JSON (scripts/build-profiles.ts writes
// src/lib/data/profiles/*.json). Uses import.meta.glob so a missing file simply isn't
// in the map — the caller falls back to synthesiseSeries(). Per-stage files are lazy
// (code-split: a stage page pulls only its own profile); previews are one small eager
// bundle for the index cards.

import type { ElePoint, EleScale } from '$lib/render/profile';
import type { LngLat } from '$lib/render/route';

/** A climb from the GPX waypoints (authored category + gradient).
 *  Metrics are null when the source GPX has a categorised summit but no paired
 *  komstart (e.g. stage 14 Grand Ballon) — we keep the climb but never fabricate
 *  the length/gradient it didn't ship. */
export interface ProfileClimb {
	name: string;
	rawName: string;
	category: 1 | 2 | 3 | 4 | 'hc';
	startKm: number;
	summitKm: number;
	lengthKm: number | null;
	avgGradient: number | null;
	/** Real ascent (m), GROSS cumulative gain over the resolved extent. Null when unmeasurable. */
	elevationGainM: number | null;
	summitElevation: number | null;
	/** How the extent was resolved: clean komstart / chain-extend / terrain walk-back. */
	mode: 'clean' | 'chain' | 'walk-back';
}

/** A sparse authored waypoint (sprint, feed, town, hazard …) kept for later features. */
export interface ProfileFeature {
	km: number;
	lat: number;
	lon: number;
	name: string;
	type: string;
}

/** On-disk per-stage profile. Coordinates stored compactly as [km, ele] / [lon, lat]. */
export interface StageProfileFile {
	stage: number;
	source: string;
	/** Derived distance (km), neutral rollout excluded. */
	distanceKm: number;
	/** Derived gain (m) over the same post-neutral segment. */
	elevationGainM: number;
	/** Trimmed neutral-rollout length (km). */
	neutralKm: number;
	minEleM: number;
	maxEleM: number;
	/** [km, ele] pairs — render series. */
	series: [number, number][];
	/** [lon, lat] pairs — route track for the map (GeoJSON coordinate order). */
	track: [number, number][];
	/** Categorised climbs from the roadbook waypoints. */
	climbs: ProfileClimb[];
	/** Uncategorised KOM tops — flagged for review, never auto-categorised. */
	uncategorisedKoms: { km: number; ele: number; name: string }[];
	/** Feature waypoints grouped by kind (held for timetable / where-to-watch). */
	features: Record<string, ProfileFeature[]>;
}

const fullLoaders = import.meta.glob<{ default: StageProfileFile }>('./profiles/stage-*.json');
const previewBundle = import.meta.glob<{ default: Record<string, [number, number][]> }>(
	'./profiles/previews.json',
	{ eager: true }
);

const previews: Record<string, [number, number][]> =
	Object.values(previewBundle)[0]?.default ?? {};

const scaleBundle = import.meta.glob<{ default: EleScale }>('./profiles/scale.json', {
	eager: true
});

/**
 * The shared cross-stage elevation scale (build-time, from scale.json). Every profile
 * renders against this so stage shapes are comparable. Falls back to a sane TdF-ish range
 * if the file is somehow absent (keeps render alive; build always writes it).
 */
export const eleScale: EleScale = Object.values(scaleBundle)[0]?.default ?? {
	baseEleM: 0,
	peakEleM: 2650
};

function toSeries(pairs: [number, number][]): ElePoint[] {
	return pairs.map(([km, ele]) => ({ km, ele }));
}

/** Full generated profile for a stage, or null if no GPX-derived file exists. */
export async function loadStageProfile(n: number): Promise<StageProfileFile | null> {
	const loader = fullLoaders[`./profiles/stage-${n}.json`];
	if (!loader) return null;
	return (await loader()).default;
}

export interface StageRender {
	/** Render series for the elevation profile. */
	series: ElePoint[];
	/** [lon, lat] route track for the map. */
	track: LngLat[];
	/** Categorised climbs derived from the GPX roadbook waypoints. */
	climbs: ProfileClimb[];
	/** Uncategorised KOM tops — count only, flagged for review (never auto-categorised). */
	uncategorisedKomCount: number;
}

/** Render data (profile series + map track + climbs) for a stage, or null → synthesise fallback. */
export async function loadStageRender(n: number): Promise<StageRender | null> {
	const profile = await loadStageProfile(n);
	if (!profile) return null;
	return {
		series: toSeries(profile.series),
		track: profile.track,
		climbs: profile.climbs,
		uncategorisedKomCount: profile.uncategorisedKoms.length
	};
}

/** Small preview series for an index card, or null to trigger synthesise fallback. */
export function previewSeries(n: number): ElePoint[] | null {
	const pairs = previews[String(n)];
	return pairs ? toSeries(pairs) : null;
}
