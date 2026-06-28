// Framework-free GPX → elevation-profile pipeline.
// Pure functions only — NO Svelte imports — so this stays the portable, unit-tested
// core (matches profile.ts). Runs at BUILD time (scripts/build-profiles.ts), never in
// the browser. Output is a downsampled {km, ele}[] series the existing buildGeometry()
// consumes unchanged, plus a derived distance, elevation gain and climb candidates.
//
// Accuracy note on elevation gain: raw 1 Hz recorded-ride sums OVER-report gain (GPS /
// barometric jitter adds phantom metres); aggressive smoothing UNDER-reports (it shaves
// the tops off cols and erases rollers). The honest value sits between. The approach:
// resample to a uniform along-route spacing, smooth with a distance-window moving
// average, then accumulate gain with a hysteresis threshold. The two knobs below
// (SMOOTHING_WINDOW_M, GAIN_THRESHOLD_M) are deliberately named and isolated so they
// can be recalibrated against ASO totals when the real route GPX replaces the dummies.

import type { ElePoint } from './profile';

export interface TrackPoint {
	lat: number;
	lon: number;
	ele: number;
}

/** A point carrying both profile (km, ele) and geo (lat, lon) data, so one series
 *  feeds both the elevation profile and the route map (Item 2). */
export interface GeoElePoint extends ElePoint {
	lat: number;
	lon: number;
}

/** A GPX-derived climb. Carries measured metrics only — NO fabricated ASO category.
 *  Always low-confidence: these are for manual review, not for filling climbs[] blind. */
export interface ClimbCandidate {
	startKm: number;
	summitKm: number;
	lengthKm: number;
	gainM: number;
	avgGradient: number;
	maxEleM: number;
	/** length(km) × avgGradient(%) — a rough difficulty score for sorting only. */
	score: number;
	confidence: 'low';
}

export interface BuiltProfile {
	distanceKm: number;
	elevationGainM: number;
	minEleM: number;
	maxEleM: number;
	/** Smoothed + downsampled series for rendering (km, ele, lat, lon). */
	series: GeoElePoint[];
	climbCandidates: ClimbCandidate[];
}

// ---- Tunable constants. Retune against ASO totals when real route GPX lands. ----

/** Uniform along-route spacing (m) for analysis. Native densities vary ~14× across
 *  files (1.9k–27k pts); resampling normalises them so the window/threshold below
 *  behave identically everywhere. */
export const RESAMPLE_INTERVAL_M = 20;

/** Elevation smoothing window (m of route distance). THE KEY ACCURACY KNOB.
 *  Smaller → jitter inflates gain (phantom metres); larger → real cols/rollers get
 *  shaved and gain under-reports. ~120 m removes 1 Hz recorded-ride noise while
 *  preserving climb structure. */
export const SMOOTHING_WINDOW_M = 120;

/** Hysteresis threshold (m) for gain accumulation. After smoothing, a rise only counts
 *  once net ascent from the last low exceeds this — stops residual ripple accumulating. */
export const GAIN_THRESHOLD_M = 3;

// Climb derivation thresholds (advisory output only).
export const CLIMB_MIN_GRADIENT = 0.03; // 3% sustained
export const CLIMB_MIN_GAIN_M = 90;
export const CLIMB_MIN_LENGTH_KM = 1.5;
/** Bridge short descents/flats between ramps so one col isn't split into many. */
export const CLIMB_MERGE_GAP_KM = 1.0;
/** A drop larger than this from the running summit definitively ends a climb. */
export const CLIMB_MAX_DROP_M = 50;
/** Plausibility ceiling on average gradient. No paved Tour climb sustains >~20%;
 *  anything above this is a recorded-ride artifact (GPS distance compression on
 *  hairpins/dropouts), not a climb — drop it so candidates stay trustworthy.
 *  Clean ASO route GPX won't trip this. */
