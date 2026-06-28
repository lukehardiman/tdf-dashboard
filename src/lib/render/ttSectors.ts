// Framework-free TT sector classifier (spec §5, archetype A).
//
// A time trial has no single decisive moment — the whole ride is the story. So instead of a
// finish-zoom, we keep the WHOLE course in frame and accentuate the sectors that decide a TT by
// DEMAND TYPE: a sustained climb (sustained-power + W/kg), a technical descent or twisty section
// (bike-handling, risk), or a flat power drag (raw sustained watts). This is descriptive terrain
// geometry — gradient from the elevation series, curvature from the track — never a prediction.
//
// No Svelte imports — pure + unit-tested. Curvature uses the track; if a track is absent it
// degrades to gradient-only (climb / descent→technical / flat-power), per the spec fallback.

import { bearing, turnAngle, type LngLat } from './curvature';
import type { ElePoint } from './profile';

// Demand types on a TT course. The two "technical" cases are kept SEPARATE because they ride very
// differently and the elevation profile can't show either: a 'descent' is curvy + downhill (where
// bike-handling actually decides time), 'corners' is twisty but flat (real bends, lower stakes).
// Conflating them under one "technical" label over-claimed "descent" on flat-but-twisty run-ins.
export type SectorType = 'climb' | 'descent' | 'corners' | 'power';

export interface TTSector {
	type: SectorType;
	fromKm: number;
	toKm: number;
	lengthKm: number;
	/** Average gradient over the sector (%, signed). */
	avgGradient: number;
	/** Average heading change over the sector (deg per km) — how twisty it is. */
	turnPerKm: number;
}

// ---- Thresholds (tunable; tuned against S16 ITT / S1 TTT) ----
export const CLIMB_MIN_GRADIENT = 3.0; // sustained up → climb sector
export const DESCENT_MIN_GRADIENT = 3.0; // sustained down (≤ −3%) → technical
export const TECH_TURN_PER_KM = 220; // open road ~70–150°/km; technical 250–560°/km
export const TT_BIN_KM = 0.5; // sampling granularity
export const MIN_SECTOR_KM = 1.5; // shorter runs get absorbed so the course doesn't fragment
export const SUMMIT_TRIM_KM = 0.3; // post-peak rolloff longer than this is cut out of the climb band

/**
 * Classify a single bin's demand type. Climb wins on a real up-gradient; a sustained descent is its
 * own 'descent' (downhill handling/speed); a flat-but-twisty stretch is 'corners'; the rest is
 * flat-out 'power'.
 */
export function classifySectorType(gradientPct: number, turnPerKm: number): SectorType {
	if (gradientPct >= CLIMB_MIN_GRADIENT) return 'climb';
	if (gradientPct <= -DESCENT_MIN_GRADIENT) return 'descent';
	if (turnPerKm >= TECH_TURN_PER_KM) return 'corners';
	return 'power';
}

/** Heading change (deg) accumulated across track indices [i0, i1], absolute per vertex. */
function turnOver(track: LngLat[], i0: number, i1: number): number {
	let sum = 0;
	for (let i = Math.max(1, i0) + 1; i <= i1 && i < track.length; i++) {
		sum += Math.abs(turnAngle(bearing(track[i - 2], track[i - 1]), bearing(track[i - 1], track[i])));
	}
	return sum;
}

/**
 * Segment a whole TT course into demand-type sectors. series & track share an index (same
 * downsampled points). Bins at TT_BIN_KM are classified, run-length-encoded, then short runs are
 * absorbed into their longer neighbour so the result is a handful of readable sectors.
 */
