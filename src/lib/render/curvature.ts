// Framework-free track-curvature analysis.
//
// The flat-finish (archetype D) and the TT renderer (archetype A) describe TERRAIN you can't see
// in an elevation profile: the technical run-in — sharp corners, a twisty finale. We derive that
// from the route track's geometry: the heading change per unit distance. A tight, sustained
// direction change is a corner; a long straight is not. This is descriptive geometry (where the
// road bends), never a racing prediction.
//
// No Svelte imports — pure + unit-tested. Input is [lon, lat] track points (GeoJSON order).

export type LngLat = [number, number];

export interface Corner {
	/** Distance along the track to the apex (km). */
	km: number;
	/** Total heading change through the corner (degrees, absolute). */
	turnDeg: number;
	/** Signed direction: 'L' or 'R'. */
	dir: 'L' | 'R';
	/** Apex position (for plotting on the map / run-in). */
	lngLat: LngLat;
}

const R = 6371; // km

/** Great-circle distance (km) between two lon/lat points. */
export function haversineKm(a: LngLat, b: LngLat): number {
	const toRad = Math.PI / 180;
	const dLat = (b[1] - a[1]) * toRad;
	const dLon = (b[0] - a[0]) * toRad;
	const la1 = a[1] * toRad;
	const la2 = b[1] * toRad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing (degrees, 0–360) from a to b. */
export function bearing(a: LngLat, b: LngLat): number {
	const toRad = Math.PI / 180;
	const la1 = a[1] * toRad;
	const la2 = b[1] * toRad;
	const dLon = (b[0] - a[0]) * toRad;
	const y = Math.sin(dLon) * Math.cos(la2);
	const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
	return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Smallest signed turn (−180..180) from heading h1 to h2; +ve = right, −ve = left. */
export function turnAngle(h1: number, h2: number): number {
	let d = h2 - h1;
	while (d > 180) d -= 360;
	while (d < -180) d += 360;
	return d;
}

/** Cumulative distance (km) to each track point. */
export function cumulativeKm(track: LngLat[]): number[] {
	const out = [0];
	for (let i = 1; i < track.length; i++) out.push(out[i - 1] + haversineKm(track[i - 1], track[i]));
	return out;
}

export interface CornerOptions {
	/** Resample step (km) so corner detection is independent of raw point density. */
	stepKm?: number;
	/** Minimum total heading change (deg) over the window to count as a corner. */
	minTurnDeg?: number;
	/** Window (km) over which heading change is accumulated. */
	windowKm?: number;
	/** Minimum spacing (km) between reported corners (keeps the sharpest of a cluster). */
	minSpacingKm?: number;
}

/**
 * Detect significant corners on a track segment by accumulated heading change. Resamples to a
 * fixed step so the result doesn't depend on GPX point density, sums signed turn over a sliding
 * window, and reports local maxima above the threshold. Tuned for finish run-ins; defaults are
 * conservative (only genuinely sharp bends surface).
 */
export function detectCorners(track: LngLat[], opts: CornerOptions = {}): Corner[] {
	const stepKm = opts.stepKm ?? 0.1;
	const minTurnDeg = opts.minTurnDeg ?? 60;
	const windowKm = opts.windowKm ?? 0.3;
	const minSpacingKm = opts.minSpacingKm ?? 0.4;
	if (track.length < 3) return [];

	// Resample the track to a fixed step.
	const cum = cumulativeKm(track);
	const total = cum[cum.length - 1];
	if (total < stepKm * 2) return [];
	const pts: LngLat[] = [];
	const pkm: number[] = [];
	let j = 0;
	for (let d = 0; d <= total + 1e-9; d += stepKm) {
		while (j < cum.length - 2 && cum[j + 1] < d) j++;
		const span = cum[j + 1] - cum[j] || 1e-9;
		const t = Math.min(1, Math.max(0, (d - cum[j]) / span));
		pts.push([track[j][0] + (track[j + 1][0] - track[j][0]) * t, track[j][1] + (track[j + 1][1] - track[j][1]) * t]);
		pkm.push(d);
	}

	// Per-step signed heading change.
	const win = Math.max(1, Math.round(windowKm / stepKm));
	const headings: number[] = [];
	for (let i = 0; i < pts.length - 1; i++) headings.push(bearing(pts[i], pts[i + 1]));

	// Windowed accumulated turn at each step.
	const acc: number[] = new Array(headings.length).fill(0);
	for (let i = 1; i < headings.length; i++) {
		const t = turnAngle(headings[i - 1], headings[i]);
		acc[i] = t;
	}
	const windowed: number[] = new Array(headings.length).fill(0);
	for (let i = 0; i < headings.length; i++) {
		let sum = 0;
		for (let k = i; k < Math.min(headings.length, i + win); k++) sum += acc[k];
		windowed[i] = sum;
	}

	// Pick local maxima of |windowed| above threshold, spaced out.
	const candidates: Corner[] = [];
	for (let i = 1; i < windowed.length - 1; i++) {
		const mag = Math.abs(windowed[i]);
		if (mag < minTurnDeg) continue;
		if (mag < Math.abs(windowed[i - 1]) || mag < Math.abs(windowed[i + 1])) continue;
		candidates.push({ km: pkm[i], turnDeg: mag, dir: windowed[i] >= 0 ? 'R' : 'L', lngLat: pts[i] });
	}
	candidates.sort((a, b) => b.turnDeg - a.turnDeg);
	const kept: Corner[] = [];
	for (const c of candidates) {
		if (kept.every((k) => Math.abs(k.km - c.km) >= minSpacingKm)) kept.push(c);
	}
	return kept.sort((a, b) => a.km - b.km);
}
