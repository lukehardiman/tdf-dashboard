import { describe, it, expect } from 'vitest';
import {
	synthesiseSeries,
	buildGeometry,
	gradientAtKm,
	elevationAtKm,
	layoutClimbMarkers,
	eleProjection,
	SCALE_TOP_FILL,
	MIN_GLOBAL_SPAN_M,
	MIN_FLAT_AMPLITUDE_FRAC,
	type ClimbMarkerInput,
	type ElePoint,
	type EleScale
} from './profile';
import { tdf2026 } from '../data/tdf2026';

const stage20 = tdf2026.stages[19]; // queen stage, has climbs

describe('render: synthesiseSeries', () => {
	it('produces the requested number of samples', () => {
		expect(synthesiseSeries(stage20, 200)).toHaveLength(200);
	});

	it('is deterministic for a given stage', () => {
		const a = synthesiseSeries(stage20, 50);
		const b = synthesiseSeries(stage20, 50);
		expect(a).toEqual(b);
	});

	it('spans from 0 to stage distance', () => {
		const s = synthesiseSeries(stage20, 100);
		expect(s[0].km).toBe(0);
		expect(s[s.length - 1].km).toBeCloseTo(stage20.distanceKm, 1);
	});

	it('never produces negative elevation', () => {
		const s = synthesiseSeries(stage20, 200);
		expect(s.every((p) => p.ele >= 0)).toBe(true);
	});
});

describe('render: buildGeometry', () => {
	it('emits valid SVG paths', () => {
		const series = synthesiseSeries(stage20, 100);
		const geo = buildGeometry(stage20, series, 800, 240);
		expect(geo.linePath.startsWith('M')).toBe(true);
		expect(geo.areaPath.endsWith('Z')).toBe(true);
		expect(geo.width).toBe(800);
		expect(geo.height).toBe(240);
	});

	it('emits one marker per climb', () => {
		const series = synthesiseSeries(stage20, 100);
		const geo = buildGeometry(stage20, series, 800, 240);
		expect(geo.markers).toHaveLength(stage20.climbs.length);
	});

	it('marks HC climbs with HC label', () => {
		const series = synthesiseSeries(stage20, 100);
		const geo = buildGeometry(stage20, series, 800, 240);
		const galibier = geo.markers.find((m) => m.name.includes('Galibier'));
		expect(galibier?.category).toBe('HC');
	});
});

