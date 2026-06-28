// Framework-free elevation profile renderer.
// Takes an array of {km, ele} points and draws a gradient-shaded profile to an SVG path.
// Kept deliberately decoupled from any UI framework so it ports across shells.
//
// For v1 we synthesise a representative elevation series from stage metadata
// (distance, total gain, climbs) until real GPX tracks are wired in. The same
// renderer consumes real GPX-derived series unchanged.

import type { Stage } from '../data/types';

export interface ElePoint {
	km: number;
	ele: number;
}

/**
 * Shared elevation scale across ALL stages of an event. The whole point: every profile
 * uses the SAME metres-per-fraction-of-height mapping, anchored to ONE common baseline —
 * so a flat sprint renders low-and-thin and a mountain stage renders tall, and the SHAPE
 * alone tells you the stage type. Without this, each stage normalises to its own min/max
 * and a pancake and the Galibier draw identically. Derived from real data at build time
 * (src/lib/data/profiles/scale.json) so it auto-recalibrates for future Tours.
 */
export interface EleScale {
	/** Common baseline (m) for every stage — the event's global low point, NOT a per-stage min. */
	baseEleM: number;
	/** Event's global high point (m) — calibrates the shared metres-per-pixel. */
	peakEleM: number;
}

/** Fraction of the inner chart height the GLOBAL peak reaches. <1 keeps mountains inside the box. */
export const SCALE_TOP_FILL = 0.92;
/**
 * Floor on the global span (m) used for calibration. Guards a hypothetical all-flat Tour
 * from magnifying gentle rollers into fake mountains; for any real Grand Tour the true
 * span (~2,600 m) dominates and this never bites. Keeps the scale honest, not normalised.
 */
export const MIN_GLOBAL_SPAN_M = 800;
/**
 * Minimum vertical amplitude (as a fraction of the inner height) a stage's own elevation range
 * is given on the shared scale. A near-flat stage would otherwise render as a ~5 px dead line;
 * this lifts JUST the flattest stages to a readable amplitude — anchored at their low point so
 * they still sit LOW in the frame (a flat stage stays visibly flat-and-low, like an ASO profile:
 * undulations readable but not exaggerated). Stages with real relief exceed this floor and stay
 * pure shared-linear, so cross-stage "how mountainous" comparison is untouched for them.
 */
export const MIN_FLAT_AMPLITUDE_FRAC = 0.2;

/**
 * Build the vertical projection ele(m) → y(px) for a chart of the given height/padding.
 * With a shared `scale`, every stage maps elevation onto the SAME baseline + metres-per-pixel
 * (the global peak filling SCALE_TOP_FILL of the box). Without one, falls back to legacy
 * per-stage normalisation (used only by the synthesise fallback, which has no global frame).
 * The single source of truth for y — buildGeometry, the climb markers, and the scrub readout
 * all project through this so the line, the summit dots and the cursor never drift apart.
 */
export function eleProjection(
	series: ElePoint[],
	height: number,
	pad: { top: number; bottom: number },
	scale?: EleScale | null
): (ele: number) => number {
	const innerH = height - pad.top - pad.bottom;
	const bottom = pad.top + innerH;
	if (scale) {
		const base = scale.baseEleM;
		const span = Math.max(MIN_GLOBAL_SPAN_M, scale.peakEleM - base);
		const usable = innerH * SCALE_TOP_FILL;
		const sharedY = (ele: number) => bottom - ((ele - base) / span) * usable;
		// Flat-stage legibility floor: if this stage's own range renders shorter than the floor,
		// give it a minimum amplitude anchored at its low point's shared position (stays low in
		// the frame). Mountains exceed the floor and keep the pure shared mapping.
		if (series.length > 1) {
			const eles = series.map((p) => p.ele);
			const sMin = Math.min(...eles);
			const sMax = Math.max(...eles);
			const sharedAmp = ((sMax - sMin) / span) * usable;
			const minAmp = innerH * MIN_FLAT_AMPLITUDE_FRAC;
			if (sMax > sMin && sharedAmp < minAmp) {
				const anchorY = sharedY(sMin);
				const amp = Math.min(minAmp, anchorY - pad.top); // never overflow the top
				return (ele: number) => anchorY - ((ele - sMin) / (sMax - sMin)) * amp;
			}
		}
		return sharedY;
	}
	// Legacy per-stage normalisation — only when no shared scale is supplied.
	const eles = series.length ? series.map((p) => p.ele) : [0];
	const minEle = Math.min(...eles);
	const range = Math.max(1, Math.max(...eles) - minEle);
	return (ele: number) => bottom - ((ele - minEle) / range) * innerH;
}

export interface ProfileGeometry {
	/** SVG path 'd' for the filled area under the profile. */
	areaPath: string;
	/** SVG path 'd' for the profile line itself. */
	linePath: string;
	/** Climb summit markers, positioned in SVG space. */
	markers: { x: number; y: number; name: string; category: string }[];
	minEle: number;
	maxEle: number;
	width: number;
	height: number;
}

