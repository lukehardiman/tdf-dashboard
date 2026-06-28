import { describe, it, expect } from 'vitest';
import {
	classifySectorType,
	classifyTTSectors,
	CLIMB_MIN_GRADIENT,
	DESCENT_MIN_GRADIENT,
	TECH_TURN_PER_KM,
	type SectorType
} from './ttSectors';
import type { ElePoint } from './profile';
import type { LngLat } from './curvature';

describe('classifySectorType: demand-type rules', () => {
	it('a real up-gradient is a climb', () => {
		expect(classifySectorType(CLIMB_MIN_GRADIENT, 0)).toBe('climb');
		expect(classifySectorType(8, 600)).toBe('climb'); // climb wins even when twisty
	});
	it('a sustained descent is its own descent type', () => {
		expect(classifySectorType(-DESCENT_MIN_GRADIENT, 0)).toBe('descent');
		expect(classifySectorType(-8, 600)).toBe('descent'); // downhill wins over twistiness
	});
	it('a twisty but flat stretch is corners', () => {
		expect(classifySectorType(0, TECH_TURN_PER_KM)).toBe('corners');
	});
	it('flat and straight is power', () => {
		expect(classifySectorType(0, 50)).toBe('power');
		expect(classifySectorType(CLIMB_MIN_GRADIENT - 0.1, TECH_TURN_PER_KM - 1)).toBe('power');
	});
});

// Build a course: 0–5 km climb @5%, 5–10 km descent @−6%, 10–15 km flat. Straight track (no turns).
function syntheticCourse(): { series: ElePoint[]; track: LngLat[] } {
	const series: ElePoint[] = [];
	const track: LngLat[] = [];
	let ele = 100;
	for (let i = 0; i <= 150; i++) {
		const km = i * 0.1;
		if (km <= 5) ele = 100 + km * 50; // +5%
		else if (km <= 10) ele = 350 - (km - 5) * 60; // −6%
		else ele = 50;
		series.push({ km, ele });
		track.push([km * 0.009, 0]); // due east, straight → ~0 curvature
	}
	return { series, track };
}

describe('classifyTTSectors: segmentation', () => {
	it('splits climb / descent / power on a straight course', () => {
		const { series, track } = syntheticCourse();
		const sectors = classifyTTSectors(series, track, { minSectorKm: 1 });
		expect(sectors.map((s) => s.type)).toEqual(['climb', 'descent', 'power']);
		expect(sectors[0].fromKm).toBeCloseTo(0, 1);
		expect(sectors[2].toKm).toBeCloseTo(15, 1);
	});

	it('falls back to gradient-only when no track is supplied (descent still detected)', () => {
		const { series } = syntheticCourse();
		const sectors = classifyTTSectors(series, null, { minSectorKm: 1 });
		expect(sectors.map((s) => s.type)).toEqual(['climb', 'descent', 'power']);
	});

	it('marks a flat but twisty course as corners via curvature', () => {
		const series: ElePoint[] = [];
		const track: LngLat[] = [];
		for (let i = 0; i <= 80; i++) {
			series.push({ km: i * 0.1, ele: 100 }); // dead flat
			// tight zigzag at ~0.1 km spacing → high heading change per km
			track.push([i * 0.0009, (i % 2 ? 1 : -1) * 0.0004]);
		}
		const sectors = classifyTTSectors(series, track, { minSectorKm: 1 });
		expect(sectors.every((s) => s.type === 'corners')).toBe(true);
	});

	it('keeps a short summit descent separate — the climb sector ends at the summit, never over the descent', () => {
		// 0–9 km climb @5%, then a SHORT 1 km descent @−6% to the line. The descent is under the
		// 1.5 km floor, so the old absorb step folded it into the climb (red climb band over a
		// descent). It must now survive as its own technical sector.
		const series: ElePoint[] = [];
		for (let i = 0; i <= 100; i++) {
			const km = i * 0.1;
			const ele = km <= 9 ? 100 + km * 50 : 550 - (km - 9) * 60;
			series.push({ km, ele });
		}
		const sectors = classifyTTSectors(series, null); // default 1.5 km floor
		const climb = sectors.find((s) => s.type === 'climb')!;
		expect(climb).toBeTruthy();
		expect(climb.toKm).toBeLessThanOrEqual(9.6); // climb does not bleed past the ~9 km summit
		const last = sectors[sectors.length - 1];
		expect(last.type).toBe('descent'); // the descent is its own sector
		expect(last.avgGradient).toBeLessThan(-DESCENT_MIN_GRADIENT);
	});

	it('absorbs sub-threshold sectors so the course does not fragment', () => {
		const { series, track } = syntheticCourse();
		const coarse = classifyTTSectors(series, track, { minSectorKm: 6 });
		// With a 6 km floor, the 5 km sectors must merge — fewer than the raw three.
		expect(coarse.length).toBeLessThan(3);
		expect(coarse.every((s) => s.lengthKm >= 5)).toBe(true);
	});
});

// Regression off the built JSON: the two real TT stages must classify sensibly.
type ProfileJson = { stage: number; series: [number, number][]; track: [number, number][] };
const modules = import.meta.glob<{ default: ProfileJson }>('../data/profiles/stage-*.json', { eager: true });
const byStage = new Map<number, ProfileJson>(Object.values(modules).map((m) => [m.default.stage, m.default]));
const sectorsFor = (n: number) => {
	const p = byStage.get(n)!;
	return classifyTTSectors(
		p.series.map(([km, ele]) => ({ km, ele })),
		p.track as LngLat[]
	);
};

describe('classifyTTSectors: real TT stages', () => {
	it('S16 ITT opens on the climb, then a genuine technical descent off the summit', () => {
		const sectors = sectorsFor(16);
		const types = sectors.map((s) => s.type);
		expect(types[0]).toBe('climb'); // opens on the Côte de Larringes
		// The decisive demand is the descent off the top — sustained, downhill, with hairpins.
		// (The run-in has only a couple of isolated corners, not a sustained twisty sequence, so it
		// honestly reads as 'power' rather than a 'corners' band.)
		expect(types).toContain('descent');
		// adjacent same-type sectors must be coalesced (no two of a kind in a row)
		expect(types.every((t, i) => i === 0 || t !== types[i - 1])).toBe(true);
		const desc = sectors.filter((s) => s.type === 'descent').sort((a, b) => b.lengthKm - a.lengthKm)[0];
		expect(desc.avgGradient).toBeLessThan(-3);
		// the opening climb ends AT its summit (~10.5 km) — the descent off it is the next sector,
		// never inside the red climb band.
		expect(sectors[0].toKm).toBeLessThan(11.5);
		expect(sectors[1].type).toBe('descent');
	});

	it('S1 TTT (Barcelona) is dominated by power/technical, not climbing', () => {
		const sectors = sectorsFor(1);
		const climbKm = sectors.filter((s) => s.type === 'climb').reduce((a, s) => a + s.lengthKm, 0);
		const total = sectors.reduce((a, s) => a + s.lengthKm, 0);
		expect(climbKm / total).toBeLessThan(0.25); // a flat city TTT, not a mountain TT
	});
});
