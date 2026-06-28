// Framework-free finish/decisive-zone CLASSIFIER.
//
// Cycling viewership is back-weighted — the finale is what most people came for. Each stage
// gets one data-driven "where the race is decided" view, and the treatment differs by stage.
// This module is the intelligence: it reads facts already in our data and sorts each stage
// into ONE of five archetypes. The renderers (later) are dumb; the classifier is smart. A new
// Tour runs the same classifier over new stages → correct treatment, zero bespoke work.
//
// PRINCIPLE: finish GEOMETRY drives classification — is the line at a summit? is there a climb
// near the end? how far from climb-top to line? Typology / the hand-authored summitFinish flag
// are corroboration only, NEVER an override. (That's why S20 — Alpe d'Huez *via* Col de Sarenne,
// where the decisive HC tops 14 km out and the road then descends to the line — is climb-runin,
// not summit: the classifier beats the human flag.)
//
// The archetypes describe TERRAIN GEOMETRY, never RACING OUTCOMES. "summit" = where the line
// sits, not who wins. "flat" = a flat finish with no decisive late climb, NOT a predicted bunch
// sprint. Whether a break stays away is unknowable from the parcours — it turns on GC context,
// time gaps and which teams chase, none of which is in the elevation. So we never label a stage
// by a result we can't read off the terrain. Keep every label geometric.
//
// No Svelte imports — pure + unit-tested in isolation. Signed-off classification for TdF 2026 is
// locked by finish.test.ts against the built profile JSON.

import { elevationAtKm, type ElePoint } from './profile';
import type { StageType } from '../data/types';

export type FinishArchetype = 'tt' | 'summit' | 'climb-runin' | 'punchy' | 'flat';

/** The minimum facts needed to classify a finish. Kept primitive so the classifier is pure. */
export interface FinishFacts {
	discipline: 'mass-start' | 'itt' | 'ttt';
	/** Stage length (km) on the SAME reference as the climb summit positions (post-neutral). */
	distanceKm: number;
	/** The last categorised climb (max summitKm), or null if the stage has none. */
	finalClimb: { category: 1 | 2 | 3 | 4 | 'hc'; summitKm: number } | null;
	/** Average gradient (%, signed) over the final ~2 km to the line — detects an uphill kick. */
	finishRampGradient: number;
}

// ---- Thresholds (tunable; the signed-off table in finish.test.ts pins the resulting split) ----
/** Summit finish: the last climb tops within this distance of the line (B). */
export const SUMMIT_FINISH_KM = 2.0;
/** Climb + run-in: the decisive climb must crest within this of the line to still be a "finish"
 *  zoom (C). Beyond it the bunch usually regroups → sprint/flat (D). NOTE: stages 4 (C2, 35 km
 *  out) and 13 (C1, 30 km out) are the long-range-breakaway stages that fall to D here by design
 *  — their late-hill story is carried by the MAIN profile's decisive-zone shading, not the
 *  finish-zoom. They are the candidate stages if a "long-range breakaway" D-variant is added. */
export const RUNIN_MAX_KM = 15.0;
/** Punchy: an uphill kick to the line of at least this average gradient over the final 2 km (E). */
export const PUNCHY_MIN_GRADIENT = 3.0;

/** Severity rank, hardest → easiest: HC=5, Cat 1=4, Cat 2=3, Cat 3=2, Cat 4=1. */
function rank(category: 1 | 2 | 3 | 4 | 'hc'): number {
	return category === 'hc' ? 5 : 5 - category;
}

/**
 * Sort a stage finish into one of five archetypes. Evaluate in order; first match wins:
 *   A tt          — discipline is a time trial (whole course is the story, no single moment)
 *   B summit      — last climb (Cat 2+) tops AT the line → the climb IS the finish
 *   C climb-runin — last climb (Cat 3+) tops 2–15 km out → decisive climb + run-in to the line
 *   E punchy      — short uphill kick to the line, but no Cat 2+ climb at the line
 *   D flat        — flat finish, no decisive late climb (catch-all). NOT a predicted sprint.
 */
export function classifyFinish(f: FinishFacts): FinishArchetype {
	if (f.discipline === 'itt' || f.discipline === 'ttt') return 'tt';

	const fc = f.finalClimb;
	const toLine = fc ? f.distanceKm - fc.summitKm : Infinity;

	if (fc && toLine <= SUMMIT_FINISH_KM && rank(fc.category) >= 3) return 'summit';
	if (fc && rank(fc.category) >= 2 && toLine > SUMMIT_FINISH_KM && toLine <= RUNIN_MAX_KM)
		return 'climb-runin';
	if (f.finishRampGradient >= PUNCHY_MIN_GRADIENT) return 'punchy';
	return 'flat';
}

const DISCIPLINE: Record<StageType, FinishFacts['discipline']> = {
	ttt: 'ttt',
	itt: 'itt',
	flat: 'mass-start',
	hills: 'mass-start',
	mountains: 'mass-start'
};

/** Average gradient (%, signed) over the final `km` of a series. */
export function finishRampGradient(series: ElePoint[], km = 2): number {
	if (series.length < 2) return 0;
	const end = series[series.length - 1].km;
	const lo = Math.max(0, end - km);
	const distM = (end - lo) * 1000;
	if (distM <= 0) return 0;
	return ((elevationAtKm(series, end) - elevationAtKm(series, lo)) / distM) * 100;
}

/** Build the classifier facts from a stage's type + its derived profile data. */
export function finishFactsFor(input: {
	type: StageType;
	distanceKm: number;
	climbs: { category: 1 | 2 | 3 | 4 | 'hc'; summitKm: number }[];
	series: ElePoint[];
}): FinishFacts {
	const finalClimb = input.climbs.length
		? input.climbs.reduce((a, b) => (b.summitKm > a.summitKm ? b : a))
		: null;
	return {
		discipline: DISCIPLINE[input.type],
		distanceKm: input.distanceKm,
		finalClimb: finalClimb ? { category: finalClimb.category, summitKm: finalClimb.summitKm } : null,
		finishRampGradient: finishRampGradient(input.series)
	};
}

/** Convenience: classify straight from stage type + profile data. */
export function classifyStageFinish(input: {
	type: StageType;
	distanceKm: number;
	climbs: { category: 1 | 2 | 3 | 4 | 'hc'; summitKm: number }[];
	series: ElePoint[];
}): FinishArchetype {
	return classifyFinish(finishFactsFor(input));
}
