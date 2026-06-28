<script lang="ts">
	import type { Stage } from '$lib/data/types';
	import {
		synthesiseSeries,
		buildGeometry,
		gradientAtKm,
		layoutClimbMarkers,
		eleProjection,
		type ClimbMarkerInput,
		type ElePoint,
		type EleScale
	} from '$lib/render/profile';
	import { eleScale } from '$lib/data/profiles';

	let {
		stage,
		series: provided = null,
		/** GPX climbs to mark on the profile. Falls back to the stage's seeded climbs. */
		climbs = null,
		width = 800,
		height = 240,
		interactive = false,
		showMarkers = true,
		/** Shared cross-stage elevation scale. Defaults to the event-wide scale so absolute
		    height is comparable between stages; pass null to opt back into per-stage fit. */
		scale = eleScale,
		onScrub
	}: {
		stage: Stage;
		series?: ElePoint[] | null;
		climbs?: ClimbMarkerInput[] | null;
		width?: number;
		height?: number;
		interactive?: boolean;
		showMarkers?: boolean;
		scale?: EleScale | null;
		onScrub?: (fraction: number | null) => void;
	} = $props();

	const series = $derived(provided ?? synthesiseSeries(stage));

	// Markers need vertical room above (boxes) and below (start/finish labels). The
	// marker-less spark (index cards) uses tight padding so the SHARED elevation scale
	// gets the card's full height — a mountain nearly fills it, a flat hugs the floor.
	const pad = $derived(
		showMarkers
			? { top: 48, right: 16, bottom: 30, left: 16 }
			: { top: 8, right: 10, bottom: 8, left: 10 }
	);

	const geo = $derived(buildGeometry(stage, series, width, height, pad, scale));

	const gradId = $derived(`terr-${stage.n}`);

	// Climb markers from GPX (same data the list shows) — never the stale seeds.
	const markerInputs = $derived<ClimbMarkerInput[]>(
		(climbs ?? stage.climbs).map((c) => ({
			summitKm: c.summitKm,
			category: c.category,
			name: c.name
		}))
	);
	const markers = $derived(
		showMarkers ? layoutClimbMarkers(markerInputs, series, { width, height, pad, scale }) : []
	);

	// Severity colour ramp for the category boxes (cycling convention: green → red → black).
	function catColor(cat: string): string {
		switch (cat) {
			case 'HC':
				return 'var(--t-mountains)';
			case '1':
				return 'var(--terr-hi)';
			case '2':
				return 'var(--t-hills)';
			case '3':
				return 'var(--terr-mid)';
			default:
				return 'var(--terr-lo)';
		}
	}
	const boxW = (cat: string) => (cat === 'HC' ? 22 : 16);

	// Orientation labels at the ends — start/finish town + altitude from the GPX series.
	const startEle = $derived(series.length ? Math.round(series[0].ele) : 0);
	const finishEle = $derived(series.length ? Math.round(series[series.length - 1].ele) : 0);

	// Scrub state (only when interactive).
	let hoverX = $state<number | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

	const maxKm = $derived(series[series.length - 1].km);

	function onMove(e: PointerEvent) {
		if (!interactive || !svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * width;
		hoverX = Math.max(pad.left, Math.min(width - pad.right, px));
	}
	function onLeave() {
		hoverX = null;
	}

	// Emit hover position as a 0..1 route fraction for external sync (e.g. the map).
	const hoverFraction = $derived(
		hoverX == null
			? null
			: Math.min(1, Math.max(0, (hoverX - pad.left) / (width - pad.left - pad.right)))
	);
	$effect(() => {
		onScrub?.(hoverFraction);
	});

	// Below this magnitude the road is effectively flat — don't show noise like "0.3%".
	const FLAT_GRADE = 1;

	// Severity colour for the gradient readout: climbs ramp green→amber→red (matching the
	// profile fill); descents read neutral. Distinguished from climbs by both sign & colour.
	function gradeColor(g: number): string {
		if (g <= -FLAT_GRADE) return 'var(--text-2)';
		const a = Math.abs(g);
		if (a < 4) return 'var(--terr-lo)';
		if (a < 7) return 'var(--terr-mid)';
		return 'var(--terr-hi)';
	}

	const hoverData = $derived.by(() => {
		if (hoverX == null) return null;
		const t = (hoverX - pad.left) / (width - pad.left - pad.right);
		const km = t * maxKm;
		const idx = Math.round((km / maxKm) * (series.length - 1));
		const p = series[Math.max(0, Math.min(series.length - 1, idx))];
		// Same shared projection as the line/markers so the scrub dot rides the drawn profile.
		const y = eleProjection(series, height, pad, scale)(p.ele);
		const grade = gradientAtKm(series, km);
		return { km: p.km, ele: p.ele, x: hoverX, y, grade };
	});
</script>

<svg
	bind:this={svgEl}
	viewBox="0 0 {width} {height}"
	style="aspect-ratio: {width} / {height};"
	class="profile"
	class:interactive
	role="img"
	aria-label="Elevation profile for stage {stage.n}"
	onpointermove={onMove}
	onpointerleave={onLeave}
>
	<defs>
		<linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
			<stop offset="0%" stop-color="var(--terr-lo)" stop-opacity="0.55" />
			<stop offset="55%" stop-color="var(--terr-mid)" stop-opacity="0.45" />
			<stop offset="100%" stop-color="var(--terr-hi)" stop-opacity="0.65" />
		</linearGradient>
	</defs>

	<!-- filled terrain -->
	<path d={geo.areaPath} fill="url(#{gradId})" />
	<!-- profile line -->
	<path
		d={geo.linePath}
		fill="none"
		stroke="var(--text)"
		stroke-width="1.6"
		stroke-linejoin="round"
		opacity="0.9"
	/>

	{#if showMarkers}
		<!-- Orientation labels: where the stage starts and finishes, with altitudes. -->
		<text x={pad.left} y={height - 8} class="end-label" text-anchor="start">
			{stage.start.name} · {startEle}m
		</text>
		<text x={width - pad.right} y={height - 8} class="end-label" text-anchor="end">
			{stage.finish.name} · {finishEle}m
		</text>

		{#each markers as m (m.name + m.x)}
			<g class="marker">
				<!-- stem from the box down to the summit on the line -->
				<line
					x1={m.boxX}
					y1={m.boxY + 7}
					x2={m.x}
					y2={m.summitY}
					stroke={catColor(m.category)}
					stroke-width="1"
					opacity="0.5"
				/>
				<circle cx={m.x} cy={m.summitY} r="2.4" fill={catColor(m.category)} />
				{#if m.showName}
					<text x={m.boxX} y={m.boxY - 9} class="marker-name" text-anchor="middle">{m.name}</text>
				{/if}
				<rect
					x={m.boxX - boxW(m.category) / 2}
					y={m.boxY - 7}
					width={boxW(m.category)}
					height="14"
					rx="3"
					fill="color-mix(in srgb, {catColor(m.category)} 18%, var(--surface))"
					stroke={catColor(m.category)}
					stroke-width="1"
				/>
				<text x={m.boxX} y={m.boxY + 3.5} class="marker-cat" text-anchor="middle" fill={catColor(m.category)}>
					{m.category}
				</text>
			</g>
		{/each}
	{/if}

	{#if interactive && hoverData}
		<g class="scrub" style="pointer-events:none">
			<line
				x1={hoverData.x}
				y1={pad.top}
				x2={hoverData.x}
				y2={height - pad.bottom}
				stroke="var(--jaune-text)"
				stroke-width="1"
				opacity="0.7"
			/>
			<circle cx={hoverData.x} cy={hoverData.y} r="4" fill="var(--jaune-text)" />
			<g transform="translate({hoverData.x},{Math.max(pad.top, hoverData.y - 12)})">
				<text text-anchor="middle" class="scrub-label">
					{hoverData.km.toFixed(1)}km · {Math.round(hoverData.ele)}m{#if Math.abs(hoverData.grade) >= FLAT_GRADE}
						· <tspan style="fill: {gradeColor(hoverData.grade)}"
							>{hoverData.grade > 0 ? '' : '−'}{Math.abs(hoverData.grade).toFixed(1)}%</tspan
						>{/if}
				</text>
			</g>
		</g>
	{/if}
</svg>

<style>
	.profile {
		display: block;
		width: 100%;
		height: auto;
		/* aspect-ratio (inline) gives Safari a real intrinsic height for height:auto — without it
		   Safari can mis-size a viewBox-only SVG and, with overflow:visible, paint the terrain/
		   markers outside the box (up into the map above). Annotations still overflow freely WITHIN
		   the profile; the profile-pane clips the top edge against the map. */
		overflow: visible;
	}
	.interactive {
		touch-action: none;
		cursor: crosshair;
	}
	.marker-cat {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 700;
	}
	.marker-name {
		font-family: var(--font-body);
		font-size: 9.5px;
		font-weight: 600;
		fill: var(--text-2);
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
		/* Halo in the profile's ground colour so the readout (and the severity-coloured
		   gradient %) stays legible over the warm climb shading — works on dark AND light
		   because --surface flips with the theme. Painted behind the glyphs. */
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
</style>
