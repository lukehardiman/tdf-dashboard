// Build-time GPX → profile JSON generator. Run via `npm run profiles` (and via prebuild).
// Reads gpx-src/stage-N.gpx (real VeloViewer route tracks — build-time input only, never
// served), trims the neutral rollout, derives distance + gain over the same post-neutral
// segment, extracts authored climbs + feature waypoints, and writes a LOSSY (downsampled)
// public JSON per stage plus a tiny previews bundle for the index cards.
//
// Run with Node's native TS support: `node scripts/build-profiles.ts`.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	buildStageProfile,
	parseGpxTrack,
	cumulativeSeries,
	type GeoElePoint,
	type Waypoint
} from '../src/lib/render/gpx.ts';
import { tdf2026 } from '../src/lib/data/tdf2026.ts';

// Dense, road-accurate final-km track for the zoomed finish map. DIAGNOSIS (stages 12/13, raw
// vs downsampled overlaid on OSM): the raw GPX hugs the road at ~11 m spacing — it does NOT chord
// across corners — while the public `track` is decimated to ~540 m and DOES chord badly. So the
// finish map needs no map-matching service; it just needs the raw points for the final stretch.
// We keep them at full resolution (corners are the whole point) for the final few km only.
const FINISH_TRACK_KM = 3;

function finishTrackFor(xml: string, km: number): [number, number][] {
	const cum = cumulativeSeries(parseGpxTrack(xml));
	if (cum.length < 2) return [];
	const endKm = cum[cum.length - 1].km;
	const fromKm = Math.max(0, endKm - km);
	return cum.filter((p) => p.km >= fromKm).map((p) => [round(p.lon, 5), round(p.lat, 5)]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Raw GPX is build-time input only — outside static/, never published.
const gpxDir = join(root, 'gpx-src');
const outDir = join(root, 'src', 'lib', 'data', 'profiles');

const PREVIEW_POINTS = 64;
const round = (v: number, dp: number) => {
	const f = 10 ** dp;
	return Math.round(v * f) / f;
};

function readManifest(): Record<string, string> {
	const path = join(gpxDir, 'source-manifest.json');
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, 'utf8')).stages ?? {};
	} catch {
		return {};
	}
}

const manifest = readManifest();
mkdirSync(outDir, { recursive: true });

const previews: Record<string, [number, number][]> = {};
const summaries: Record<string, { distanceKm: number; elevationGainM: number }> = {};
const rows: string[] = [];
let written = 0;
// Global elevation extent across ALL stages → the shared vertical scale every profile
// renders against (see src/lib/render/profile.ts eleProjection). Data-driven so it
// recalibrates automatically when routes change or a new Tour is added.
let globalMinEle = Infinity;
let globalMaxEle = -Infinity;

