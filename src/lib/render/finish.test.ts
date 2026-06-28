import { describe, it, expect } from 'vitest';
import {
	classifyFinish,
	classifyStageFinish,
	finishRampGradient,
	SUMMIT_FINISH_KM,
	RUNIN_MAX_KM,
	PUNCHY_MIN_GRADIENT,
	type FinishFacts,
	type FinishArchetype
} from './finish';
import type { ElePoint } from './profile';
import { tdf2026 } from '../data/tdf2026';

// Minimal facts for the pure classifier — only the fields it reads.
const facts = (over: Partial<FinishFacts>): FinishFacts => ({
	discipline: 'mass-start',
	distanceKm: 180,
	finalClimb: null,
	finishRampGradient: 0,
	...over
});

describe('classifyFinish: archetype rules', () => {
	it('A — time trials short-circuit to tt regardless of terrain', () => {
		expect(classifyFinish(facts({ discipline: 'itt', finalClimb: { category: 'hc', summitKm: 180 } }))).toBe('tt');
		expect(classifyFinish(facts({ discipline: 'ttt' }))).toBe('tt');
	});

	it('B — Cat 2+ cresting at the line is a summit finish', () => {
		expect(classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 'hc', summitKm: 180 } }))).toBe('summit');
		expect(classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 2, summitKm: 179 } }))).toBe('summit');
	});

	it('B requires Cat 2 or harder — a Cat 3 at the line is NOT summit', () => {
		// Cat 3 kick at the line falls through to punchy (if ramp) — not the hero-climb treatment.
		const r = classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 3, summitKm: 180 }, finishRampGradient: 6 }));
		expect(r).not.toBe('summit');
		expect(r).toBe('punchy');
	});

	it('C — Cat 3+ cresting 2–15 km out is climb + run-in', () => {
		expect(classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 3, summitKm: 175 } }))).toBe('climb-runin');
		expect(classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 'hc', summitKm: 166 } }))).toBe('climb-runin');
	});

	it('C — a real climb beyond the run-in cap drops to a flat finish', () => {
		// Cat 1 thirty km out: too far from the line to be a finish-zoom climb → flat. (Stages 4 & 13;
		// the late climb is noted descriptively on the main profile, never as a predicted outcome.)
		expect(classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 1, summitKm: 150 } }))).toBe('flat');
	});

	it('E — an uphill kick with no Cat 2+ climb at the line is punchy', () => {
		expect(classifyFinish(facts({ finalClimb: { category: 4, summitKm: 178 }, finishRampGradient: 5 }))).toBe('punchy');
		expect(classifyFinish(facts({ finalClimb: null, finishRampGradient: 4 }))).toBe('punchy');
	});

	it('D — flat finish with no decisive climb is the catch-all', () => {
		expect(classifyFinish(facts({ finalClimb: { category: 4, summitKm: 140 }, finishRampGradient: 0.2 }))).toBe('flat');
		expect(classifyFinish(facts({ finalClimb: null, finishRampGradient: -1 }))).toBe('flat');
	});
});

describe('classifyFinish: threshold boundaries (locks the tunables)', () => {
	it(`summit-finish cutoff at exactly ${SUMMIT_FINISH_KM} km`, () => {
		const at = (toLine: number) =>
			classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 2, summitKm: 180 - toLine } }));
		expect(at(SUMMIT_FINISH_KM)).toBe('summit'); // ≤ 2 km → summit
		expect(at(SUMMIT_FINISH_KM + 0.1)).toBe('climb-runin'); // just past → run-in
	});

	it(`run-in cap at exactly ${RUNIN_MAX_KM} km`, () => {
		const at = (toLine: number) =>
			classifyFinish(facts({ distanceKm: 180, finalClimb: { category: 1, summitKm: 180 - toLine } }));
		expect(at(RUNIN_MAX_KM)).toBe('climb-runin'); // ≤ 15 km → still C
		expect(at(RUNIN_MAX_KM + 0.1)).toBe('flat'); // past → D
	});

	it(`punchy ramp floor at exactly ${PUNCHY_MIN_GRADIENT}%`, () => {
		expect(classifyFinish(facts({ finishRampGradient: PUNCHY_MIN_GRADIENT }))).toBe('punchy');
		expect(classifyFinish(facts({ finishRampGradient: PUNCHY_MIN_GRADIENT - 0.1 }))).toBe('flat');
	});
});

