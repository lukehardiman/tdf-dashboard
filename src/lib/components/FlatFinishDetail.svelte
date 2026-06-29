<script lang="ts">
	// §4 flat-finish detail (archetype D). No gradient banding — the finish is flat, so banding
	// would be noise. Instead it shows the TECHNICAL run-in: the flamme rouge (1 km to go), sharp
	// corners derived from the track's curvature, and the closing drag/false-flat to the line.
	// Purely descriptive geometry — where the road bends and tilts, never a predicted outcome.
	import { detectCorners, cumulativeKm, type LngLat } from '$lib/render/curvature';
	import { finishRampGradient } from '$lib/render/finish';
	import { elevationAtKm, gradientAtKm, type ElePoint } from '$lib/render/profile';

	let {
		series,
		track,
		finishTrack = [],
		distanceKm,
		finishName,
		finalKm = 5,
		width = 1000,
		height = 240,
		onScrub
	}: {
		series: ElePoint[];
		track: LngLat[];
		/** Dense final-km track (raw GPX, corners intact) — SAME source the finish map uses. When
		 *  present, corner markers derive from it so the on-profile corners match the map exactly. */
		finishTrack?: LngLat[];
		distanceKm: number;
		finishName: string;
		finalKm?: number;
		width?: number;
		height?: number;
		/** Emits km-to-go under the cursor (null = not scrubbing) so the finish map can track it. */
		onScrub?: (kmToGo: number | null) => void;
	} = $props();

	// Symmetric L/R gutters: unlike the banded-climb view, the flat finish draws NO left altitude
	// axis, so it needs no extra left padding — just enough either side for the end tick labels
	// ("5km" / "0km") not to clip. Centres the profile in its panel.
	const pad = { top: 30, right: 18, bottom: 40, left: 18 };
	const innerW = $derived(width - pad.left - pad.right);
	const innerH = $derived(height - pad.top - pad.bottom);
	const baseY = $derived(pad.top + innerH);

	const fromKm = $derived(Math.max(0, distanceKm - finalKm));

	// series & track are the same downsampled points (shared index) — slice both by km.
	const idx = $derived(series.map((p, i) => ({ p, i })).filter((o) => o.p.km >= fromKm - 1e-6));
	const seg = $derived(idx.map((o) => o.p));
	const subTrack = $derived(idx.map((o) => track[o.i]).filter(Boolean) as LngLat[]);
	const startKm = $derived(seg.length ? seg[0].km : fromKm);

	// The first downsampled point at/after fromKm usually sits a little PAST the frame's left edge,
	// which left the line + shading starting late and inconsistently. Anchor an interpolated point
	// at exactly fromKm so every flat-finish frame begins flush with the container's left edge.
	const linePts = $derived.by(() => {
		if (!seg.length) return [] as ElePoint[];
		if (seg[0].km > fromKm + 1e-6) return [{ km: fromKm, ele: elevationAtKm(series, fromKm) }, ...seg];
		return seg;
	});

	const eMin = $derived(linePts.length ? Math.min(...linePts.map((p) => p.ele)) : 0);
	const eMax = $derived(linePts.length ? Math.max(...linePts.map((p) => p.ele)) : 1);
	const frameLen = $derived(Math.max(0.001, distanceKm - fromKm));
	const x = $derived((km: number) => pad.left + ((km - fromKm) / frameLen) * innerW);
	// Floor the vertical span so a genuinely flat finish LOOKS flat — without this the detail
	// zoom magnifies a 20 m roller into a mountain and contradicts the "flat run-in" label.
	const MIN_SPAN_M = 90;
	const eRange = $derived(Math.max(MIN_SPAN_M, eMax - eMin));
	// Sit the line a little above the floor so small undulations have room to read both ways.
	const y = $derived((ele: number) => baseY - 8 - ((ele - eMin) / eRange) * (innerH - 16));

	const linePath = $derived('M' + linePts.map((p) => `${x(p.km).toFixed(2)} ${y(p.ele).toFixed(2)}`).join(' L'));
	const areaPath = $derived(
		linePts.length
			? linePath + ` L${x(linePts[linePts.length - 1].km).toFixed(2)} ${baseY} L${x(linePts[0].km).toFixed(2)} ${baseY} Z`
			: ''
	);

	// Corners in the run-in (descriptive). Detect on the DENSE finishTrack (raw GPX, corners intact)
	// — the SAME source the finish map draws — so the on-profile markers match the map and aren't
	// chorded away or mislocated by the coarse shared track. Position by km-to-go: the profile's
	// x-axis IS km-to-go, so a corner's distance from the line maps straight to its x. Falls back to
	// the coarse track only if no dense finishTrack was supplied.
	const corners = $derived.by(() => {
		const dense = finishTrack.length >= 3;
		const src = dense ? finishTrack : subTrack;
		if (src.length < 3) return [];
		const found = detectCorners(src, { minTurnDeg: 50, minSpacingKm: 0.28 });
		if (dense) {
			const ftLen = cumulativeKm(finishTrack)[finishTrack.length - 1];
			return found
				.map((c) => ({ ...c, absKm: distanceKm - (ftLen - c.km) }))
				.filter((c) => c.absKm <= distanceKm - 0.12 && c.absKm >= fromKm);
		}
		return found
			.map((c) => ({ ...c, absKm: startKm + c.km }))
			.filter((c) => c.absKm <= distanceKm - 0.15);
	});

	const flammeKm = $derived(distanceKm - 1);
	const showFlamme = $derived(flammeKm > fromKm);

	// Closing drag over the final 2 km (signed). +ve = uphill drag, ≈0 = flat, −ve = downhill.
	const drag = $derived(finishRampGradient(seg, 2));
	const dragLabel = $derived(
		Math.abs(drag) < 1 ? 'flat run-in' : drag > 0 ? `${drag.toFixed(1)}% drag to the line` : `${Math.abs(drag).toFixed(1)}% downhill to the line`
	);

	// Scrub-to-read: a standalone readout (distance-to-go / altitude / gradient) for the run-in.
	// No map-sync — the decisive zone sits below the fold, so the map is off-screen while scrubbing.
	const FLAT_GRADE = 1;
	function gradeColor(g: number): string {
		if (g <= -FLAT_GRADE) return 'var(--text-2)';
		const a = Math.abs(g);
		if (a < 4) return 'var(--terr-lo)';
		if (a < 7) return 'var(--terr-mid)';
		return 'var(--terr-hi)';
	}
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
	const hover = $derived.by(() => {
		if (hoverX == null || !seg.length) return null;
		const km = fromKm + ((hoverX - pad.left) / innerW) * frameLen;
		const ele = elevationAtKm(series, km);
		const grade = gradientAtKm(series, km);
		// Edge-aware anchor so the readout never clips the narrow zoomed frame's ends.
		const anchor = hoverX > width - pad.right - innerW * 0.2 ? 'end' : hoverX < pad.left + innerW * 0.2 ? 'start' : 'middle';
		return { x: hoverX, y: y(ele), kmToGo: distanceKm - km, ele, grade, anchor };
	});

	// Report km-to-go to the parent so the finish map can track the cursor (the map places its dot
	// that far back from the line). Null when not hovering → the map clears its dot.
	$effect(() => {
		onScrub?.(hover ? hover.kmToGo : null);
	});
