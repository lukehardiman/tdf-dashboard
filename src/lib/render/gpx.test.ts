import { describe, it, expect } from 'vitest';
import {
	parseGpxTrack,
	haversineMeters,
	cumulativeSeries,
	resampleUniform,
	smoothElevation,
	elevationGain,
	deriveClimbs,
	downsample,
	buildProfile,
	walkBackExtent,
	chainBase,
	extractWaypoints,
	WALKBACK_MIN_GRADIENT,
	WALKBACK_BARRIER_M,
	CHAIN_MIN_GRADIENT,
	type TrackPoint,
	type GeoElePoint,
	type Waypoint
} from './gpx';

// Build a minimal StravaGPX-shaped document from points, including the extensions
// block the real files carry — so the parser is exercised against realistic noise.
function gpx(points: { lat: number; lon: number; ele: number }[]): string {
	const trkpts = points
		.map(
			(p) => `   <trkpt lat="${p.lat}" lon="${p.lon}">
    <ele>${p.ele}</ele>
    <time>2015-07-23T05:59:35Z</time>
    <extensions>
     <gpxtpx:TrackPointExtension>
      <gpxtpx:atemp>11</gpxtpx:atemp>
     </gpxtpx:TrackPointExtension>
    </extensions>
   </trkpt>`
		)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk><name>Test</name><type>cycling</type><trkseg>
${trkpts}
 </trkseg></trk>
</gpx>`;
}

describe('gpx: parseGpxTrack', () => {
	it('extracts every trackpoint with lat/lon/ele', () => {
		const pts = parseGpxTrack(
			gpx([
				{ lat: 45.1, lon: 6.1, ele: 1000 },
				{ lat: 45.2, lon: 6.2, ele: 1100.5 },
				{ lat: 45.3, lon: 6.3, ele: 1200 }
			])
		);
		expect(pts).toHaveLength(3);
		expect(pts[1]).toEqual({ lat: 45.2, lon: 6.2, ele: 1100.5 });
	});

	it('parses negative and zero elevations (real barometric noise)', () => {
		const pts = parseGpxTrack(
			gpx([
				{ lat: -34.1, lon: 18.4, ele: -0.8 },
				{ lat: -34.2, lon: 18.5, ele: 0 }
			])
		);
		expect(pts[0].ele).toBe(-0.8);
		expect(pts[1].lat).toBe(-34.2);
	});

	it('returns empty for non-track content', () => {
		expect(parseGpxTrack('<gpx></gpx>')).toEqual([]);
	});
});

describe('gpx: haversineMeters', () => {
	it('measures ~111.2 km for one degree of latitude', () => {
		expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111195, -2);
	});

	it('is zero for identical points', () => {
		expect(haversineMeters(45, 6, 45, 6)).toBe(0);
	});
});

describe('gpx: cumulativeSeries', () => {
	it('starts at 0 and increases monotonically', () => {
		const cum = cumulativeSeries([
			{ lat: 45.0, lon: 6.0, ele: 100 },
			{ lat: 45.01, lon: 6.0, ele: 110 },
			{ lat: 45.02, lon: 6.0, ele: 120 }
		]);
		expect(cum[0].km).toBe(0);
		expect(cum[1].km).toBeGreaterThan(0);
		expect(cum[2].km).toBeGreaterThan(cum[1].km);
		expect(cum[2].ele).toBe(120);
	});
});

describe('gpx: resampleUniform', () => {
	const cum = cumulativeSeries([
		{ lat: 45.0, lon: 6.0, ele: 0 },
		{ lat: 45.05, lon: 6.0, ele: 500 } // ~5.5 km, linear rise to 500m
	]);

	it('produces near-uniform spacing', () => {
		const r = resampleUniform(cum, 50);
		const gaps = r.slice(1).map((p, i) => (p.km - r[i].km) * 1000);
		for (const g of gaps.slice(0, -1)) expect(g).toBeCloseTo(50, 1);
	});

	it('preserves the route endpoints', () => {
		const r = resampleUniform(cum, 50);
		expect(r[0].km).toBe(0);
		expect(r[r.length - 1].km).toBeCloseTo(cum[cum.length - 1].km, 5);
	});

	it('linearly interpolates elevation', () => {
		const r = resampleUniform(cum, 50);
		const totalKm = cum[cum.length - 1].km;
		// Every resampled point sits proportionally on the 0→500 m ramp.
		for (const p of r) expect(p.ele).toBeCloseTo((p.km / totalKm) * 500, 1);
	});
});

describe('gpx: smoothElevation', () => {
	it('damps a single-sample spike but keeps length and geo', () => {
		const flat: GeoElePoint[] = Array.from({ length: 21 }, (_, i) => ({
			km: i * 0.02,
			ele: 100,
			lat: 45 + i * 0.0001,
			lon: 6
		}));
		flat[10].ele = 200; // 100m spike
		const sm = smoothElevation(flat, 120, 20);
		expect(sm).toHaveLength(flat.length);
		expect(sm[10].ele).toBeLessThan(160); // spike attenuated
		expect(sm[10].lat).toBe(flat[10].lat); // geo untouched
	});
});

describe('gpx: elevationGain', () => {
	it('sums a clean monotonic climb exactly', () => {
		expect(elevationGain([0, 100, 200, 300])).toBe(300);
	});

	it('ignores sub-threshold jitter (no phantom metres)', () => {
		// Flat 100m line with ±1m noise — well under the 3m threshold.
		const noisy = [100, 101, 99, 100, 101, 99, 100];
		expect(elevationGain(noisy, 3)).toBe(0);
	});

	it('reports less than a naive positive-delta sum on noisy data', () => {
		const noisy = [0, 5, 3, 8, 6, 12, 10, 15];
		let naive = 0;
		for (let i = 1; i < noisy.length; i++) if (noisy[i] > noisy[i - 1]) naive += noisy[i] - noisy[i - 1];
		expect(elevationGain(noisy, 3)).toBeLessThanOrEqual(naive);
		expect(elevationGain(noisy, 3)).toBeGreaterThan(0);
	});

	it('counts a descent-then-climb as two separate ascents only for the up parts', () => {
		expect(elevationGain([0, 100, 0, 100])).toBe(200);
	});
});

describe('gpx: known-elevation fixture within tolerance', () => {
	it('recovers a built climb of ~600 m within 5%', () => {
		// 600m climb over ~6.6 km (lat 45.0→45.06), with ±1.5m alternating noise.
		const pts = Array.from({ length: 121 }, (_, i) => ({
			lat: 45 + i * 0.0005,
			lon: 6,
			ele: i * 5 + (i % 2 === 0 ? 1.5 : -1.5)
		}));
		const built = buildProfile(gpx(pts));
		expect(built.elevationGainM).toBeGreaterThan(570);
		expect(built.elevationGainM).toBeLessThan(630);
	});
});

describe('gpx: deriveClimbs', () => {
	function ramp(fromKm: number, toKm: number, fromEle: number, toEle: number, stepKm = 0.02): GeoElePoint[] {
		const out: GeoElePoint[] = [];
		const n = Math.round((toKm - fromKm) / stepKm);
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			out.push({ km: fromKm + (toKm - fromKm) * t, ele: fromEle + (toEle - fromEle) * t, lat: 45, lon: 6 });
		}
		return out;
	}

	it('detects a sustained climb with sane metrics and no fabricated category', () => {
		// 5 km flat, then 10 km climb gaining 700m (7%).
		const series = [...ramp(0, 5, 100, 100), ...ramp(5, 15, 100, 800)];
		const climbs = deriveClimbs(series);
		expect(climbs).toHaveLength(1);
		const c = climbs[0];
		expect(c.summitKm).toBeCloseTo(15, 0);
		expect(c.gainM).toBeCloseTo(700, -1);
		expect(c.avgGradient).toBeCloseTo(7, 0);
		expect(c.confidence).toBe('low');
		expect(c).not.toHaveProperty('category');
	});

	it('ignores gentle terrain below the gradient/gain thresholds', () => {
		const series = ramp(0, 20, 100, 180); // 80m over 20km = 0.4%
		expect(deriveClimbs(series)).toHaveLength(0);
	});
});

describe('gpx: downsample', () => {
	it('returns the target count and keeps endpoints', () => {
		const arr = Array.from({ length: 1000 }, (_, i) => i);
		const d = downsample(arr, 100);
		expect(d).toHaveLength(100);
		expect(d[0]).toBe(0);
		expect(d[d.length - 1]).toBe(999);
	});

	it('passes through when already small enough', () => {
		expect(downsample([1, 2, 3], 100)).toEqual([1, 2, 3]);
	});
});

describe('gpx: buildProfile (integration)', () => {
	const pts: { lat: number; lon: number; ele: number }[] = [];
	for (let i = 0; i <= 200; i++) {
		pts.push({ lat: 45 + i * 0.0004, lon: 6, ele: 200 + 800 * Math.sin((i / 200) * Math.PI) });
	}

	it('returns a render series, distance, gain and climbs', () => {
		const built = buildProfile(gpx(pts), 120);
		expect(built.series.length).toBeLessThanOrEqual(120);
		expect(built.distanceKm).toBeGreaterThan(0);
		expect(built.elevationGainM).toBeGreaterThan(700); // ~800m up the sine hill
		expect(built.maxEleM).toBeGreaterThan(built.minEleM);
		expect(built.series[0].lat).toBeCloseTo(45, 1);
		expect(built.climbCandidates.length).toBeGreaterThanOrEqual(1);
	});

	it('throws on a track with too few points', () => {
		expect(() => buildProfile(gpx([{ lat: 45, lon: 6, ele: 100 }]))).toThrow();
	});
});

// ---- Climb-extent resolver: the hybrid that fixes the two failure modes ----
// Synthetic fixtures (no GPX files) so the algorithm + guards are locked independent of the
// raw data. The end-to-end famous-climb numbers are guarded separately by scripts/validate-climbs.ts.

function series(pts: { km: number; ele: number }[]): GeoElePoint[] {
	return pts.map((p) => ({ km: p.km, ele: p.ele, lat: 0, lon: 0 }));
}
// Dense series (10 m) linearly interpolated through the given waypoints.
function denseSeries(nodes: { km: number; ele: number }[]): GeoElePoint[] {
	const out: GeoElePoint[] = [];
	for (let i = 0; i < nodes.length - 1; i++) {
		const a = nodes[i], b = nodes[i + 1];
		for (let km = a.km; km < b.km; km += 0.01) {
			const t = (km - a.km) / (b.km - a.km);
			out.push({ km: +km.toFixed(3), ele: a.ele + (b.ele - a.ele) * t, lat: 0, lon: 0 });
		}
	}
	out.push({ ...nodes[nodes.length - 1], lat: 0, lon: 0 });
	return out;
}
function wp(kind: string, distKm: number, ele: number, name = ''): Waypoint {
	return { lat: 0, lon: 0, ele, name, distKm, kind, label: '', type: '' };
}

describe('gpx: walkBackExtent (missing-komstart, like Grand Ballon)', () => {
	it('finds the foot where sustained climbing begins, skipping the false-flat valley', () => {
		// Flat-ish valley 0→5km (~100m), then a steady climb to 1000m at 15km.
		const s = denseSeries([{ km: 0, ele: 110 }, { km: 5, ele: 100 }, { km: 15, ele: 1000 }]);
		const base = walkBackExtent(s, 15);
		expect(base).toBeGreaterThan(4.5);
		expect(base).toBeLessThan(5.5); // foot at the valley, not dragged back to km 0
	});

	it('stops at the inter-col valley (re-ascent barrier), not the previous summit', () => {
		// peak1 600m @ 8km, deep valley 300m @ 12km, our summit 1000m @ 20km.
		const s = denseSeries([
			{ km: 0, ele: 200 }, { km: 8, ele: 600 }, { km: 12, ele: 300 }, { km: 20, ele: 1000 }
		]);
		const base = walkBackExtent(s, 20);
		expect(base).toBeGreaterThan(11.5);
		expect(base).toBeLessThan(12.5); // stops at the 12km valley, doesn't cross peak1
	});

	it('GUARD: 120m barrier — a dip shallower than the barrier is walked through', () => {
		// internal dip of only 60m (110m below would be < barrier): climb continues through it.
		const s = denseSeries([
			{ km: 0, ele: 100 }, { km: 6, ele: 700 }, { km: 8, ele: 640 }, { km: 14, ele: 1000 }
		]);
		const base = walkBackExtent(s, 14);
		expect(base).toBeLessThan(1); // walked through the 60m dip back to the true foot
		expect(WALKBACK_BARRIER_M).toBe(120);
	});

	it('GUARD: 4.5% floor — a lower threshold reaches further back', () => {
		expect(WALKBACK_MIN_GRADIENT).toBe(4.5);
		const s = denseSeries([{ km: 0, ele: 100 }, { km: 10, ele: 400 }, { km: 16, ele: 1000 }]);
		const strict = walkBackExtent(s, 16, 6); // upper section ~10%, lower ~3%
		const loose = walkBackExtent(s, 16, 2.5);
		expect(loose).toBeLessThanOrEqual(strict); // lower floor extends the foot back (or equal)
	});
});

describe('gpx: chainBase (misplaced-komstart chain, like Croix de Fer)', () => {
	// kom list: komstart(cs1) → komna → komstart(cs0) → summit. cs0 sits part-way up.
	const build = (cs1Ele: number) => [
		wp('komstart', 10, cs1Ele),
		wp('komna', 12, 850),
		wp('komstart', 15, 800),
		wp('kom1', 20, 1000, 'KOM 1st Test (1000 m)')
	];

	it('extends through the chain when the merged climb stays steep (≥4%)', () => {
		// cs1 @ 590m → merged avg (1000-590)/(10km) = 4.1% ≥ 4 → CHAIN
		const r = chainBase(build(590), 3);
		expect(r.mode).toBe('chain');
		expect(r.baseIdx).toBe(0); // first komstart of the chain
		expect(r.absorbed).toContain(1); // the komna is absorbed
	});

	it('GUARD: rejects the extension when the merge would be too shallow (<4%)', () => {
		// cs1 @ 610m → merged avg (1000-610)/(10km) = 3.9% < 4 → stays CLEAN on cs0
		const r = chainBase(build(610), 3);
		expect(r.mode).toBe('clean');
		expect(r.baseIdx).toBe(2); // the paired komstart, unextended
		expect(r.absorbed).toHaveLength(0);
		expect(CHAIN_MIN_GRADIENT).toBe(4.0);
	});
});

describe('gpx: extractWaypoints assigns the right mode + absorbs chained komna', () => {
	it('clean for a single komstart, chain for a multi-segment summit', () => {
		const wpts: Waypoint[] = [
			wp('komstart', 10, 590),
			wp('komna', 12, 850),
			wp('komstart', 15, 800),
			wp('kom1', 20, 1000, 'KOM 1st Chain (1000 m)'),
			wp('komstart', 40, 500),
			wp('komhc', 50, 1400, 'KOM HC Clean (1400 m)')
		];
		const s = denseSeries([
			{ km: 0, ele: 300 }, { km: 10, ele: 590 }, { km: 20, ele: 1000 },
			{ km: 30, ele: 480 }, { km: 40, ele: 500 }, { km: 50, ele: 1400 }
		]);
		const { climbs, uncategorised } = extractWaypoints(wpts, s);
		const chain = climbs.find((c) => c.name === 'Chain');
		const clean = climbs.find((c) => c.name === 'Clean');
		expect(chain?.mode).toBe('chain');
		expect(clean?.mode).toBe('clean');
		// the chained komna is absorbed, so it must NOT remain uncategorised
		expect(uncategorised).toHaveLength(0);
	});
});
