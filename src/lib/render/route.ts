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

/**
 * Linearly interpolate the coordinate at fraction `t` (0..1) along the track by
 * point index. The track is near-uniformly sampled by distance (resampled at build
 * time), so index-fraction ≈ distance-fraction — good enough for a scrub marker
 * without threading per-point cumulative distance through to the client.
 */
export function coordAtFraction(track: LngLat[], t: number): LngLat {
	if (track.length === 0) return [0, 0];
	if (track.length === 1) return track[0];
	const clamped = Math.min(1, Math.max(0, t));
	const pos = clamped * (track.length - 1);
	const i = Math.floor(pos);
	if (i >= track.length - 1) return track[track.length - 1];
	const frac = pos - i;
	const [aLon, aLat] = track[i];
	const [bLon, bLat] = track[i + 1];
	return [aLon + (bLon - aLon) * frac, aLat + (bLat - aLat) * frac];
}

/** Prefix of the track up to fraction `t` — used to grow the line for draw-on. */
export function trackUpToFraction(track: LngLat[], t: number): LngLat[] {
	if (track.length <= 1) return track.slice();
	const clamped = Math.min(1, Math.max(0, t));
	const pos = clamped * (track.length - 1);
	const i = Math.floor(pos);
	const frac = pos - i;
	const head = track.slice(0, i + 1);
	// Append the interpolated tip only when between samples (avoids duplicate points).
	if (frac > 1e-9 && i < track.length - 1) head.push(coordAtFraction(track, clamped));
	return head;
}