export function classifyTTSectors(
	series: ElePoint[],
	track: LngLat[] | null,
	opts: { binKm?: number; minSectorKm?: number } = {}
): TTSector[] {
	const binKm = opts.binKm ?? TT_BIN_KM;
	const minSectorKm = opts.minSectorKm ?? MIN_SECTOR_KM;
	if (series.length < 2) return [];
	const lastKm = series[series.length - 1].km;
	const hasTrack = !!track && track.length === series.length;

	const idxAt = (km: number) => {
		let i = 0;
		while (i < series.length - 1 && series[i + 1].km < km) i++;
		return i;
	};

	// Per-bin facts.
	type Bin = { fromKm: number; toKm: number; grad: number; turnPerKm: number; type: SectorType };
	const bins: Bin[] = [];
	for (let k = 0; k < lastKm - 1e-6; k += binKm) {
		const to = Math.min(k + binKm, lastKm);
		const i0 = idxAt(k);
		const i1 = idxAt(to);
		const distM = (series[i1].km - series[i0].km) * 1000;
		const grad = distM > 0 ? ((series[i1].ele - series[i0].ele) / distM) * 100 : 0;
		const turnPerKm = hasTrack ? turnOver(track!, i0, i1) / Math.max(1e-6, to - k) : 0;
		bins.push({ fromKm: k, toKm: to, grad, turnPerKm, type: classifySectorType(grad, turnPerKm) });
	}
	if (!bins.length) return [];

	// Run-length encode into sectors.
	let sectors = runLength(bins);
	// Absorb short sectors into a neighbour for readability — but NEVER merge across a summit or
	// valley: a climb must end at its summit, and the descent off it is its own (technical) sector,
	// never swallowed into the red climb band. So a short sector may only fold into a neighbour that
	// isn't gradient-opposite to it. If both neighbours are opposite (a real micro-feature pinned
	// between an up and a down), it stays — the geometry says it's genuinely distinct.
	let merged = true;
	while (merged && sectors.length > 1) {
		merged = false;
		for (let i = 0; i < sectors.length; i++) {
			if (sectors[i].lengthKm >= minSectorKm) continue;
			const left = sectors[i - 1];
			const right = sectors[i + 1];
			// Neighbour indices, longer first (prefer absorbing into the more established sector).
			const cands: number[] = [];
			if (left && right) {
				const leftFirst = left.lengthKm >= right.lengthKm;
				cands.push(leftFirst ? i - 1 : i + 1, leftFirst ? i + 1 : i - 1);
			} else if (left) cands.push(i - 1);
			else if (right) cands.push(i + 1);
			const tIdx = cands.find((ci) => !oppositeGrade(sectors[i], sectors[ci]));
			if (tIdx === undefined) continue; // can't merge without burying a summit/valley — leave it
			const a = Math.min(i, tIdx);
			sectors.splice(a, 2, mergeSectors(sectors[a], sectors[a + 1], bins));
			merged = true;
			break;
		}
	}
	// Coalesce adjacent same-type sectors, but again never across a summit/valley (two climbs split
	// by a real descent must stay split even though both are 'climb').
	for (let i = 0; i < sectors.length - 1; ) {
		if (sectors[i].type === sectors[i + 1].type && !oppositeGrade(sectors[i], sectors[i + 1]))
			sectors.splice(i, 2, mergeSectors(sectors[i], sectors[i + 1], bins));
		else i++;
	}

	// Summit trim: a climb sector must END AT ITS HIGHEST POINT. Between the peak and the bin where
	// the gradient first drops past −3% there's a gentle rolloff that RLE leaves inside the climb
	// run — visually a "climb" band sitting over falling road. Cut each climb at its peak km and
	// hand the post-summit tail to the next sector (which is the descent off it).
	const sectorFromRange = (fromKm: number, toKm: number, type: SectorType): TTSector => {
		const i0 = idxAt(fromKm);
		const i1 = idxAt(toKm);
		const distM = (series[i1].km - series[i0].km) * 1000;
		const grad = distM > 0 ? ((series[i1].ele - series[i0].ele) / distM) * 100 : 0;
		const turnPerKm = hasTrack ? turnOver(track!, i0, i1) / Math.max(1e-6, toKm - fromKm) : 0;
		return { type, fromKm, toKm, lengthKm: toKm - fromKm, avgGradient: +grad.toFixed(1), turnPerKm: Math.round(turnPerKm) };
	};
	const peakKmIn = (fromKm: number, toKm: number): number => {
		let best = { km: fromKm, ele: -Infinity };
		for (const p of series) if (p.km >= fromKm - 1e-9 && p.km <= toKm + 1e-9 && p.ele > best.ele) best = { km: p.km, ele: p.ele };
		return best.km;
	};
	for (let i = 0; i < sectors.length; i++) {
		if (sectors[i].type !== 'climb') continue;
		const pk = peakKmIn(sectors[i].fromKm, sectors[i].toKm);
		if (pk <= sectors[i].fromKm || sectors[i].toKm - pk < SUMMIT_TRIM_KM) continue; // no real post-summit tail
		const tailTo = sectors[i].toKm;
		sectors[i] = sectorFromRange(sectors[i].fromKm, pk, 'climb');
		const next = sectors[i + 1];
		if (next) {
			sectors[i + 1] = sectorFromRange(pk, next.toKm, next.type); // extend the descent back to the summit
		} else {
			// Climb to the line then a short kick down to the finish — its own descent/technical sector.
			const tail = sectorFromRange(pk, tailTo, 'power');
			sectors.splice(i + 1, 0, sectorFromRange(pk, tailTo, classifySectorType(tail.avgGradient, tail.turnPerKm)));
		}
	}
	return sectors;
}

