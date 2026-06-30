<script lang="ts">
	// The merged TT course view (archetypes A = itt/ttt). A time trial is decided across the WHOLE
	// course, so there's no finish-zoom — instead this is the ONE rich profile for a TT stage,
	// replacing the generic shared-scale profile + a separate decisive-zone graphic (which showed the
	// same course twice). It combines:
	//   • LOCAL vertical exaggeration so a short, low-relief TT actually reads (the main profile's
	//     shared scale is for cross-stage comparison; a single TT page doesn't need that and a flat
	//     TTT would render as a dead line under it).
	//   • SCRUB to read distance / altitude / gradient (and sync the map dot, like the main profile).
	//   • a SECTOR STRIP of demand types beneath — the analysis the elevation line can't show.
	//   • CORNER markers from the track — sharp bends are invisible on a profile; this is the point.
	// Technical terrain is EMPHASISED (descent + corners), the obvious climb/power demands muted —
	// the elevation line already shows those. Descriptive geometry, never a prediction.
	import { classifyTTSectors, type SectorType } from '$lib/render/ttSectors';
	import { gradientAtKm, type ElePoint, type ClimbMarkerInput } from '$lib/render/profile';
	import { detectCorners, type LngLat } from '$lib/render/curvature';
	import { alignTrack } from '$lib/render/route';

	// Demand-type palette — deliberately NOT the gradient-severity ramp (whose green means
	// "shallow"). These hues label demand TYPE, not steepness. One source of truth for strip+legend.
	const SECTOR_COLOR: Record<SectorType, string> = {
		descent: 'var(--t-itt)', // technical descent — downhill handling, the decisive demand
		corners: 'var(--t-hills)', // twisty but flat — real bends, lower stakes
		climb: 'var(--t-mountains)', // sustained-power climb
		power: 'var(--text-3)' // flat, straight, sustained watts (muted)
	};
	const SECTOR_LABEL: Record<SectorType, string> = {
		descent: 'Descent',
		corners: 'Corners',
		climb: 'Climb',
		power: 'Power'
	};
	// Technical demands are the value-add (invisible on the line) → full strength; the obvious
	// climb/power demands are de-emphasised because the elevation line already shows them.
	const isTechnical = (t: SectorType) => t === 'descent' || t === 'corners';

	let {
		series,
		track,
		climbs = [],
		stageN,
		width = 1000,
		height = 250,
		onScrub
	}: {
		series: ElePoint[];
		track: LngLat[] | null;
		climbs?: ClimbMarkerInput[];
		stageN: number;
		width?: number;
		height?: number;
		onScrub?: (fraction: number | null) => void;
	} = $props();

	const pad = { top: 24, right: 16, bottom: 48, left: 16 };
	const stripH = 20;
	const innerW = $derived(width - pad.left - pad.right);
	const profileBottom = $derived(height - pad.bottom - stripH - 10);

	const lastKm = $derived(series.length ? series[series.length - 1].km : 1);
	const x = $derived((km: number) => pad.left + (km / lastKm) * innerW);
	// LOCAL vertical scale — exaggerate THIS stage's own range so the shape reads.
	const eles = $derived(series.map((p) => p.ele));
	const eMin = $derived(eles.length ? Math.min(...eles) : 0);
	const eMax = $derived(eles.length ? Math.max(...eles) : 1);
	const yProj = $derived((ele: number) => {
		const usable = profileBottom - pad.top;
		return profileBottom - ((ele - eMin) / Math.max(10, eMax - eMin)) * usable * 0.95;
	});

	// The served map `track` is now an RDP track (dense in corners, NOT index-aligned with the
	// elevation series). Resample it onto the series' km grid so the sector/corner analysis — which
	// assumes track[i] ↔ series[i] — gets an aligned track. (The map above still uses the full RDP.)
	const analysisTrack = $derived(
		track && track.length >= 2 ? alignTrack(track, series.map((p) => p.km), lastKm) : null
	);
	const sectors = $derived(classifyTTSectors(series, analysisTrack));
	// Sharp bends only — hairpins and tight corners, not every gentle sweep (keeps the layer legible).
	const corners = $derived(analysisTrack ? detectCorners(analysisTrack, { minTurnDeg: 110 }) : []);

	const linePath = $derived('M' + series.map((p) => `${x(p.km).toFixed(2)} ${yProj(p.ele).toFixed(2)}`).join(' L'));
	const areaPath = $derived(
		series.length ? linePath + ` L${x(lastKm).toFixed(2)} ${profileBottom} L${pad.left} ${profileBottom} Z` : ''
	);

	const stripTop = $derived(profileBottom + 10);

	// A categorised climb whose summit falls in a climb sector → label it by name.
	function climbName(fromKm: number, toKm: number): string | null {
		const c = climbs.find((c) => c.summitKm >= fromKm && c.summitKm <= toKm + 0.5);
		return c ? c.name : null;
	}

	const ticks = $derived.by(() => {
		const out: number[] = [];
		const step = Math.max(1, Math.ceil(lastKm / 9));
		for (let k = 0; k <= lastKm + 1e-6; k += step) out.push(Math.round(k));
		return out;
	});

	const startEle = $derived(series.length ? Math.round(series[0].ele) : 0);
	const finishEle = $derived(series.length ? Math.round(series[series.length - 1].ele) : 0);

	// ---- Scrub (distance / altitude / gradient), mirroring the main profile ----
	let hoverX = $state<number | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

	function onMove(e: PointerEvent) {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * width;
		hoverX = Math.max(pad.left, Math.min(width - pad.right, px));
	}
	function onLeave() {
		hoverX = null;
	}

	const hoverFraction = $derived(hoverX == null ? null : Math.min(1, Math.max(0, (hoverX - pad.left) / innerW)));
	$effect(() => {
		onScrub?.(hoverFraction);
	});

	const FLAT_GRADE = 1;
	function gradeColor(g: number): string {
		if (g <= -FLAT_GRADE) return 'var(--text-2)';
		const a = Math.abs(g);
		if (a < 4) return 'var(--terr-lo)';
		if (a < 7) return 'var(--terr-mid)';
		return 'var(--terr-hi)';
	}

	const hoverData = $derived.by(() => {
		if (hoverX == null || !series.length) return null;
		const t = (hoverX - pad.left) / innerW;
		const km = t * lastKm;
		const idx = Math.round((km / lastKm) * (series.length - 1));
		const p = series[Math.max(0, Math.min(series.length - 1, idx))];
		return { km: p.km, ele: p.ele, x: hoverX, y: yProj(p.ele), grade: gradientAtKm(series, km) };
	});