for (const stage of tdf2026.stages) {
	const n = stage.n;
	const gpxPath = join(gpxDir, `stage-${n}.gpx`);
	if (!existsSync(gpxPath)) {
		rows.push(`  ${String(n).padStart(2)}  (no GPX — synthesise fallback)`);
		continue;
	}

	const gpxText = readFileSync(gpxPath, 'utf8');
	const built = buildStageProfile(gpxText);

	const series: [number, number][] = built.series.map((p: GeoElePoint) => [round(p.km, 2), round(p.ele, 1)]);
	const track: [number, number][] = built.series.map((p: GeoElePoint) => [round(p.lon, 5), round(p.lat, 5)]);

	// Compact feature waypoints (sparse authored points — kept for timetable / where-to-watch).
	const features: Record<string, { km: number; lat: number; lon: number; name: string; type: string }[]> = {};
	for (const [kind, ws] of Object.entries(built.features)) {
		features[kind] = (ws as Waypoint[]).map((w) => ({
			km: round(w.distKm, 2),
			lat: round(w.lat, 5),
			lon: round(w.lon, 5),
			name: w.name,
			type: w.type
		}));
	}

	const file = {
		stage: n,
		source: manifest[String(n)] ?? `stage-${n}.gpx`,
		distanceKm: round(built.distanceKm, 1),
		elevationGainM: Math.round(built.elevationGainM),
		neutralKm: round(built.neutralKm, 2),
		minEleM: Math.round(built.minEleM),
		maxEleM: Math.round(built.maxEleM),
		series,
		track,
		// Dense final-km track (raw GPX) for the zoomed finish map — corners intact, no decimation.
		finishTrack: finishTrackFor(gpxText, FINISH_TRACK_KM),
		climbs: built.climbs.map((c) => ({
			name: c.name,
			rawName: c.rawName,
			category: c.category,
			startKm: round(c.startKm, 2),
			summitKm: round(c.summitKm, 2),
			lengthKm: round(c.lengthKm, 2),
			avgGradient: round(c.avgGradient, 1),
			elevationGainM: c.elevationGainM,
			summitElevation: c.summitElevation,
			mode: c.mode
		})),
		// Uncategorised KOM tops — flagged for manual review, never assigned a category.
		uncategorisedKoms: built.uncategorised.map((w) => ({
			km: round(w.distKm, 2),
			ele: Math.round(w.ele),
			name: w.name
		})),
		features
	};

	writeFileSync(join(outDir, `stage-${n}.json`), JSON.stringify(file) + '\n');

	previews[String(n)] = downsamplePreview(series);
	summaries[String(n)] = { distanceKm: file.distanceKm, elevationGainM: file.elevationGainM };
	globalMinEle = Math.min(globalMinEle, file.minEleM);
	globalMaxEle = Math.max(globalMaxEle, file.maxEleM);
	written++;

	const dd = Math.round((100 * (file.distanceKm - stage.distanceKm)) / stage.distanceKm);
	const dg = stage.elevationGainM > 0 ? Math.round((100 * (file.elevationGainM - stage.elevationGainM)) / stage.elevationGainM) : 0;
	const flag = Math.abs(dd) > 3 || Math.abs(dg) > 15 ? '  <-- OUTLIER' : '';
	rows.push(
		`  ${String(n).padStart(2)}  dist ${file.distanceKm.toFixed(1).padStart(5)} / ASO ${String(stage.distanceKm).padStart(5)} (${dd >= 0 ? '+' : ''}${dd}%)` +
			`   gain ${String(file.elevationGainM).padStart(5)} / ASO ${String(stage.elevationGainM).padStart(5)} (${dg >= 0 ? '+' : ''}${dg}%)` +
			`   neutral ${file.neutralKm.toFixed(1).padStart(5)}   climbs ${file.climbs.length}${flag}`
	);
}

function downsamplePreview(series: [number, number][]): [number, number][] {
	if (series.length <= PREVIEW_POINTS) return series.map(([km, e]) => [round(km, 1), Math.round(e)]);
	const out: [number, number][] = [];
	for (let i = 0; i < PREVIEW_POINTS; i++) {
		const [km, e] = series[Math.round((i * (series.length - 1)) / (PREVIEW_POINTS - 1))];
		out.push([round(km, 1), Math.round(e)]);
	}
	return out;
}

// CRITICAL: never clobber the committed profile data when the GPX source is absent. gpx-src/ is
// a LOCAL build-time input (gitignored), so on a CI/Vercel build there are no .gpx files — and the
// generated profiles/*.json + previews.json + scale.json ARE the committed deploy artifact. If we
// wrote here with written===0 we'd overwrite real data with an empty previews bundle and a garbage
// scale (Infinity → null), which makes every profile synthesise and overflow its viewBox. So when
// nothing was built, leave the committed files untouched and exit cleanly. Regenerate locally with
// `npm run profiles` whenever the GPX changes, then commit the JSON.
if (written === 0) {
	console.warn(
		`\n⚠ No GPX found in ${gpxDir} — keeping the committed profiles/*.json, previews.json and ` +
			`scale.json as-is. (Expected on deploy builds; gpx-src/ is a local-only build input.)`
	);
	process.exit(0);
}

writeFileSync(join(outDir, 'previews.json'), JSON.stringify(previews) + '\n');
writeFileSync(join(outDir, 'summaries.json'), JSON.stringify(summaries) + '\n');
// Shared cross-stage elevation scale (global low → high). Consumed by eleProjection so
// every profile — index card and detail page — renders on one honest vertical scale.
const scale = { baseEleM: Math.round(globalMinEle), peakEleM: Math.round(globalMaxEle) };
writeFileSync(join(outDir, 'scale.json'), JSON.stringify(scale) + '\n');

console.log(`\nGenerated ${written}/${tdf2026.stages.length} stage profiles → ${outDir}`);
console.log(`Shared elevation scale: ${scale.baseEleM}m → ${scale.peakEleM}m (span ${scale.peakEleM - scale.baseEleM}m)`);
console.log('Calibration — derived (neutral-trimmed) vs ASO; distance & gain over the SAME segment:\n');
console.log(rows.join('\n'));
console.log('');
