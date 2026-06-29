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

import { elevationAtKm, type ElePoint } from './profile.ts';
import type { StageType } from '../data/types';

export type FinishArchetype = 'tt' | 'summit' | 'climb-runin' | 'punchy' | 'flat';

/** The minimum facts needed to classify a finish. Kept primitive so the classifier is pure. */
export interface FinishFacts {
	discipline: 'mass-start' | 'itt' | 'ttt';
	/** Stage length (km) on the SAME reference as the climb summit positions (post-neutral). */
	distanceKm: number;
	/** The last categorised climb (max summitKm), or null if the stage has none. */
	finalClimb: { category: 1 | 2 | 3 | 4 | 'hc'; summitKm: number } | null;
	/** Average gradient (%, signed) over the final ~500 m to the line — detects an uphill kick.
	 *  500 m (not 2 km) is the stretch that actually decides a finish: a 2 km mean washes the kick
	 *  out (it reads ~1% when the last 500 m ramps at 4%). 500 m is also the honest floor for the
	 *  served ~560 m-spaced series — finer windows would be false precision. */
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
/** Punchy: a SELECTIVE uphill kick to the line — at least this average gradient over the final
 *  ~500 m (E). 5% is the puncheur floor: a 2–5% closing ramp is a "drag" (sapping but not
 *  selective — stays flat/D, described as an "uphill drag"); 5%+ is a kick that splits the group.
 *  Measured over 500 m, not 2 km, so the steepness is read where the finish is decided, not diluted
 *  by a long average. (Signed-off table is unchanged by this: stage 3 = 7.3% over 500 m stays
 *  punchy; no flat stage reaches 5% over its final 500 m, so none promotes.) */
export const PUNCHY_MIN_GRADIENT = 5.0;

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
		// Final 500 m, not the default 2 km — see FinishFacts.finishRampGradient / PUNCHY_MIN_GRADIENT.
		finishRampGradient: finishRampGradient(input.series, 0.5)
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

// ---- Finish-map / decisive-zone WINDOW (shared by the build artifact and the component) ----
/** Sprint (D) decisive-zone frame: the final this many km to the line. Also the FlatFinishDetail
 *  frame, so the map and that profile show the same distance. */
export const FLAT_FINISH_FRAME_KM = 5;
/** A climb + run-in (C) counts as a "technical descent to the line" — and so earns a plan-view
 *  finish map — when the line sits at least this far (m) below the decisive climb's summit. */
export const FINISH_DESCENT_DROP_M = 30;

/** Decisive-zone input — like classifyStageFinish's, but the climbs carry the extra geometry the
 *  window needs (a climb's base and summit elevation). */
export interface DecisiveZoneInput {
	type: StageType;
	distanceKm: number;
	climbs: {
		category: 1 | 2 | 3 | 4 | 'hc';
		startKm: number;
		summitKm: number;
		summitElevation?: number | null;
	}[];
	series: ElePoint[];
}

/**
 * The decisive-zone window (km) the finish MAP should frame — IDENTICAL to the decisive-zone
 * PROFILE's window, so the two views always show the same distance — or 0 when this archetype
 * shows no map. The window is archetype-dependent:
 *   D flat        → the final {@link FLAT_FINISH_FRAME_KM} km (sprint run-in)
 *   C climb-runin → from the decisive climb's BASE to the line (can be 25 km+, e.g. S20 Sarenne→
 *                   Alpe d'Huez ≈ 27 km) — but only when it DESCENDS to the line (corners decide
 *                   it); a non-descending run-in has its gradient story told by the profile alone.
 *   B summit / E punchy / A tt → 0 (no plan-view map; the gradient/course story suffices).
 *
 * Single source of truth: scripts/build-profiles.ts sizes the emitted dense finishTrack to this,
 * and FinishZoom slices the map to this — so map and profile can never drift.
 */
export function finishMapWindowKm(input: DecisiveZoneInput): number {
	const archetype = classifyFinish(finishFactsFor(input));
	if (archetype === 'flat') return FLAT_FINISH_FRAME_KM;
	if (archetype === 'climb-runin' && input.climbs.length && input.series.length) {
		const fc = input.climbs.reduce((a, b) => (b.summitKm > a.summitKm ? b : a));
		const finishEle = elevationAtKm(input.series, input.series[input.series.length - 1].km);
		const summitEle = fc.summitElevation ?? elevationAtKm(input.series, fc.summitKm);
		if (finishEle < summitEle - FINISH_DESCENT_DROP_M) return input.distanceKm - fc.startKm;
	}
	return 0;
}