describe('render: layoutClimbMarkers (collision handling)', () => {
	const pad = { top: 48, right: 16, bottom: 30, left: 16 };
	const opts = { width: 1040, height: 210, pad };
	// Flat 170km series, just enough to scale x/y against.
	const series: ElePoint[] = Array.from({ length: 171 }, (_, i) => ({ km: i, ele: 100 + i }));

	const at = (km: number, category: ClimbMarkerInput['category']): ClimbMarkerInput => ({
		summitKm: km,
		category,
		name: `Climb ${km}`
	});

	function noSameTierOverlap(markers: ReturnType<typeof layoutClimbMarkers>, boxHalf = 13) {
		for (let i = 0; i < markers.length; i++) {
			for (let j = i + 1; j < markers.length; j++) {
				if (markers[i].tier === markers[j].tier) {
					expect(Math.abs(markers[i].x - markers[j].x)).toBeGreaterThanOrEqual(boxHalf * 2);
				}
			}
		}
	}

	it('returns nothing for no climbs', () => {
		expect(layoutClimbMarkers([], series, opts)).toEqual([]);
	});

	it('two far-apart climbs sit on tier 0 and keep their names', () => {
		const m = layoutClimbMarkers([at(30, 2), at(140, 1)], series, opts);
		expect(m.map((x) => x.tier)).toEqual([0, 0]);
		expect(m.every((x) => x.showName)).toBe(true);
	});

	it('clustered climbs stagger onto higher tiers without overlapping', () => {
		// Five summits ~4km apart — closer than a box-width, so naive placement overlaps.
		const m = layoutClimbMarkers([at(100, 1), at(104, 2), at(108, 3), at(112, 4), at(116, 1)], series, opts);
		expect(Math.max(...m.map((x) => x.tier))).toBeGreaterThan(0);
		noSameTierOverlap(m);
		// Crowded → names suppressed to avoid soup.
		expect(m.every((x) => !x.showName)).toBe(true);
	});

	it('handles the densest real stage (10, seven climbs) cleanly', () => {
		const climbs: ClimbMarkerInput[] = [
			at(40, 3), at(60, 2), at(80, 3), at(100, 3), at(120, 1), at(140, 1), at(150, 3)
		];
		const m = layoutClimbMarkers(climbs, series, opts);
		expect(m).toHaveLength(7);
		noSameTierOverlap(m);
		// Boxes stay within the frame horizontally.
		for (const x of m) {
			expect(x.boxX).toBeGreaterThanOrEqual(pad.left + 13);
			expect(x.boxX).toBeLessThanOrEqual(opts.width - pad.right - 13);
		}
	});

	it('maps categories to box labels (hc → HC)', () => {
		const m = layoutClimbMarkers([at(50, 'hc'), at(120, 4)], series, opts);
		expect(m[0].category).toBe('HC');
		expect(m[1].category).toBe('4');
	});

	it('anchors names edge-aware so they never clip the frame', () => {
		// A long-named climb at the very end (summit finish) must right-anchor so the name
		// stays inside; the same name mid-frame stays centred; at the start it left-anchors.
		const longName = 'Plateau de Solaison Brison';
		const mk = (km: number) => layoutClimbMarkers([{ summitKm: km, category: 'hc', name: longName }], series, opts)[0];

		const right = mk(170); // far right
		expect(right.nameAnchor).toBe('end');
		// Right-anchored at boxX, the name extends left → its right edge stays within the frame.
		expect(right.boxX).toBeLessThanOrEqual(opts.width - pad.right);

		const left = mk(0); // far left
		expect(left.nameAnchor).toBe('start');

		const middle = mk(85); // centre — plenty of room both sides
		expect(middle.nameAnchor).toBe('middle');
	});
});