describe('finishRampGradient', () => {
	it('measures the average slope over the final 2 km', () => {
		// +160 m over the last 2 km = +8%.
		const series: ElePoint[] = Array.from({ length: 100 }, (_, i) => ({ km: i, ele: i * 80 }));
		expect(finishRampGradient(series, 2)).toBeCloseTo(8, 1);
	});
	it('is negative when the road drops to the line', () => {
		const series: ElePoint[] = Array.from({ length: 100 }, (_, i) => ({ km: i, ele: 1000 - i * 5 }));
		expect(finishRampGradient(series, 2)).toBeLessThan(0);
	});
});

// ---- Regression: the SIGNED-OFF classification for all 21 stages, from the built JSON ----
// Locks the whole table (A=2 B=4 C=4 D=10 E=1) so a future threshold/data change can't silently
// reshuffle archetypes. Same pattern as climbs.regression.test.ts.
type ProfileJson = { stage: number; distanceKm: number; series: [number, number][]; climbs: { category: 1 | 2 | 3 | 4 | 'hc'; summitKm: number }[] };
const modules = import.meta.glob<{ default: ProfileJson }>('../data/profiles/stage-*.json', { eager: true });
const byStage = new Map<number, ProfileJson>(Object.values(modules).map((m) => [m.default.stage, m.default]));

// Signed-off 2026 table (see classifier sign-off): geometry beats the summitFinish flag.
const EXPECTED: Record<number, FinishArchetype> = {
	1: 'tt', // TTT
	2: 'climb-runin', // Montjuïc — C3 2.3 km out
	3: 'punchy', // Les Angles — 1.7 km / 6.5% kick (verified; not an official summit finish)
	4: 'flat', // C2 35 km out — too far for a finish-zoom; late climb noted on main profile
	5: 'flat',
	6: 'summit', // C2 at the line
	7: 'flat',
	8: 'flat',
	9: 'flat',
	10: 'climb-runin', // Le Lioran — C3 2.6 km out
	11: 'flat',
	12: 'flat',
	13: 'flat', // C1 30 km out — too far for a finish-zoom; late climb noted on main profile
	14: 'climb-runin', // Le Markstein — C1 (Haag) 5.7 km out
	15: 'summit', // HC at the line
	16: 'tt', // ITT
	17: 'flat',
	18: 'summit', // C1 at the line
	19: 'summit', // Alpe d'Huez (real ascent) at the line
	20: 'climb-runin', // Alpe d'Huez via Sarenne — HC 14 km out, descent+kick to line
	21: 'flat' // Paris — 3× Montmartre (C4) then a flat run-in to the line
};

describe('classifier regression: signed-off 2026 table (from built JSON)', () => {
	for (const stage of tdf2026.stages) {
		const n = stage.n;
		it(`stage ${n} → ${EXPECTED[n]}`, () => {
			const p = byStage.get(n);
			expect(p, `stage ${n} profile JSON present`).toBeTruthy();
			const got = classifyStageFinish({
				type: stage.type,
				distanceKm: p!.distanceKm,
				climbs: p!.climbs,
				series: p!.series.map(([km, ele]) => ({ km, ele }))
			});
			expect(got).toBe(EXPECTED[n]);
		});
	}

	it('the archetype tally matches the signed-off split (A=2 B=4 C=4 D=10 E=1)', () => {
		const tally: Record<FinishArchetype, number> = { tt: 0, summit: 0, 'climb-runin': 0, punchy: 0, flat: 0 };
		for (const stage of tdf2026.stages) {
			const p = byStage.get(stage.n)!;
			tally[
				classifyStageFinish({
					type: stage.type,
					distanceKm: p.distanceKm,
					climbs: p.climbs,
					series: p.series.map(([km, ele]) => ({ km, ele }))
				})
			]++;
		}
		expect(tally).toEqual({ tt: 2, summit: 4, 'climb-runin': 4, flat: 10, punchy: 1 });
	});
});
