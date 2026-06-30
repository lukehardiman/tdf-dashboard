// Framework-free route-geometry helpers for the map. Pure functions only — NO
// MapLibre or Svelte imports — so they're unit-testable in isolation and the map
// component stays a thin rendering shell over them. Coordinates are GeoJSON order
// ([lon, lat]) throughout, matching the `track` stored in the profile JSON.

export type LngLat = [number, number];

/** Minimal GeoJSON LineString Feature — structurally compatible with MapLibre's
 *  setData(), defined locally to avoid a dependency on @types/geojson globals. */
export interface RouteFeature {
	type: 'Feature';
	properties: Record<string, unknown>;
	geometry: { type: 'LineString'; coordinates: LngLat[] };
}

/** A GeoJSON LineString Feature for the route track (optionally truncated). */
export function trackToGeoJSON(track: LngLat[]): RouteFeature {
	return {
		type: 'Feature',
		properties: {},
		geometry: { type: 'LineString', coordinates: track }
	};
}

/** Bounding box of the track as [[west, south], [east, north]]. */
export function trackBounds(track: LngLat[]): [LngLat, LngLat] {
	let w = Infinity;
	let s = Infinity;
	let e = -Infinity;
	let n = -Infinity;
	for (const [lon, lat] of track) {
		if (lon < w) w = lon;
		if (lon > e) e = lon;
		if (lat < s) s = lat;
		if (lat > n) n = lat;
	}
	return [
		[w, s],
		[e, n]
	];
}

// Equirectangular segment length (relative units, lat-scaled). We only need PROPORTIONS for
// fraction mapping, so the cheap planar metric is exact enough and avoids per-call haversine.
function segLen(a: LngLat, b: LngLat): number {
	const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
	const dx = (b[0] - a[0]) * k;
	const dy = b[1] - a[1];
	return Math.hypot(dx, dy);
}

/** Cumulative along-track distance (relative units) at each point; cum[0] = 0. */
function cumulative(track: LngLat[]): number[] {
	const cum = new Array<number>(track.length);
	cum[0] = 0;
	for (let i = 1; i < track.length; i++) cum[i] = cum[i - 1] + segLen(track[i - 1], track[i]);
	return cum;
}

/** Locate fraction `t` (0..1) by DISTANCE along the track: returns the segment index and the
 *  in-segment fraction. Distance-based (not index-based) so a NON-uniform track — e.g. an RDP
 *  track that's dense in corners and sparse on straights — still maps a scrub position correctly. */
function locate(track: LngLat[], t: number): { i: number; frac: number; cum: number[]; total: number } {
	const cum = cumulative(track);
	const total = cum[cum.length - 1];
	const target = Math.min(1, Math.max(0, t)) * total;
	let i = 0;
	while (i < track.length - 1 && cum[i + 1] < target) i++;
	const segStart = cum[i];
	const segEnd = cum[Math.min(i + 1, track.length - 1)];
	const frac = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
	return { i, frac, cum, total };
}

/**
 * Interpolate the coordinate at fraction `t` (0..1) along the track BY DISTANCE. The profile
 * emits its scrub position as a distance-fraction (its x-axis is km-proportional), so this keeps
 * the map dot in sync even when the track is non-uniformly sampled.
 */
export function coordAtFraction(track: LngLat[], t: number): LngLat {
	if (track.length === 0) return [0, 0];
	if (track.length === 1) return track[0];
	const { i, frac, total } = locate(track, t);
	if (total === 0 || i >= track.length - 1) return track[track.length - 1];
	const [aLon, aLat] = track[i];
	const [bLon, bLat] = track[i + 1];
	return [aLon + (bLon - aLon) * frac, aLat + (bLat - aLat) * frac];
}

/** Prefix of the track up to fraction `t` (by distance) — used to grow the line for draw-on. */
export function trackUpToFraction(track: LngLat[], t: number): LngLat[] {
	if (track.length <= 1) return track.slice();
	const { i, frac, total } = locate(track, t);
	if (total === 0) return track.slice(0, 1);
	const head = track.slice(0, i + 1);
	// Append the interpolated tip only when between samples (avoids duplicate points).
	if (frac > 1e-9 && i < track.length - 1) {
		const [aLon, aLat] = track[i];
		const [bLon, bLat] = track[i + 1];
		head.push([aLon + (bLon - aLon) * frac, aLat + (bLat - aLat) * frac]);
	}
	return head;
}

/**
 * Resample `track` to one point per `km` in `kms` (along-route distances), so the result is
 * index-aligned with a km series — for analysis (TT sectors / corners) that assumes track[i] ↔
 * series[i]. Samples the track BY DISTANCE-fraction, so it works on a non-uniform (RDP) track:
 * the dense map track and this analysis track stay consistent because both describe one route.
 */
export function alignTrack(track: LngLat[], kms: number[], totalKm: number): LngLat[] {
	if (track.length === 0) return kms.map(() => [0, 0] as LngLat);
	return kms.map((km) => coordAtFraction(track, totalKm > 0 ? km / totalKm : 0));
}

// ---- Curvature-aware simplification (Ramer–Douglas–Peucker) -------------------------------------
// The served map track is decimated from raw GPX for payload. Uniform decimation chords across
// corners (the road bends but the kept points are too far apart). RDP instead keeps points where
// the line BENDS (perpendicular error > epsilon) and drops them on straights — corners stay crisp
// at zoom while most of the straight-line redundancy is shed. Build-time only.

const M_PER_DEG = 111_320;

/** Perpendicular distance (m) from point `p` to segment `a`–`b`, equirectangular (fine at stage scale). */
function perpDistanceM(p: LngLat, a: LngLat, b: LngLat): number {
	const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
	const ax = a[0] * k;
	const ay = a[1];
	const bx = b[0] * k;
	const by = b[1];
	const px = p[0] * k;
	const py = p[1];
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	u = Math.max(0, Math.min(1, u));
	return Math.hypot(px - (ax + u * dx), py - (ay + u * dy)) * M_PER_DEG;
}

/**
 * Ramer–Douglas–Peucker line simplification. Keeps the endpoints and every vertex whose
 * perpendicular deviation from the current chord exceeds `epsilonM` metres; drops the rest.
 * Iterative (explicit stack) so a 20k-point raw track can't overflow the call stack. Order and
 * endpoints are preserved.
 */
export function simplifyTrack(track: LngLat[], epsilonM: number): LngLat[] {
	if (track.length < 3 || epsilonM <= 0) return track.slice();
	const keep = new Uint8Array(track.length);
	keep[0] = 1;
	keep[track.length - 1] = 1;
	const stack: [number, number][] = [[0, track.length - 1]];
	while (stack.length) {
		const [lo, hi] = stack.pop()!;
		let maxD = epsilonM;
		let idx = -1;
		for (let i = lo + 1; i < hi; i++) {
			const d = perpDistanceM(track[i], track[lo], track[hi]);
			if (d > maxD) {
				maxD = d;
				idx = i;
			}
		}
		if (idx !== -1) {
			keep[idx] = 1;
			stack.push([lo, idx], [idx, hi]);
		}
	}
	const out: LngLat[] = [];
	for (let i = 0; i < track.length; i++) if (keep[i]) out.push(track[i]);
	return out;
}