/**
 * Build a plausible elevation series from stage metadata.
 * Deterministic (seeded by stage number) so the same stage always renders identically.
 * Replace with real GPX parsing when tracks are available — downstream code is unaffected.
 */
export function synthesiseSeries(stage: Stage, samples = 200): ElePoint[] {
	const rng = mulberry32(stage.n * 9973 + 1);
	const pts: ElePoint[] = [];
	const baseEle = stage.finish.elevation && stage.start.elevation
		? Math.min(stage.start.elevation, stage.finish.elevation)
		: 150;

	// Place climbs as gaussian bumps along the route.
	const bumps = stage.climbs.map((c) => ({
		centre: c.summitKm / stage.distanceKm,
		height: c.summitElevation - baseEle,
		width: Math.max(0.03, c.lengthKm / stage.distanceKm)
	}));

	// If no climb data, generate gentle terrain scaled to total gain.
	const roughness = stage.elevationGainM / Math.max(stage.distanceKm, 1);

	for (let i = 0; i < samples; i++) {
		const t = i / (samples - 1);
		const km = t * stage.distanceKm;
		let ele = baseEle;

		for (const b of bumps) {
			const d = (t - b.centre) / b.width;
			ele += b.height * Math.exp(-d * d * 2);
		}

		// Ambient rolling terrain — more for hillier stages, damped near the start.
		const ambient = Math.sin(t * Math.PI * 6 + stage.n) * roughness * 4
			+ (rng() - 0.5) * roughness * 6;
		ele += ambient * Math.min(1, t * 3);

		// Drag the finish toward its true elevation if known.
		if (stage.finish.elevation && t > 0.92) {
			const k = (t - 0.92) / 0.08;
			ele = ele * (1 - k) + stage.finish.elevation * k;
		}

		pts.push({ km, ele: Math.max(0, ele) });
	}
	return pts;
}

