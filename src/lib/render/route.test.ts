import { describe, it, expect } from 'vitest';
import {
	trackToGeoJSON,
	trackBounds,
	coordAtFraction,
	trackUpToFraction,
	type LngLat
} from './route';

const track: LngLat[] = [
	[6.0, 45.0],
	[6.1, 45.1],
	[6.2, 45.2],
	[6.3, 45.3],
	[6.4, 45.4]
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
			[6.4, 45.4]
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
		expect(coordAtFraction(track, 1)).toEqual([6.4, 45.4]);
	});

	it('interpolates the midpoint', () => {
		const [lon, lat] = coordAtFraction(track, 0.5);
		expect(lon).toBeCloseTo(6.2, 6);
		expect(lat).toBeCloseTo(45.2, 6);
	});

	it('interpolates between samples', () => {
		// 0.625 of 4 segments = index 2.5 → midway [6.2,45.2]..[6.3,45.3]
		const [lon, lat] = coordAtFraction(track, 0.625);
		expect(lon).toBeCloseTo(6.25, 6);
		expect(lat).toBeCloseTo(45.25, 6);
	});

	it('clamps out-of-range fractions', () => {
		expect(coordAtFraction(track, -1)).toEqual([6.0, 45.0]);
		expect(coordAtFraction(track, 2)).toEqual([6.4, 45.4]);
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
});
