import { describe, it, expect } from 'vitest';
import { bandClimb, gradientSeverity, type Severity } from './climbBanding';
import type { ElePoint } from './profile';

describe('gradientSeverity: ramp thresholds', () => {
	const cases: [number, Severity][] = [
		[-2, 'descent'],
		[0, 'green'],
		[3.9, 'green'],
		[4, 'blue'],
		[5.9, 'blue'],
		[6, 'yellow'],
		[7.9, 'yellow'],
		[8, 'orange'],
		[9.9, 'orange'],
		[10, 'red'],
		[14.9, 'red'],
		[15, 'black'],
		[22, 'black']
	];
	for (const [pct, sev] of cases) {
		it(`${pct}% → ${sev}`, () => expect(gradientSeverity(pct)).toBe(sev));
	}
});

describe('bandClimb: segmentation from real GPX delta', () => {
	// A clean 10 km climb at a constant 8% (80 m per km), foot at km 5.
	const series: ElePoint[] = Array.from({ length: 301 }, (_, i) => {
		const km = i * 0.1;
		return { km, ele: km <= 5 ? 100 : 100 + (km - 5) * 80 };
	});

	it('bins the resolved extent into per-km segments', () => {
		const bins = bandClimb(series, 5, 15, 1);
		expect(bins).toHaveLength(10);
		expect(bins[0].startKm).toBeCloseTo(5, 5);
		expect(bins[bins.length - 1].endKm).toBeCloseTo(15, 5);
		// fromFoot labels run 0,1,2…
		expect(bins.map((b) => Math.round(b.fromFootKm))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it('computes each bin gradient from the elevation delta', () => {
		const bins = bandClimb(series, 5, 15, 1);
		for (const b of bins) expect(b.gradientPct).toBeCloseTo(8, 1);
		expect(bins.every((b) => b.severity === 'orange')).toBe(true); // 8% → orange band
	});

	it('respects a finer bin size', () => {
		const bins = bandClimb(series, 5, 15, 0.5);
		expect(bins).toHaveLength(20);
		expect(bins.every((b) => Math.abs(b.lengthKm - 0.5) < 1e-6)).toBe(true);
	});

	it('handles a short remainder bin without overshooting the summit', () => {
		const bins = bandClimb(series, 5, 12.4, 1);
		expect(bins).toHaveLength(8); // 7 full + 0.4 remainder
		const last = bins[bins.length - 1];
		expect(last.lengthKm).toBeCloseTo(0.4, 5);
		expect(last.endKm).toBeCloseTo(12.4, 5);
	});

	it('returns nothing for a degenerate extent', () => {
		expect(bandClimb(series, 10, 10, 1)).toEqual([]);
		expect(bandClimb(series, 10, 5, 1)).toEqual([]);
	});

	it('marks a descent segment neutral', () => {
		const down: ElePoint[] = Array.from({ length: 101 }, (_, i) => ({ km: i * 0.1, ele: 1000 - i }));
		const bins = bandClimb(down, 0, 10, 1);
		expect(bins.every((b) => b.severity === 'descent')).toBe(true);
	});
});

// Lock the failure mode the spec called out: band the RESOLVED extent, not the komstart.
describe('bandClimb: bands the resolver-resolved extent (Croix de Fer, from built JSON)', () => {
	const modules = import.meta.glob<{ default: { climbs: { name: string; startKm: number; summitKm: number; lengthKm: number; avgGradient: number }[]; series: [number, number][] } }>(
		'../data/profiles/stage-20.json',
		{ eager: true }
	);
	const s20 = Object.values(modules)[0].default;
	const series: ElePoint[] = s20.series.map(([km, ele]) => ({ km, ele }));
	const cdf = s20.climbs.find((c) => c.name.includes('Croix de Fer'))!;

	it('spans the full chain-resolved ~24 km, not the 5.1 km komstart truncation', () => {
		const bins = bandClimb(series, cdf.startKm, cdf.summitKm, 1);
		const total = bins.reduce((s, b) => s + b.lengthKm, 0);
		expect(total).toBeCloseTo(cdf.lengthKm, 1);
		expect(total).toBeGreaterThan(20); // unmistakably the full climb, not 5.1 km
		expect(bins[0].startKm).toBeCloseTo(cdf.startKm, 2);
		expect(bins[bins.length - 1].endKm).toBeCloseTo(cdf.summitKm, 2);
	});

	it('length-weighted mean of bin gradients matches the climb average (~5.3%)', () => {
		const bins = bandClimb(series, cdf.startKm, cdf.summitKm, 1);
		const weighted = bins.reduce((s, b) => s + b.gradientPct * b.lengthKm, 0) / cdf.lengthKm;
		expect(weighted).toBeCloseTo(cdf.avgGradient, 0); // within ~1%
	});
});