</script>

<svg
	bind:this={svgEl}
	viewBox="0 0 {width} {height}"
	class="flatfin"
	role="img"
	aria-label="Final {finalKm} km into {finishName}"
	onpointermove={onMove}
	onpointerleave={onLeave}
>
	<line x1={pad.left} y1={baseY} x2={width - pad.right} y2={baseY} stroke="var(--line)" />

	{#if areaPath}<path d={areaPath} fill="var(--terr-lo)" fill-opacity="0.28" />{/if}
	<path d={linePath} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" opacity="0.92" />

	<!-- corners: a triangle pointing the way the road turns (L/R) — same convention as the TT
	     profile, so corners read consistently across the site (no up-arrow + letter). -->
	{#each corners as c (c.absKm)}
		<g transform="translate({x(c.absKm)},{baseY - 5})">
			<path
				d={c.dir === 'L' ? 'M-5 0 L4 -5 L4 5 Z' : 'M5 0 L-4 -5 L-4 5 Z'}
				fill="var(--t-hills)"
				opacity="0.9"
			/>
		</g>
	{/each}

	<!-- flamme rouge: 1 km to go -->
	{#if showFlamme}
		<line x1={x(flammeKm)} y1={pad.top} x2={x(flammeKm)} y2={baseY} stroke="var(--t-mountains)" stroke-width="1" opacity="0.8" />
		<g transform="translate({x(flammeKm)},{pad.top})">
			<rect x="-15" y="-14" width="30" height="13" rx="2" fill="var(--t-mountains)" />
			<text y="-4" class="flamme" text-anchor="middle">1 km</text>
		</g>
	{/if}

	<!-- finish line -->
	<line x1={x(distanceKm)} y1={pad.top} x2={x(distanceKm)} y2={baseY} stroke="var(--jaune-text)" stroke-width="1.5" />
	<text x={x(distanceKm)} y={pad.top - 4} class="finish" text-anchor="end">{finishName}</text>

	<!-- distance ticks (km to go) -->
	{#each Array.from({ length: Math.floor(frameLen) + 1 }, (_, i) => i) as k (k)}
		<text x={x(distanceKm - k)} y={height - 22} class="tick" text-anchor="middle">{k}km</text>
	{/each}

	<text x={pad.left} y={pad.top - 4} class="drag" text-anchor="start">Final {finalKm} km · {dragLabel}</text>

	<!-- scrub: standalone read of distance-to-go / altitude / gradient at the cursor -->
	{#if hover}
		<g class="scrub" style="pointer-events:none">
			<line x1={hover.x} y1={pad.top} x2={hover.x} y2={baseY} stroke="var(--jaune-text)" stroke-width="1" opacity="0.65" />
			<circle cx={hover.x} cy={hover.y} r="4" fill="var(--jaune-text)" />
			<g transform="translate({hover.x},{Math.max(pad.top + 11, hover.y - 12)})">
				<text text-anchor={hover.anchor} class="scrub-label">
					{hover.kmToGo.toFixed(1)}km · {Math.round(hover.ele)}m{#if Math.abs(hover.grade) >= FLAT_GRADE}
						· <tspan class="scrub-grade" style="fill: {gradeColor(hover.grade)}"
							>{hover.grade > 0 ? '' : '−'}{Math.abs(hover.grade).toFixed(1)}%</tspan
						>{/if}
				</text>
			</g>
		</g>
	{/if}
</svg>

<style>
	.flatfin {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		touch-action: none;
		cursor: crosshair;
	}
	.tick {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--text-3);
	}
	.flamme {
		font-family: var(--font-mono);
		font-size: 8.5px;
		font-weight: 700;
		fill: #fff;
	}
	.finish {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 700;
		fill: var(--jaune-text);
	}
	.drag {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--text-2);
	}
	.scrub-label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		fill: var(--jaune-text);
		/* halo so the readout stays legible over the area fill, dark or light */
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.scrub-grade {
		font-weight: 700;
	}
</style>
