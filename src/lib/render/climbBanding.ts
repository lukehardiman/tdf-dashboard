// Framework-free gradient-banding for the decisive-zone climb detail (spec §4).
//
// The ASO-style per-km climb profile: segment a climb into fixed bins, compute each bin's
// average gradient from the REAL GPX elevation delta, and colour it on a severity ramp that
// darkens as the road kicks up. This is the richest rendering of climb data, pointed only at
// the decisive zone (finish-zoom archetypes B/C/E) — not every Cat-4 hill on the route.
//
// CRITICAL: band the RESOLVED extent (climb.startKm → summitKm from the resolver), never the
// raw komstart. Croix de Fer must band its full chain-resolved 24 km, not the 5.1 km truncation
// — a beautifully banded WRONG climb is the failure mode. Callers pass the resolver's startKm.
//
// No Svelte imports — pure + unit-tested. The Svelte renderer consumes bandClimb() output and
// maps severity → CSS; the fixed semantic palette below is the default (ASO-like, theme-stable).

import { elevationAtKm, type ElePoint } from './profile';

/** Severity ramp (cycling convention): gentler → green, steeper → red/black; descents neutral. */
export type Severity = 'descent' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'black';

/** A single banded segment of a climb. */
export interface ClimbBin {
	/** Absolute distance along the stage (km). */
	startKm: number;
	endKm: number;
	/** Distance from the foot of THIS climb (km) — for "km 1, 2, 3 …" labels like ASO. */
	fromFootKm: number;
	lengthKm: number;
	startEle: number;
	endEle: number;
	/** Average gradient over the bin from the real elevation delta (%, signed). */
	gradientPct: number;
	severity: Severity;
}

/**
 * Severity band for a gradient (%). Thresholds (spec §4): green <4 · blue 4–6 · yellow 6–8 ·
 * orange 8–10 · red 10–15 · black 15+. Anything downhill is 'descent' (shown neutral).
 */
export function gradientSeverity(pct: number): Severity {
	if (pct < 0) return 'descent';
	if (pct < 4) return 'green';
	if (pct < 6) return 'blue';
	if (pct < 8) return 'yellow';
	if (pct < 10) return 'orange';
	if (pct < 15) return 'red';
	return 'black';
}

/**
 * Default semantic palette for the severity ramp. Fixed (not theme tokens) — the ramp means the
 * same thing in both themes, like ASO. 'black' is a deep maroon so 15%+ still reads on a dark
 * surface while signalling "beyond red". The Svelte renderer may override via CSS if needed.
 */
export const SEVERITY_COLOR: Record<Severity, string> = {
	descent: '#5b6b7e',
	green: '#2f9e6f',
	blue: '#3f86cf',
	yellow: '#d8b13f',
	orange: '#e2862f',
	red: '#d6433a',
	black: '#6b1f29'
};

/**
 * Segment a climb into per-bin gradient bands over its RESOLVED extent [startKm, summitKm].
 * Bins are climb-relative (from the foot), default 1 km to match ASO's per-km figures; pass a
 * finer binKm (e.g. 0.5) for smoother colour. The final bin may be a short remainder. Gradient
 * per bin is the real elevation delta over the bin distance — consistent with the resolver.
 */
export function bandClimb(
	series: ElePoint[],
	startKm: number,
	summitKm: number,
	binKm = 1
): ClimbBin[] {
	const bins: ClimbBin[] = [];
	if (summitKm <= startKm || binKm <= 0 || series.length < 2) return bins;
	const EPS = 1e-6;
	let k = startKm;
	while (k < summitKm - EPS) {
		const end = Math.min(k + binKm, summitKm);
		const len = end - k;
		const startEle = elevationAtKm(series, k);
		const endEle = elevationAtKm(series, end);
		const gradientPct = len > 0 ? ((endEle - startEle) / (len * 1000)) * 100 : 0;
		bins.push({
			startKm: k,
			endKm: end,
			fromFootKm: k - startKm,
			lengthKm: len,
			startEle,
			endEle,
			gradientPct,
			severity: gradientSeverity(gradientPct)
		});
		k = end;
	}
	return bins;
}
