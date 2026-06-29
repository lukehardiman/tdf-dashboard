<script lang="ts">
	// §4 flat-finish detail (archetype D). No gradient banding — the finish is flat, so banding
	// would be noise. Instead it shows the TECHNICAL run-in: the flamme rouge (1 km to go), sharp
	// corners derived from the track's curvature, and the closing drag/false-flat to the line.
	// Purely descriptive geometry — where the road bends and tilts, never a predicted outcome.
	import { detectCorners, type LngLat } from '$lib/render/curvature';
	import { finishRampGradient } from '$lib/render/finish';
	import type { ElePoint } from '$lib/render/profile';

	let {
		series,
		track,
		distanceKm,
		finishName,
		finalKm = 5,
		width = 1000,
		height = 240
	}: {
		series: ElePoint[];
		track: LngLat[];
		distanceKm: number;
		finishName: string;
		finalKm?: number;
		width?: number;
		height?: number;
	} = $props();

	const pad = { top: 30, right: 18, bottom: 40, left: 48 };
	const innerW = $derived(width - pad.left - pad.right);
	const innerH = $derived(height - pad.top - pad.bottom);
	const baseY = $derived(pad.top + innerH);

	const fromKm = $derived(Math.max(0, distanceKm - finalKm));

	// series & track are the same downsampled points (shared index) — slice both by km.
	const idx = $derived(series.map((p, i) => ({ p, i })).filter((o) => o.p.km >= fromKm - 1e-6));
	const seg = $derived(idx.map((o) => o.p));
	const subTrack = $derived(idx.map((o) => track[o.i]).filter(Boolean) as LngLat[]);
	const startKm = $derived(seg.length ? seg[0].km : fromKm);

	const eMin = $derived(seg.length ? Math.min(...seg.map((p) => p.ele)) : 0);
	const eMax = $derived(seg.length ? Math.max(...seg.map((p) => p.ele)) : 1);
	const frameLen = $derived(Math.max(0.001, distanceKm - fromKm));
	const x = $derived((km: number) => pad.left + ((km - fromKm) / frameLen) * innerW);
	// Floor the vertical span so a genuinely flat finish LOOKS flat — without this the detail
	// zoom magnifies a 20 m roller into a mountain and contradicts the "flat run-in" label.
	const MIN_SPAN_M = 90;
	const eRange = $derived(Math.max(MIN_SPAN_M, eMax - eMin));
	// Sit the line a little above the floor so small undulations have room to read both ways.
	const y = $derived((ele: number) => baseY - 8 - ((ele - eMin) / eRange) * (innerH - 16));

	const linePath = $derived('M' + seg.map((p) => `${x(p.km).toFixed(2)} ${y(p.ele).toFixed(2)}`).join(' L'));
	const areaPath = $derived(
		seg.length
			? linePath + ` L${x(seg[seg.length - 1].km).toFixed(2)} ${baseY} L${x(seg[0].km).toFixed(2)} ${baseY} Z`
			: ''
	);

	// Corners in the run-in (descriptive). km returned is from the sub-track start → offset to stage km.
	const corners = $derived(
		detectCorners(subTrack, { minTurnDeg: 55, minSpacingKm: 0.4 })
			.map((c) => ({ ...c, absKm: startKm + c.km }))
			.filter((c) => c.absKm <= distanceKm - 0.15) // ignore the final approach noise
	);

	const flammeKm = $derived(distanceKm - 1);
	const showFlamme = $derived(flammeKm > fromKm);

	// Closing drag over the final 2 km (signed). +ve = uphill drag, ≈0 = flat, −ve = downhill.
	const drag = $derived(finishRampGradient(seg, 2));
	const dragLabel = $derived(
		Math.abs(drag) < 1 ? 'flat run-in' : drag > 0 ? `${drag.toFixed(1)}% drag to the line` : `${Math.abs(drag).toFixed(1)}% downhill to the line`
	);
</script>

<svg viewBox="0 0 {width} {height}" class="flatfin" role="img" aria-label="Final {finalKm} km into {finishName}">
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
</svg>

<style>
	.flatfin {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
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
</style>