describe('render: shared elevation scale (cross-stage comparability)', () => {
	const height = 210;
	const pad = { top: 48, right: 16, bottom: 30, left: 16 };
	const innerH = height - pad.top - pad.bottom; // 132
	const bottom = pad.top + innerH; // 180
	const scale: EleScale = { baseEleM: 0, peakEleM: 2000 };

	// Lowest point (top of profile area in y terms) of a built line — the smallest y value.
	const lineTop = (path: string) =>
		Math.min(...[...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => parseFloat(m[2])));

	it('projects the shared baseline to the chart floor and the global peak to TOP_FILL', () => {
		const y = eleProjection([], height, pad, scale);
		expect(y(0)).toBeCloseTo(bottom, 5); // base → floor
		expect(y(2000)).toBeCloseTo(bottom - innerH * SCALE_TOP_FILL, 5); // peak → most of the box
		expect(y(1000)).toBeCloseTo(bottom - 0.5 * innerH * SCALE_TOP_FILL, 5); // linear between
	});

	it('maps a given elevation to the SAME y for stages with real relief (shared, not normalised)', () => {
		// Both stages clear the flat-amplitude floor, so they keep the pure shared mapping.
		const a: ElePoint[] = [{ km: 0, ele: 600 }, { km: 50, ele: 1900 }];
		const b: ElePoint[] = [{ km: 0, ele: 300 }, { km: 80, ele: 2000 }];
		const yA = eleProjection(a, height, pad, scale);
		const yB = eleProjection(b, height, pad, scale);
		// 1000 m is 1000 m on both — the whole point of a shared scale.
		expect(yA(1000)).toBeCloseTo(yB(1000), 5);
	});

	it('lifts a near-flat stage to a readable minimum amplitude, still anchored low', () => {
		const flat: ElePoint[] = Array.from({ length: 50 }, (_, i) => ({ km: i, ele: 60 + (i % 7) * 3 }));
		const y = eleProjection(flat, height, pad, scale);
		const lo = Math.min(...flat.map((p) => p.ele));
		const hi = Math.max(...flat.map((p) => p.ele));
		// Its own range now spans at least the floor amplitude (readable rollers, not a dead line)…
		expect(y(lo) - y(hi)).toBeGreaterThanOrEqual(innerH * MIN_FLAT_AMPLITUDE_FRAC - 0.5);
		// …yet the low point still sits near the bottom of the frame (flat stays flat-and-low).
		expect(y(lo)).toBeGreaterThan(bottom - innerH * 0.15);
	});

	it("a flat stage's summit sits well below a mountain stage's at the same scale", () => {
		const y = eleProjection([], height, pad, scale);
		// Flat top (~110 m) must render much lower in the box (larger y) than a 1900 m summit.
		expect(y(110)).toBeGreaterThan(y(1900) + innerH * 0.6);
	});

	it('the floor stops a flat stage from auto-filling the box (line hugs the floor)', () => {
		const flat: ElePoint[] = Array.from({ length: 100 }, (_, i) => ({ km: i, ele: 80 + (i % 5) }));
		const withScale = buildGeometry(tdf2026.stages[0], flat, 800, height, pad, scale);
		const perStage = buildGeometry(tdf2026.stages[0], flat, 800, height, pad); // legacy fit
		// Shared scale keeps the flat line in the lower band; per-stage fit pushes it to the top.
		expect(lineTop(withScale.linePath)).toBeGreaterThan(bottom - innerH * 0.45);
		expect(lineTop(perStage.linePath)).toBeLessThan(pad.top + innerH * 0.2);
	});

	it('the global-span floor keeps a pancake-flat Tour from magnifying rollers into mountains', () => {
		// A whole "Tour" spanning only 100 m must NOT stretch that 100 m across the box.
		const y = eleProjection([], height, pad, { baseEleM: 0, peakEleM: 100 });
		const reach = bottom - y(100); // px the 100 m peak rises
		expect(reach).toBeLessThan(innerH * SCALE_TOP_FILL * (100 / MIN_GLOBAL_SPAN_M) + 0.01);
		expect(reach).toBeLessThan(innerH * 0.2); // nowhere near filling the box
	});

	it('summit markers ride the shared-scale line (same projection as buildGeometry)', () => {
		const series: ElePoint[] = Array.from({ length: 171 }, (_, i) => ({ km: i, ele: 100 + i * 10 }));
		const m = layoutClimbMarkers([{ summitKm: 100, category: 'hc', name: 'Test' }], series, {
			width: 1040,
			height,
			pad,
			scale
		});
		const y = eleProjection(series, height, pad, scale);
		expect(m[0].summitY).toBeCloseTo(y(elevationAtKm(series, 100)), 5);
	});
});

describe('render: gradientAtKm', () => {
	// 80 m rise per km = a constant 8% slope.
	const climb: ElePoint[] = Array.from({ length: 50 }, (_, i) => ({ km: i * 0.1, ele: i * 0.1 * 80 }));
	const flat: ElePoint[] = Array.from({ length: 50 }, (_, i) => ({ km: i * 0.1, ele: 100 }));
	const descent: ElePoint[] = climb.map((p) => ({ km: p.km, ele: 400 - p.ele }));

	it('recovers a known constant slope within tolerance', () => {
		expect(gradientAtKm(climb, 2.5, 0.1)).toBeCloseTo(8, 1);
	});

	it('reads ~0 on flat terrain', () => {
		expect(Math.abs(gradientAtKm(flat, 2.5))).toBeLessThan(0.01);
	});

	it('reads negative on descents', () => {
		expect(gradientAtKm(descent, 2.5, 0.1)).toBeCloseTo(-8, 1);
	});

	it('clamps the window at the series ends without throwing', () => {
		expect(gradientAtKm(climb, 0, 0.1)).toBeCloseTo(8, 1);
		expect(gradientAtKm(climb, climb[climb.length - 1].km, 0.1)).toBeCloseTo(8, 1);
	});

	it('elevationAtKm interpolates between samples', () => {
		expect(elevationAtKm(climb, 1.05)).toBeCloseTo(84, 0); // 1.05km * 80
	});
});