export const CLIMB_MAX_GRADIENT = 0.2;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lat/lon points, in metres. */
export function haversineMeters(
	aLat: number,
	aLon: number,
	bLat: number,
	bLon: number
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Read a numeric attribute from a tag's attribute string, regardless of order. */
function numAttr(attrs: string, name: string): number | null {
	const m = attrs.match(new RegExp(`\\b${name}="(-?\\d+\\.?\\d*)"`));
	return m ? +m[1] : null;
}

/**
 * Parse trackpoints from a GPX 1.1 track. Handles both attribute orders —
 * StravaGPX is `lat lon`, VeloViewer is `lon lat` — and pulls the first <ele>
 * child of each point. Points missing lat/lon/ele are skipped. Dependency-free by
 * design; the structure is regular and the parse is unit-tested against real exports.
 */
export function parseGpxTrack(xml: string): TrackPoint[] {
	const re = /<trkpt\b([^>]*)>[\s\S]*?<ele>(-?\d+\.?\d*)<\/ele>/g;
	const out: TrackPoint[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) {
		const lat = numAttr(m[1], 'lat');
		const lon = numAttr(m[1], 'lon');
		if (lat === null || lon === null) continue;
		out.push({ lat, lon, ele: +m[2] });
	}
	return out;
}

/** Build a cumulative-distance series from raw trackpoints (km along route + geo). */
export function cumulativeSeries(track: TrackPoint[]): GeoElePoint[] {
	if (track.length === 0) return [];
	const out: GeoElePoint[] = [
		{ km: 0, ele: track[0].ele, lat: track[0].lat, lon: track[0].lon }
	];
	let metres = 0;
	for (let i = 1; i < track.length; i++) {
		metres += haversineMeters(track[i - 1].lat, track[i - 1].lon, track[i].lat, track[i].lon);
		out.push({ km: metres / 1000, ele: track[i].ele, lat: track[i].lat, lon: track[i].lon });
	}
	return out;
}

/** Resample a cumulative series to a uniform distance interval via linear interpolation. */
export function resampleUniform(
	cum: GeoElePoint[],
	intervalM = RESAMPLE_INTERVAL_M
): GeoElePoint[] {
	if (cum.length < 2) return cum.slice();
	const totalM = cum[cum.length - 1].km * 1000;
	const out: GeoElePoint[] = [];
	let seg = 0;
	for (let dM = 0; dM <= totalM; dM += intervalM) {
		while (seg < cum.length - 2 && cum[seg + 1].km * 1000 < dM) seg++;
		const a = cum[seg];
		const b = cum[seg + 1];
		const aM = a.km * 1000;
		const bM = b.km * 1000;
		const t = bM > aM ? Math.min(1, Math.max(0, (dM - aM) / (bM - aM))) : 0;
		out.push({
			km: dM / 1000,
			ele: a.ele + (b.ele - a.ele) * t,
			lat: a.lat + (b.lat - a.lat) * t,
			lon: a.lon + (b.lon - a.lon) * t
		});
	}
	// Guarantee the exact route end is present.
	const last = cum[cum.length - 1];
	if (out.length === 0 || out[out.length - 1].km < last.km - 1e-9) out.push({ ...last });
	return out;
}

/** Centred moving-average smooth over a distance window, O(n) via a prefix sum.
 *  Only elevation is smoothed; geo coords are preserved. */
export function smoothElevation(
	pts: GeoElePoint[],
	windowM = SMOOTHING_WINDOW_M,
	intervalM = RESAMPLE_INTERVAL_M
): GeoElePoint[] {
	const w = Math.max(1, Math.round(windowM / intervalM));
	if (w <= 1 || pts.length === 0) return pts.slice();
	const half = Math.floor(w / 2);
	const pre = new Float64Array(pts.length + 1);
	for (let i = 0; i < pts.length; i++) pre[i + 1] = pre[i] + pts[i].ele;
	return pts.map((p, i) => {
		const lo = Math.max(0, i - half);
		const hi = Math.min(pts.length - 1, i + half);
		return { ...p, ele: (pre[hi + 1] - pre[lo]) / (hi - lo + 1) };
	});
}

/** Total elevation gain (m): sum of ascents using hysteresis so noise doesn't accrue. */
export function elevationGain(eles: number[], threshold = GAIN_THRESHOLD_M): number {
	if (eles.length < 2) return 0;
	let gain = 0;
	let low = eles[0];
	let pendingPeak = eles[0];
	for (let i = 1; i < eles.length; i++) {
		const e = eles[i];
		if (e > pendingPeak) pendingPeak = e;
		// A confirmed rise: commit it and advance the low.
		if (pendingPeak - low >= threshold && e >= pendingPeak - threshold) {
			gain += pendingPeak - low;
			low = e;
			pendingPeak = e;
		} else if (e < low) {
			// New low before any rise confirmed.
			low = e;
			pendingPeak = e;
		}
	}
	if (pendingPeak - low >= threshold) gain += pendingPeak - low;
	return gain;
}

/** Derive sustained climbs from a smoothed series. Advisory, low-confidence,
 *  metrics-only — never a fabricated category. */
export function deriveClimbs(pts: GeoElePoint[]): ClimbCandidate[] {
	const climbs: ClimbCandidate[] = [];
	const n = pts.length;
	let i = 0;
	while (i < n - 1) {
		if (pts[i + 1].ele <= pts[i].ele) {
			i++;
			continue;
		}
		const startIdx = i;
		let peakIdx = i;
		let peakEle = pts[i].ele;
		let j = i;
		while (j < n - 1) {
			j++;
			if (pts[j].ele > peakEle) {
				peakEle = pts[j].ele;
				peakIdx = j;
			} else {
				const descKm = pts[j].km - pts[peakIdx].km;
				const drop = peakEle - pts[j].ele;
				if (descKm > CLIMB_MERGE_GAP_KM || drop > CLIMB_MAX_DROP_M) break;
			}
		}
		const start = pts[startIdx];
		const summit = pts[peakIdx];
		const lengthKm = summit.km - start.km;
		const gainM = summit.ele - start.ele;
		const grade = lengthKm > 0 ? gainM / (lengthKm * 1000) : 0;
		if (
			lengthKm >= CLIMB_MIN_LENGTH_KM &&
			gainM >= CLIMB_MIN_GAIN_M &&
			grade >= CLIMB_MIN_GRADIENT &&
			grade <= CLIMB_MAX_GRADIENT
		) {
			const avgGradient = grade * 100;
			climbs.push({
				startKm: start.km,
				summitKm: summit.km,
				lengthKm,
				gainM,
				avgGradient,
				maxEleM: summit.ele,
				score: lengthKm * avgGradient,
				confidence: 'low'
			});
		}
		i = Math.max(peakIdx, startIdx + 1);
	}
	return climbs;
}

/** Evenly decimate a series to ~target points for rendering. The series is already
 *  smoothed, so even sampling preserves shape; first and last points are kept. */
export function downsample<T>(pts: T[], target: number): T[] {
	if (pts.length <= target || target < 2) return pts.slice();
	const out: T[] = [];
	for (let i = 0; i < target; i++) {
		out.push(pts[Math.round((i * (pts.length - 1)) / (target - 1))]);
	}
	return out;
}

/** Full pipeline: GPX text → render-ready profile + derived metrics + climb candidates.
 *  smoothWindowM defaults to SMOOTHING_WINDOW_M (tuned for noisy recorded rides); pass a
 *  smaller value for clean planner data (e.g. VeloViewer) to avoid shaving real cols. */
export function buildProfile(xml: string, renderPoints = 320, smoothWindowM = SMOOTHING_WINDOW_M): BuiltProfile {
	const track = parseGpxTrack(xml);
	if (track.length < 2) throw new Error('GPX has fewer than 2 trackpoints');
	const uniform = resampleUniform(cumulativeSeries(track));
	const smoothed = smoothElevation(uniform, smoothWindowM);
	const eles = smoothed.map((p) => p.ele);
	return {
		distanceKm: smoothed[smoothed.length - 1].km,
		// Gain from the full-resolution smoothed series (most accurate); the rendered
		// series below is a visual decimation of the same curve, so they agree.
		elevationGainM: elevationGain(eles),
		minEleM: Math.min(...eles),
		maxEleM: Math.max(...eles),
		series: downsample(smoothed, renderPoints),
		climbCandidates: deriveClimbs(smoothed)
	};
}

// ---------------------------------------------------------------------------
// Waypoint parsing (VeloViewer track GPX).
// Waypoints encode authored route furniture in a pipe-delimited <cmt> CDATA:
//   distanceKm | kind | flag | label | (spare)
// Climbs are a komstart→summit PAIR:
//   komstart : <name> carries "LENGTHkm @ GRADIENT%", cmt kind = 'komstart'
//   summit   : cmt kind = komhc|kom1|kom2|kom3|kom4 (categorised) or komna (uncategorised);
//              <name>/label carry the climb name, <ele> the summit altitude.
// Everything else (roundabout, railway, sprint, feed, bidon, town, …) is a feature.
// ---------------------------------------------------------------------------

export interface Waypoint {
	lat: number;
	lon: number;
	ele: number;
	name: string;
	/** Along-route distance (km) from cmt field 1; NaN if absent. */
	distKm: number;
	/** cmt field 2 — e.g. 'komstart', 'kom1', 'komhc', 'sprint', 'roundabout'. */
	kind: string;
	/** cmt field 4 — usually the climb/feature label. */
	label: string;
	/** <type> element — e.g. 'Hors Category', '1st Category', 'Danger', 'Summit'. */
	type: string;
}

/** How a climb's extent (foot→summit) was resolved — see resolveClimbExtent. */
export type ClimbMode = 'clean' | 'chain' | 'walk-back';

/** A climb extracted from a komstart→summit waypoint pair. Carries an authored category. */
export interface GpxClimb {
	/** Cleaned display name (parenthetical/souvenir stripped, ALL-CAPS title-cased). */
	name: string;
	/** Raw VeloViewer label, kept for traceability. */
	rawName: string;
	category: 1 | 2 | 3 | 4 | 'hc';
	startKm: number;
	summitKm: number;
	lengthKm: number | null;
	avgGradient: number | null;
	/** Real ascent (m): GROSS cumulative gain over the resolved extent (counts re-climbing
	 *  after internal dips). Null when the extent can't be resolved. */
	elevationGainM: number | null;
	/** Summit altitude (m) above sea level — distinct from ascent. */
	summitElevation: number;
	/** Which resolver mode set the extent (clean komstart / chain-extend / terrain walk-back). */
	mode: ClimbMode;
}

// Light smoothing default for clean planner data (VeloViewer). Recorded-ride GPX uses
// the heavier SMOOTHING_WINDOW_M instead.
export const PLANNER_SMOOTHING_WINDOW_M = 20;

const FR_PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', "d'"]);

/** Title-case a SHOUTING name while keeping French particles lower (Gavarnie-Gèdre). */
function titleCaseName(s: string): string {
	return s
		.toLowerCase()
		.split(/(\s+|-)/)
		.map((tok, i) => {
			if (/^\s+$/.test(tok) || tok === '-') return tok;
			if (i > 0 && FR_PARTICLES.has(tok)) return tok;
			return tok.charAt(0).toUpperCase() + tok.slice(1);
		})
		.join('');
}

/** Strip the "(1 489 m)" parenthetical + trailing souvenir text; de-shout ALL-CAPS. */
export function cleanClimbName(raw: string): string {
	let name = raw.split(/\s*\(/)[0].trim() || raw.trim();
	if (name && name === name.toUpperCase()) name = titleCaseName(name);
	return name;
}

/** Official summit elevation from a "(2 115 m)" parenthetical, if present. */
export function officialElevation(raw: string): number | null {
	const m = raw.match(/\(([\d\s.]+)\s*m\)/);
	if (!m) return null;
	const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
	return Number.isFinite(n) ? n : null;
}

const KOM_CATEGORY: Record<string, 1 | 2 | 3 | 4 | 'hc'> = {
	komhc: 'hc',
	kom1: 1,
	kom2: 2,
	kom3: 3,
	kom4: 4
};
const SUMMIT_KINDS = new Set([...Object.keys(KOM_CATEGORY), 'komna']);

/** Decode the handful of XML entities VeloViewer emits in names. */
function decodeXmlEntities(s: string): string {
	return s
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
		.replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string {
	const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
	if (!m) return '';
	const cdata = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
	return decodeXmlEntities((cdata ? cdata[1] : m[1]).trim());
}

/** Parse all <wpt> waypoints from a GPX document, in document order. */
export function parseWaypoints(xml: string): Waypoint[] {
	const out: Waypoint[] = [];
	const re = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) {
		const lat = numAttr(m[1], 'lat');
		const lon = numAttr(m[1], 'lon');
		if (lat === null || lon === null) continue;
		const block = m[2];
		const eleStr = tag(block, 'ele');
		const cmt = tag(block, 'cmt');
		const fields = cmt.split('|');
		out.push({
			lat,
			lon,
			ele: eleStr ? +eleStr : NaN,
			name: tag(block, 'name'),
			distKm: fields[0] !== undefined && fields[0] !== '' ? +fields[0] : NaN,
			kind: fields[1] ?? '',
			label: fields[3] ?? '',
			type: tag(block, 'type')
		});
	}
	return out;
}

/** Parse "12.0km @ 6.5%" → { lengthKm, avgGradient }, or nulls if it doesn't match. */
export function parseClimbLabel(name: string): { lengthKm: number | null; avgGradient: number | null } {
	const m = name.match(/([\d.]+)\s*km\s*@\s*([\d.]+)\s*%/i);
	return m ? { lengthKm: +m[1], avgGradient: +m[2] } : { lengthKm: null, avgGradient: null };
}

export interface ExtractedWaypoints {
	/** Categorised climbs (komhc/kom1..4), in route order. */
	climbs: GpxClimb[];
	/** Uncategorised KOM tops (komna) — surfaced for review, not categorised. */
	uncategorised: Waypoint[];
	/** Non-climb furniture, grouped by kind (sprint, feed, bidon, roundabout, …). */
	features: Record<string, Waypoint[]>;
}

// ---- Climb-extent resolver (hybrid) -------------------------------------------------
// VeloViewer's komstart marks the foot of MOST climbs correctly. Two failure modes need
// fixing — and ONLY those, so the correct majority stays correct:
//   • chain     — a long climb split into komstart→komna segments where only the final one
//                 is categorised, so the paired komstart sits part-way up (e.g. Croix de Fer,
//                 5.1km → 24.0km). Extend back through the chain while it stays climb-like.
//   • walk-back — a categorised summit with NO komstart at all (e.g. Grand Ballon). Derive
//                 the foot from terrain: walk back along the track to the climb's base.
// Validated against ASO: every HC/Cat-1 reference within ±0.2km / ±0.1%. The guard constants
// below are locked by unit tests so a future tweak can't silently regress the famous climbs.
export const CHAIN_MIN_GRADIENT = 4.0; // chain-extend accepted only if merged avg ≥ this %
export const WALKBACK_MIN_GRADIENT = 4.5; // walk-back: running-min must keep avg ≥ this %
export const WALKBACK_BARRIER_M = 120; // walk-back: re-ascent above valley-min ⇒ inter-col stop
export const RESOLVER_SMOOTH_M = 200; // extra smoothing for stable gradients / min-finding

function nearestIdx(s: GeoElePoint[], km: number): number {
	let b = 0;
	for (let i = 1; i < s.length; i++) if (Math.abs(s[i].km - km) < Math.abs(s[b].km - km)) b = i;
	return b;
}
function localMaxIdx(s: GeoElePoint[], idx: number, radiusKm = 0.8): number {
	let b = idx;
	for (let i = 0; i < s.length; i++)
		if (Math.abs(s[i].km - s[idx].km) <= radiusKm && s[i].ele > s[b].ele) b = i;
	return b;
}

/**
 * Walk-back mode: from the summit, the foot is the FURTHEST-back running-minimum whose average
 * gradient to the summit stays ≥ minGradient (so dips are walked through — they aren't new
 * lows — while the false-flat valley tail is excluded), stopped by a re-ascent barrier (rising
 * more than barrierM above the running valley-min means we've hit a previous col). Returns base km.
 */
export function walkBackExtent(
	series: GeoElePoint[],
	summitKm: number,
	minGradient = WALKBACK_MIN_GRADIENT,
	barrierM = WALKBACK_BARRIER_M
): number {
	if (series.length === 0) return summitKm;
	const si = localMaxIdx(series, nearestIdx(series, summitKm), 0.8);
	let runMin = series[si].ele;
	let baseIdx = si;
	for (let i = si - 1; i >= 0; i--) {
		if (series[i].ele > runMin + barrierM) break;
		if (series[i].ele < runMin) {
			runMin = series[i].ele;
			const avg = ((series[si].ele - series[i].ele) / ((series[si].km - series[i].km) * 1000)) * 100;
			if (avg >= minGradient) baseIdx = i;
		}
	}
	return series[baseIdx].km;
}

/**
 * Chain/clean mode: kom[summitIdx] is a categorised summit and kom[summitIdx-1] is its paired
 * komstart. Extend the base back through preceding komstart→komna segments (each earlier
 * komstart lower) while the merged average gradient to the summit stays ≥ minGradient. Returns
 * the chosen base komstart index, the mode, and the indices of any komna tops absorbed.
 */
export function chainBase(
	kom: Waypoint[],
	summitIdx: number,
	minGradient = CHAIN_MIN_GRADIENT
): { baseIdx: number; mode: 'clean' | 'chain'; absorbed: number[] } {
	const summit = kom[summitIdx];
	let baseI = summitIdx - 1;
	const absorbed: number[] = [];
	let j = summitIdx - 1;
	while (
		j - 2 >= 0 &&
		kom[j - 1].kind === 'komna' &&
		kom[j - 2].kind === 'komstart' &&
		kom[j - 2].ele < kom[baseI].ele
	) {
		const cand = kom[j - 2];
		const avg = ((summit.ele - cand.ele) / ((summit.distKm - cand.distKm) * 1000)) * 100;
		if (avg >= minGradient) {
			baseI = j - 2;
			absorbed.push(j - 1);
			j -= 2;
		} else break;
	}
	return { baseIdx: baseI, mode: baseI === summitIdx - 1 ? 'clean' : 'chain', absorbed };
}

/**
 * Resolve a categorised climb's extent (foot→summit) and metrics. `series` is the smoothed,
 * neutral-trimmed elevation series in the same km-space as the waypoints. Length = resolved
 * extent; gradient = net rise / length (terrain, uniform across all modes); ascent = GROSS
 * cumulative gain over the extent.
 */
function resolveClimbExtent(
	kom: Waypoint[],
	summitIdx: number,
	series: GeoElePoint[]
): { mode: ClimbMode; startKm: number; lengthKm: number; avgGradient: number; elevationGainM: number; absorbed: number[] } {
	const summit = kom[summitIdx];
	const summitKm = summit.distKm;
	const sEle = series[localMaxIdx(series, nearestIdx(series, summitKm), 0.8)].ele;

	let mode: ClimbMode;
	let baseKm: number;
	let absorbed: number[] = [];
	if (summitIdx === 0 || kom[summitIdx - 1].kind !== 'komstart') {
		mode = 'walk-back';
		baseKm = walkBackExtent(series, summitKm);
	} else {
		const cb = chainBase(kom, summitIdx);
		mode = cb.mode;
		baseKm = kom[cb.baseIdx].distKm;
		absorbed = cb.absorbed;
	}

	const bEle = series[nearestIdx(series, baseKm)].ele;
	const lengthKm = +(summitKm - baseKm).toFixed(2);
	const avgGradient = lengthKm > 0 ? +(((sEle - bEle) / (lengthKm * 1000)) * 100).toFixed(1) : 0;
	const segEles = series.filter((p) => p.km >= baseKm && p.km <= summitKm).map((p) => p.ele);
	const elevationGainM = segEles.length > 1 ? Math.round(elevationGain(segEles)) : 0;
	return { mode, startKm: +baseKm.toFixed(2), lengthKm, avgGradient, elevationGainM, absorbed };
}

/**
 * Resolve waypoints into climbs + features. Climbs are identified by their categorised summit
 * (komhc/kom1..4); their EXTENT (foot, length, gradient, ascent) is set by the hybrid resolver
 * when a `series` is supplied (build pipeline) — otherwise it falls back to the raw komstart
 * pairing. komna tops absorbed into a chain are dropped from `uncategorised`.
 */
export function extractWaypoints(
	wpts: Waypoint[],
	series?: GeoElePoint[]
): ExtractedWaypoints {
	const isKom = (w: Waypoint) => w.kind === 'komstart' || SUMMIT_KINDS.has(w.kind);
	const kom = wpts.filter(isKom);
	const smooth = series && series.length ? smoothElevation(series, RESOLVER_SMOOTH_M) : null;

	const climbs: GpxClimb[] = [];
	const absorbedKomna = new Set<number>();

	for (let i = 0; i < kom.length; i++) {
		const w = kom[i];
		if (!(w.kind in KOM_CATEGORY)) continue; // komstart / komna handled via the summit
		const rawName = w.label || w.name.replace(/^KOM\s+(HC|\d(st|nd|rd|th))?\s*/i, '').trim();
		const base = {
			name: cleanClimbName(rawName),
			rawName,
			category: KOM_CATEGORY[w.kind],
			summitKm: w.distKm,
			summitElevation: officialElevation(rawName) ?? Math.round(w.ele)
		};
		if (smooth) {
			const r = resolveClimbExtent(kom, i, smooth);
			r.absorbed.forEach((idx) => absorbedKomna.add(idx));
			climbs.push({
				...base,
				startKm: r.startKm,
				lengthKm: r.lengthKm,
				avgGradient: r.avgGradient,
				elevationGainM: r.elevationGainM,
				mode: r.mode
			});
		} else {
			// No series: fall back to the raw komstart pairing (label metrics, DEM delta).
			const start = kom[i - 1]?.kind === 'komstart' ? kom[i - 1] : null;
			const label = parseClimbLabel(start?.name ?? '');
			const startKm = start && !Number.isNaN(start.distKm) ? start.distKm : NaN;
			const lengthKm =
				label.lengthKm ?? (Number.isNaN(startKm) ? NaN : +(w.distKm - startKm).toFixed(2));
			const gain = start && !Number.isNaN(start.ele) ? w.ele - start.ele : NaN;
			climbs.push({
				...base,
				startKm,
				lengthKm,
				avgGradient:
					label.avgGradient ??
					(!Number.isNaN(gain) && lengthKm > 0
						? +((gain / (lengthKm * 1000)) * 100).toFixed(1)
						: NaN),
				elevationGainM: Number.isNaN(gain) ? null : Math.round(gain),
				mode: start ? 'clean' : 'walk-back'
			});
		}
	}

	const uncategorised = kom.filter((w, i) => w.kind === 'komna' && !absorbedKomna.has(i));
	const features: Record<string, Waypoint[]> = {};
	for (const w of wpts) if (!isKom(w)) (features[w.kind || 'other'] ??= []).push(w);
	return { climbs, uncategorised, features };
}

/** Cumulative track-km of the trackpoint nearest the km-0 'start' waypoint (0 if none). */
export function neutralOffsetKm(track: TrackPoint[], cum: GeoElePoint[], wpts: Waypoint[]): number {
	const start = wpts.find((w) => w.kind === 'start');
	if (!start) return 0;
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < track.length; i++) {
		const d = haversineMeters(start.lat, start.lon, track[i].lat, track[i].lon);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return cum[best].km;
}

export interface StageBuild {
	/** Ridden distance (km), neutral rollout excluded. */
	distanceKm: number;
	/** Elevation gain (m) over the SAME post-neutral segment as distanceKm. */
	elevationGainM: number;
	minEleM: number;
	maxEleM: number;
	/** Length of the trimmed neutral rollout (km), for reference. */
	neutralKm: number;
	series: GeoElePoint[];
	climbs: GpxClimb[];
	uncategorised: Waypoint[];
	features: Record<string, Waypoint[]>;
}

/**
 * Full real-route pipeline. Trims the neutral rollout (anchored to the km-0 'start'
 * waypoint), then derives distance AND gain over that one post-neutral segment so the
 * headline number and the profile describe the same ride. Climbs/features come from the
 * authored waypoints. Light smoothing by default (clean planner data).
 */
export function buildStageProfile(
	xml: string,
	renderPoints = 320,
	smoothWindowM = PLANNER_SMOOTHING_WINDOW_M
): StageBuild {
	const track = parseGpxTrack(xml);
	if (track.length < 2) throw new Error('GPX has fewer than 2 trackpoints');
	const wpts = parseWaypoints(xml);
	const cum = cumulativeSeries(track);
	const offset = neutralOffsetKm(track, cum, wpts);

	// Clip the neutral rollout and re-base distance to km 0.
	const ridden = (offset > 0 ? cum.filter((p) => p.km >= offset - 1e-9) : cum).map((p) => ({
		...p,
		km: p.km - offset
	}));

	const uniform = resampleUniform(ridden);
	const smoothed = smoothElevation(uniform, smoothWindowM);
	const eles = smoothed.map((p) => p.ele);
	// Pass the smoothed, neutral-trimmed series so climb extents are resolved by the hybrid
	// (clean komstart / chain-extend / terrain walk-back) rather than the raw komstart pairing.
	const { climbs, uncategorised, features } = extractWaypoints(wpts, smoothed);

	return {
		distanceKm: smoothed[smoothed.length - 1].km,
		elevationGainM: elevationGain(eles),
		minEleM: Math.min(...eles),
		maxEleM: Math.max(...eles),
		neutralKm: offset,
		series: downsample(smoothed, renderPoints),
		climbs,
		uncategorised,
		features
	};
}