const isAscending = (s: { avgGradient: number }) => s.avgGradient >= CLIMB_MIN_GRADIENT;
const isDescending = (s: { avgGradient: number }) => s.avgGradient <= -DESCENT_MIN_GRADIENT;
/** True when two sectors point opposite ways on the gradient — an up and a down with a turning
 *  point (summit or valley) between them. Such a pair must never be merged. */
function oppositeGrade(a: { avgGradient: number }, b: { avgGradient: number }): boolean {
	return (isAscending(a) && isDescending(b)) || (isDescending(a) && isAscending(b));
}

function runLength(bins: { fromKm: number; toKm: number; grad: number; turnPerKm: number; type: SectorType }[]): TTSector[] {
	const out: { type: SectorType; members: typeof bins }[] = [];
	for (const b of bins) {
		const cur = out[out.length - 1];
		if (cur && cur.type === b.type) cur.members.push(b);
		else out.push({ type: b.type, members: [b] });
	}
	return out.map((r) => {
		const fromKm = r.members[0].fromKm;
		const toKm = r.members[r.members.length - 1].toKm;
		const len = r.members.reduce((s, x) => s + (x.toKm - x.fromKm), 0) || toKm - fromKm;
		const avgGradient = r.members.reduce((s, x) => s + x.grad * (x.toKm - x.fromKm), 0) / len;
		const turnPerKm = r.members.reduce((s, x) => s + x.turnPerKm * (x.toKm - x.fromKm), 0) / len;
		return {
			type: r.type,
			fromKm,
			toKm,
			lengthKm: toKm - fromKm,
			avgGradient: +avgGradient.toFixed(1),
			turnPerKm: Math.round(turnPerKm)
		};
	});
}

function mergeSectors(a: TTSector, b: TTSector, bins: { fromKm: number; toKm: number; grad: number; turnPerKm: number }[]): TTSector {
	const fromKm = Math.min(a.fromKm, b.fromKm);
	const toKm = Math.max(a.toKm, b.toKm);
	const type = a.lengthKm >= b.lengthKm ? a.type : b.type;
	const inRange = bins.filter((x) => x.fromKm >= fromKm - 1e-9 && x.toKm <= toKm + 1e-9);
	const len = inRange.reduce((s, x) => s + (x.toKm - x.fromKm), 0) || toKm - fromKm;
	const avgGradient = inRange.reduce((s, x) => s + x.grad * (x.toKm - x.fromKm), 0) / len;
	const turnPerKm = inRange.reduce((s, x) => s + x.turnPerKm * (x.toKm - x.fromKm), 0) / len;
	return { type, fromKm, toKm, lengthKm: toKm - fromKm, avgGradient: +avgGradient.toFixed(1), turnPerKm: Math.round(turnPerKm) };
}