</script>

<svg
	bind:this={svgEl}
	viewBox="0 0 {width} {height}"
	style="aspect-ratio: {width} / {height};"
	class="tt"
	role="img"
	aria-label="Time Trial Course for stage {stageN}: elevation, demand-type sectors and corners"
	onpointermove={onMove}
	onpointerleave={onLeave}
>
	<!-- honest, locally-scaled profile -->
	{#if areaPath}<path d={areaPath} fill="var(--terr-lo)" fill-opacity="0.22" />{/if}
	<path d={linePath} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" opacity="0.92" />

	<!-- technical sectors shaded up onto the profile too: where the road is twisty/downhill, the
	     elevation line alone can't tell you — this puts that invisible info on the line itself. -->
	{#each sectors as s (s.fromKm)}
		{#if isTechnical(s.type)}
			<rect x={x(s.fromKm)} y={pad.top} width={x(s.toKm) - x(s.fromKm)} height={profileBottom - pad.top}
				fill={SECTOR_COLOR[s.type]} fill-opacity="0.08" />
		{/if}
	{/each}

	<!-- corner markers: sharp bends, invisible on a profile. Triangle points in the turn direction. -->
	{#each corners as c (c.km)}
		{@const cx = x(c.km)}
		{@const cy = profileBottom - 2}
		<path
			d={c.dir === 'L' ? `M${cx - 5} ${cy - 4} L${cx + 3} ${cy - 8} L${cx + 3} ${cy} Z` : `M${cx + 5} ${cy - 4} L${cx - 3} ${cy - 8} L${cx - 3} ${cy} Z`}
			fill="var(--t-itt)"
			opacity="0.9"
		/>
	{/each}

	<!-- demand-type sector strip -->
	{#each sectors as s (s.fromKm)}
		{@const w = x(s.toKm) - x(s.fromKm)}
		{@const tech = isTechnical(s.type)}
		<g>
			<rect x={x(s.fromKm)} y={stripTop} width={w} height={stripH} fill={SECTOR_COLOR[s.type]}
				fill-opacity={tech ? 0.92 : 0.32} />
			{#if w > 50}
				<text x={x(s.fromKm) + w / 2} y={stripTop + 14} class="sector-label" class:muted={!tech}
					text-anchor="middle">{climbName(s.fromKm, s.toKm) ?? SECTOR_LABEL[s.type]}</text>
			{/if}
		</g>
	{/each}

	<!-- orientation: start/finish town altitude -->
	<text x={pad.left} y={profileBottom - 6} class="end-label" text-anchor="start">{startEle}m</text>
	<text x={width - pad.right} y={profileBottom - 6} class="end-label" text-anchor="end">{finishEle}m</text>

	<!-- distance axis (km from the start) -->
	{#each ticks as k (k)}
		<text x={x(k)} y={height - 22} class="tick" text-anchor="middle">{k}km</text>
	{/each}

	<!-- scrub readout -->
	{#if hoverData}
		<g class="scrub" style="pointer-events:none">
			<line x1={hoverData.x} y1={pad.top} x2={hoverData.x} y2={profileBottom} stroke="var(--jaune-text)" stroke-width="1" opacity="0.7" />
			<circle cx={hoverData.x} cy={hoverData.y} r="4" fill="var(--jaune-text)" />
			<g transform="translate({hoverData.x},{Math.max(pad.top, hoverData.y - 12)})">
				<text text-anchor="middle" class="scrub-label">
					{hoverData.km.toFixed(1)}km · {Math.round(hoverData.ele)}m{#if Math.abs(hoverData.grade) >= FLAT_GRADE}
						· <tspan style="fill: {gradeColor(hoverData.grade)}">{hoverData.grade > 0 ? '' : '−'}{Math.abs(hoverData.grade).toFixed(1)}%</tspan>{/if}
				</text>
			</g>
		</g>
	{/if}
</svg>

<div class="legend mono">
	<span><i style="background: {SECTOR_COLOR.descent}"></i> Descent · downhill handling</span>
	<span><i style="background: {SECTOR_COLOR.corners}"></i> Corners · twisty, flat</span>
	<span class="dim"><i style="background: {SECTOR_COLOR.climb}"></i> Climb · sustained power</span>
	<span class="dim"><i style="background: {SECTOR_COLOR.power}"></i> Power · flat, straight</span>
	{#if corners.length}<span><i class="tri"></i> Sharp corner</span>{/if}
</div>

<style>
	.tt {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		touch-action: none;
		cursor: crosshair;
	}
	.sector-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 700;
		fill: var(--ink);
	}
	.sector-label.muted {
		fill: var(--text-2);
		font-weight: 600;
	}
	.tick {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--text-3);
	}
	.end-label {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--text-3);
	}
	.scrub-label {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--jaune-text);
		font-weight: 600;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		margin-top: 10px;
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.legend .dim {
		opacity: 0.6;
	}
	.legend i {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		display: inline-block;
	}
	.legend i.tri {
		width: 0;
		height: 0;
		border-radius: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-bottom: 9px solid var(--t-itt);
	}
</style>