export function buildGeometry(
	stage: Stage,
	series: ElePoint[],
	width = 800,
	height = 240,
	pad = { top: 28, right: 16, bottom: 24, left: 16 },
	/** Shared cross-stage elevation scale. Omit to fall back to per-stage normalisation. */
	scale?: EleScale | null
): ProfileGeometry {
	const eles = series.map((p) => p.ele);
	const minEle = Math.min(...eles);
	const maxEle = Math.max(...eles);
	const maxKm = series[series.length - 1].km;

	const innerW = width - pad.left - pad.right;
	const innerH = height - pad.top - pad.bottom;

	const x = (km: number) => pad.left + (km / maxKm) * innerW;
	// Vertical mapping is shared across stages (see eleProjection) — NOT per-stage min/max,
	// so the line stops auto-filling the box and absolute height becomes comparable.
	const y = eleProjection(series, height, pad, scale);

	let linePath = '';
	series.forEach((p, i) => {
		linePath += `${i === 0 ? 'M' : 'L'}${x(p.km).toFixed(1)} ${y(p.ele).toFixed(1)} `;
	});

	const areaPath =
		linePath +
		`L${x(maxKm).toFixed(1)} ${(pad.top + innerH).toFixed(1)} ` +
		`L${pad.left.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;

	const markers = stage.climbs.map((c) => ({
		x: x(c.summitKm),
		y: y(c.summitElevation),
		name: c.name,
		category: c.category === 'hc' ? 'HC' : String(c.category)
	}));

	return { areaPath, linePath, markers, minEle, maxEle, width, height };
}

// ---- Climb markers on the profile ----
// The list below the profile carries name/length/gradient/summit/km. The profile's job
// is the SPATIAL story the list can't tell: WHERE each climb sits and its shape. So the
// markers stay lean — a severity-coloured category box at the summit, the name only when
// there's room. Collision handling (stagger + name suppression) is the whole point: a
// 7-climb stage must not become label soup. This is pure + unit-tested in isolation.

export interface ClimbMarkerInput {
	summitKm: number;
	category: 1 | 2 | 3 | 4 | 'hc';
	name: string;
}

export interface ClimbMarker {
	/** Summit x on the profile (the true position; not clamped). */
	x: number;
	/** y of the summit on the profile line. */
	summitY: number;
	/** Box centre x, clamped so the box stays inside the frame. */
	boxX: number;
	/** Box centre y — higher tiers sit further above the chart. */
	boxY: number;
	tier: number;
	category: 'HC' | '1' | '2' | '3' | '4';
	name: string;
	/** Whether the name is shown beside the box (suppressed when crowded). */
	showName: boolean;
}

export interface MarkerLayoutOptions {
	width: number;
	height: number;
	pad: { top: number; right: number; bottom: number; left: number };
	/** Half-width (px) reserved per box when testing horizontal collisions. */
	boxHalf?: number;
	/** Min px gap between adjacent boxes on a tier before staggering to the next. */
	minGap?: number;
	/** Min px gap to BOTH neighbours for the name to show (else box-only). */
	nameRoom?: number;
	/** Vertical px between stagger tiers. */
	tierStep?: number;
	/** Tier count before boxes may share a tier (last-resort overlap). */
	maxTiers?: number;
	/** Shared cross-stage elevation scale — must match the one passed to buildGeometry. */
	scale?: EleScale | null;
}

/**
 * Position climb markers above the profile, staggering boxes that would collide and
 * hiding names where there isn't room. Markers use the SAME elevation scale as
 * buildGeometry (pass the same width/height/pad) so boxes anchor to the drawn line.
 */
export function layoutClimbMarkers(
	climbs: ClimbMarkerInput[],
	series: ElePoint[],
	opts: MarkerLayoutOptions
): ClimbMarker[] {
	if (series.length === 0 || climbs.length === 0) return [];
	const { width, height, pad } = opts;
	const boxHalf = opts.boxHalf ?? 13;
	const minGap = opts.minGap ?? 4;
	const nameRoom = opts.nameRoom ?? 108;
	const tierStep = opts.tierStep ?? 15;
	const maxTiers = opts.maxTiers ?? 3;

	const maxKm = series[series.length - 1].km;
	const innerW = width - pad.left - pad.right;
	const xOf = (km: number) => pad.left + (Math.min(maxKm, Math.max(0, km)) / maxKm) * innerW;
	// Same shared projection as the line so summit dots sit ON the drawn profile.
	const yOf = eleProjection(series, height, pad, opts.scale);

	const sorted = [...climbs].sort((a, b) => a.summitKm - b.summitKm);
	const xs = sorted.map((c) => xOf(c.summitKm));

	// Greedy stagger: place each box on the lowest tier whose last box clears it.
	const tierRight: number[] = [];
	const tiers: number[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const left = xs[i] - boxHalf;
		let placed = -1;
		for (let t = 0; t < maxTiers; t++) {
			if (tierRight[t] === undefined || left >= tierRight[t] + minGap) {
				placed = t;
				break;
			}
		}
		if (placed === -1) {
			// Every tier still occupied — fall back to the one with the most room.
			placed = 0;
			for (let t = 1; t < maxTiers; t++) if (tierRight[t] < tierRight[placed]) placed = t;
		}
		tierRight[placed] = xs[i] + boxHalf;
		tiers.push(placed);
	}

	return sorted.map((c, i) => {
		const prevGap = i === 0 ? Infinity : xs[i] - xs[i - 1];
		const nextGap = i === sorted.length - 1 ? Infinity : xs[i + 1] - xs[i];
		return {
			x: xs[i],
			summitY: yOf(elevationAtKm(series, c.summitKm)),
			boxX: Math.min(width - pad.right - boxHalf, Math.max(pad.left + boxHalf, xs[i])),
			boxY: pad.top - 10 - tiers[i] * tierStep,
			tier: tiers[i],
			category: c.category === 'hc' ? 'HC' : (String(c.category) as ClimbMarker['category']),
			name: c.name,
			showName: Math.min(prevGap, nextGap) >= nameRoom
		};
	});
}

/** Linear-interpolated elevation (m) at a given km along the series. */
export function elevationAtKm(series: ElePoint[], km: number): number {
	if (series.length === 0) return 0;
	const maxKm = series[series.length - 1].km;
	const q = Math.min(maxKm, Math.max(0, km));
	let i = 0;
	while (i < series.length - 1 && series[i + 1].km < q) i++;
	const a = series[i];
	const b = series[Math.min(series.length - 1, i + 1)];
	if (b.km === a.km) return a.ele;
	return a.ele + ((b.ele - a.ele) * (q - a.km)) / (b.km - a.km);
}

/**
 * Gradient (%) over a window (default 100 m) centred on `km`. Windowed — NOT
 * point-to-point — so the scrub readout is stable and matches how gradients are quoted.
 * Negative on descents. The window clamps to the series ends.
 */
export function gradientAtKm(series: ElePoint[], km: number, windowKm = 0.1): number {
	if (series.length < 2) return 0;
	const maxKm = series[series.length - 1].km;
	const half = windowKm / 2;
	let lo = km - half;
	let hi = km + half;
	if (lo < 0) {
		lo = 0;
		hi = Math.min(maxKm, windowKm);
	}
	if (hi > maxKm) {
		hi = maxKm;
		lo = Math.max(0, maxKm - windowKm);
	}
	const distM = (hi - lo) * 1000;
	if (distM <= 0) return 0;
	return ((elevationAtKm(series, hi) - elevationAtKm(series, lo)) / distM) * 100;
}

// Small deterministic PRNG so renders are stable build-to-build.
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
