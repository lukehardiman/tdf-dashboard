import { describe, it, expect } from 'vitest';
import { haversineKm, bearing, turnAngle, cumulativeKm, detectCorners, type LngLat } from './curvature';

describe('curvature: geodesy primitives', () => {
	it('haversine ~111 km per degree of latitude', () => {
		expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.2, 0);
	});
	it('bearing is 90° due east, 0° due north', () => {
		expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 0);
		expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 0);
	});
	it('turnAngle wraps to the shortest signed turn', () => {
		expect(turnAngle(350, 10)).toBeCloseTo(20, 5); // +20 (right), not −340
		expect(turnAngle(10, 350)).toBeCloseTo(-20, 5); // −20 (left)
	});
	it('cumulativeKm accumulates along the track', () => {
		const cum = cumulativeKm([[0, 0], [0, 1], [0, 2]]);
		expect(cum[0]).toBe(0);
		expect(cum[2]).toBeCloseTo(cum[1] * 2, 0);
	});
});

// Build an L-shaped track: ~1 km due east, then ~1 km due north (a 90° left turn at the elbow).
function lTrack(): LngLat[] {
	const km = 0.00898; // ~1 km in degrees near the equator
	const pts: LngLat[] = [];
	for (let i = 0; i <= 20; i++) pts.push([(km * i) / 20, 0]);
	for (let i = 1; i <= 20; i++) pts.push([km, (km * i) / 20]);
	return pts;
}

describe('detectCorners', () => {
	it('finds the single ~90° bend in an L-shaped track', () => {
		const corners = detectCorners(lTrack(), { minTurnDeg: 60 });
		expect(corners).toHaveLength(1);
		expect(corners[0].turnDeg).toBeGreaterThan(60);
		expect(corners[0].dir).toBe('L'); // east → north is a left turn
		expect(corners[0].km).toBeGreaterThan(0.7);
		expect(corners[0].km).toBeLessThan(1.3);
	});

	it('finds nothing on a straight line', () => {
		const straight: LngLat[] = Array.from({ length: 30 }, (_, i) => [i * 0.001, 0]);
		expect(detectCorners(straight)).toEqual([]);
	});

	it('respects the turn threshold (a gentle bend below threshold is ignored)', () => {
		// A shallow kink: the L-track but only counted above a very high threshold.
		expect(detectCorners(lTrack(), { minTurnDeg: 170 })).toEqual([]);
	});

	it('returns nothing for a degenerate track', () => {
		expect(detectCorners([[0, 0], [0, 1]])).toEqual([]);
	});
});
