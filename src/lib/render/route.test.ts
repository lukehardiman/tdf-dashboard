import { describe, it, expect } from 'vitest';
import {
	trackToGeoJSON,
	trackBounds,
	coordAtFraction,
	trackUpToFraction,
	simplifyTrack,
	type LngLat
} from './route';

// Constant latitude so along-track distance is exactly proportional to longitude — keeps the
// distance-based fraction assertions exact (a diagonal track gets tiny cos-latitude weighting).
const track: LngLat[] = [
	[6.0, 45.0],
	[6.1, 45.0],
	[6.2, 45.0],
	[6.3, 45.0],
	[6.4, 45.0]
];

describe('route: trackToGeoJSON', () => {
	it('wraps coordinates in a LineString Feature', () => {
		const f = trackToGeoJSON(track);
		expect(f.type).toBe('Feature');
		expect(f.geometry.type).toBe('LineString');
		expect(f.geometry.coordinates).toHaveLength(5);
		expect(f.geometry.coordinates[0]).toEqual([6.0, 45.0]);
	});
});

describe('route: trackBounds', () => {
	it('returns [[w,s],[e,n]]', () => {
		expect(trackBounds(track)).toEqual([
			[6.0, 45.0],
			[6.4, 45.0]
		]);
	});

	it('handles an unordered track', () => {
		const t: LngLat[] = [
			[6.4, 45.0],
			[6.0, 45.4],
			[6.2, 45.1]
		];
		expect(trackBounds(t)).toEqual([
			[6.0, 45.0],
			[6.4, 45.4]
		]);
	});
});

describe('route: coordAtFraction', () => {
	it('returns endpoints at 0 and 1', () => {
		expect(coordAtFraction(track, 0)).toEqual([6.0, 45.0]);
		expect(coordAtFraction(track, 1)).toEqual([6.4, 45.0]);
	});

	it('interpolates the midpoint', () => {
		const [lon, lat] = coordAtFraction(track, 0.5);
		expect(lon).toBeCloseTo(6.2, 6);
		expect(lat).toBeCloseTo(45.0, 6);
	});

	it('interpolates between samples', () => {
		// 0.625 of the length = midway [6.2]..[6.3] → 6.25
		const [lon, lat] = coordAtFraction(track, 0.625);
		expect(lon).toBeCloseTo(6.25, 6);
		expect(lat).toBeCloseTo(45.0, 6);
	});

	it('clamps out-of-range fractions', () => {
		expect(coordAtFraction(track, -1)).toEqual([6.0, 45.0]);
		expect(coordAtFraction(track, 2)).toEqual([6.4, 45.0]);
	});
});

describe('route: trackUpToFraction', () => {
	it('returns just the start near 0', () => {
		expect(trackUpToFraction(track, 0)).toEqual([[6.0, 45.0]]);
	});

	it('returns the full track at 1', () => {
		expect(trackUpToFraction(track, 1)).toEqual(track);
	});

	it('grows the line and ends at the interpolated point', () => {
		const head = trackUpToFraction(track, 0.5);
		expect(head.length).toBe(3); // indices 0,1,2 (2 is exactly the 0.5 point)
		expect(head[head.length - 1][0]).toBeCloseTo(6.2, 6);
	});

	it('maps fraction by DISTANCE on a non-uniform track (corner-dense, straight-sparse)', () => {
		// Two equal-length legs but very different point counts: a dense first leg, a 2-point second.
		// Index-fraction would put 0.5 deep in the dense leg; distance-fraction lands at the junction.
		const dense: LngLat[] = [];
		for (let i = 0; i <= 10; i++) dense.push([0 + i * 0.01, 45]); // 0.00→0.10 lon, 10 segments
		const nonUniform: LngLat[] = [...dense, [0.2, 45]]; // + one long 0.10-lon segment
		const mid = coordAtFraction(nonUniform, 0.5);
		expect(mid[0]).toBeCloseTo(0.1, 4); // the junction, not the dense-leg middle
	});
});

describe('route: simplifyTrack (RDP)', () => {
	it('collapses collinear points to the endpoints', () => {
		const line: LngLat[] = [
			[6.0, 45.0], [6.1, 45.0], [6.2, 45.0], [6.3, 45.0], [6.4, 45.0]
		];
		expect(simplifyTrack(line, 8)).toEqual([
			[6.0, 45.0], [6.4, 45.0]
		]);
	});

	it('keeps a vertex that deviates beyond epsilon (a real corner)', () => {
		// A ~110 m northward jog at the midpoint (0.001° ≈ 111 m) must survive an 8 m epsilon.
		const bend: LngLat[] = [
			[6.0, 45.0], [6.1, 45.001], [6.2, 45.0]
		];
		const out = simplifyTrack(bend, 8);
		expect(out).toHaveLength(3);
		expect(out[1]).toEqual([6.1, 45.001]);
	});

	it('drops a sub-epsilon wobble (smaller than road width)', () => {
		// ~3 m deviation (0.00003°) at the midpoint — below 8 m, so it's shed.
		const wobble: LngLat[] = [
			[6.0, 45.0], [6.1, 45.00003], [6.2, 45.0]
		];
		expect(simplifyTrack(wobble, 8)).toEqual([
			[6.0, 45.0], [6.2, 45.0]
		]);
	});

	it('preserves endpoints and order; never returns fewer than 2 points', () => {
		const t: LngLat[] = [[1, 1], [2, 2], [3, 1]];
		const out = simplifyTrack(t, 8);
		expect(out[0]).toEqual([1, 1]);
		expect(out[out.length - 1]).toEqual([3, 1]);
		expect(out.length).toBeGreaterThanOrEqual(2);
	});
});
