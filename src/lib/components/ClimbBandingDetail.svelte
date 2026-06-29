<script lang="ts">
	// §4 gradient-banded climb detail. Renders the RESOLVED climb extent [fromKm, summitKm], and
	// for archetype C continues past the summit to the finish (toKm > summitKm) with the run-in
	// shown in neutral descent-grey. Consumes the framework-free bandClimb() core — the same data
	// the unit tests lock — so a beautifully-banded WRONG climb can't happen.
	import { bandClimb, SEVERITY_COLOR, gradientSeverity } from '$lib/render/climbBanding';
	import { elevationAtKm, gradientAtKm, type ElePoint } from '$lib/render/profile';

	let {
		series,
		fromKm,
		summitKm,
		toKm = summitKm,
		name,
		category,
		lengthKm,
		avgGradient,
		summitElevation = null,
		binKm = 1,
		width = 1000,
		height = 300
	}: {
		series: ElePoint[];
		fromKm: number;
		summitKm: number;
		/** End of the framed window. > summitKm for archetype C (climb + run-in to the line). */
		toKm?: number;
		name: string;
		category: 1 | 2 | 3 | 4 | 'hc';
		lengthKm: number | null;
		avgGradient: number | null;
		summitElevation?: number | null;
		binKm?: number;
		width?: number;
		height?: number;
	} = $props();

	const pad = { top: 34, right: 18, bottom: 46, left: 52 };
	const innerW = $derived(width - pad.left - pad.right);
	const innerH = $derived(height - pad.top - pad.bottom);
	const baseY = $derived(pad.top + innerH);

	const hasRunIn = $derived(toKm > summitKm + 1e-6);
	const bins = $derived(bandClimb(series, fromKm, toKm, binKm));

	const seg = $derived(series.filter((p) => p.km >= fromKm - 0.01 && p.km <= toKm + 0.01));
	const eMin = $derived(seg.length ? Math.min(...seg.map((p) => p.ele)) : 0);
	const eMax = $derived(seg.length ? Math.max(...seg.map((p) => p.ele)) : 1);
	const frameLen = $derived(Math.max(0.001, toKm - fromKm));

	const x = $derived((km: number) => pad.left + ((km - fromKm) / frameLen) * innerW);
	// Clamp to the frame: an endpoint interpolated just outside [eMin,eMax] must not poke a
	// sliver below the baseline (or above the top). Keeps the banded area inside the box.
	const y = $derived((ele: number) =>
		Math.min(baseY, Math.max(pad.top, baseY - ((ele - eMin) / Math.max(1, eMax - eMin)) * innerH))
	);

	// One filled area per bin. Top edge shares the EXACT series points (plus interpolated bin
	// endpoints) so bands tile seamlessly and the overlaid line sits precisely on them.
	const bandPaths = $derived(
		bins.map((b) => {
			const inner = series.filter((p) => p.km > b.startKm + 1e-9 && p.km < b.endKm - 1e-9);
			const topPts: [number, number][] = [
				[b.startKm, elevationAtKm(series, b.startKm)],
				...inner.map((p) => [p.km, p.ele] as [number, number]),
				[b.endKm, elevationAtKm(series, b.endKm)]
			];
			const d =
				`M${x(b.startKm).toFixed(2)} ${baseY.toFixed(2)} ` +
				topPts.map(([km, ele]) => `L${x(km).toFixed(2)} ${y(ele).toFixed(2)}`).join(' ') +
				` L${x(b.endKm).toFixed(2)} ${baseY.toFixed(2)} Z`;
			return { d, color: SEVERITY_COLOR[b.severity] };
		})
	);

	// Anchor the silhouette at exactly fromKm (interpolated) so the line starts flush with the
	// banded fill's left edge — the bands already begin at fromKm, the raw series may not.
	const linePts = $derived(
		seg.length && seg[0].km > fromKm + 1e-6
			? [{ km: fromKm, ele: elevationAtKm(series, fromKm) }, ...seg]
			: seg
	);
	const linePath = $derived('M' + linePts.map((p) => `${x(p.km).toFixed(2)} ${y(p.ele).toFixed(2)}`).join(' L'));

	// Per-km gradient labels — suppress to a stride if bins get too narrow to read.
	const binPx = $derived(bins.length ? innerW / bins.length : innerW);
	const labelStride = $derived(Math.max(1, Math.ceil(26 / Math.max(1, binPx))));
	const gradLabels = $derived(
		bins
			.map((b, i) => ({ i, mid: x((b.startKm + b.endKm) / 2), g: b.gradientPct, descent: b.severity === 'descent' }))
			.filter((l) => l.i % labelStride === 0)
	);

	// Distance ticks count DOWN to the finish (km to go) — 0 sits at the line on the right.
	const ticks = $derived.by(() => {
		const out: { x: number; label: number }[] = [];
		const stepKm = Math.max(1, Math.ceil(frameLen / 9));
		for (let g = 0; g <= frameLen + 1e-6; g += stepKm) out.push({ x: x(toKm - g), label: Math.round(g) });
		return out;
	});

	function catColor(cat: 1 | 2 | 3 | 4 | 'hc'): string {
		switch (cat) {
			case 'hc':
				return 'var(--t-mountains)';
			case 1:
				return 'var(--terr-hi)';
			case 2:
				return 'var(--t-hills)';
			case 3:
				return 'var(--terr-mid)';
			default:
				return 'var(--terr-lo)';
		}
	}
	const catLabel = $derived(category === 'hc' ? 'HC' : `Cat ${category}`);
	const summitX = $derived(x(summitKm));
	const summitY = $derived(summitElevation != null ? y(summitElevation) : y(elevationAtKm(series, summitKm)));
	const footEle = $derived(Math.round(elevationAtKm(series, fromKm)));

	// Position-aware summit label: anchor away from whichever edge the summit sits near so the
	// text never overlaps the badge or clips the frame (B sits at the right edge; C is mid-frame).
	const labelAnchor = $derived(summitX > width * 0.62 ? 'end' : summitX < width * 0.38 ? 'start' : 'middle');
	const labelX = $derived(Math.max(pad.left, Math.min(width - pad.right, summitX)));
	// Lift the label clear of the profile line at the summit.
	const labelY = $derived(Math.max(pad.top + 11, summitY - 12));

	// Scrub-to-read: a standalone readout (distance-to-go / altitude / gradient) for studying the
	// climb precisely — the banding gives at-a-glance severity, the scrub gives the exact number.
	// No map-sync: the decisive zone sits below the fold, so the map is off-screen while scrubbing.
	const FLAT_GRADE = 1;
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
		return { x: hoverX, y: y(ele), kmToGo: toKm - km, ele, grade, anchor };
	});
</script>

<svg
	bind:this={svgEl}
	viewBox="0 0 {width} {height}"
	class="banding"
	role="img"
	aria-label="Gradient-banded profile of {name}"
	onpointermove={onMove}
	onpointerleave={onLeave}
>
	<!-- baseline -->
	<line x1={pad.left} y1={baseY} x2={width - pad.right} y2={baseY} stroke="var(--line)" />

	{#each bandPaths as b (b.d)}
		<path d={b.d} fill={b.color} fill-opacity="0.9" />
	{/each}

	<!-- profile silhouette on top -->
	<path d={linePath} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" opacity="0.92" />

	<!-- per-km gradient figures -->
	{#each gradLabels as l (l.i)}
		<text x={l.mid} y={baseY - 5} class="grad" class:descent={l.descent} text-anchor="middle">
			{l.g.toFixed(1)}
		</text>
	{/each}

	<!-- distance ticks -->
	{#each ticks as t (t.x)}
		<text x={t.x} y={height - 26} class="tick" text-anchor="middle">{t.label}km</text>
	{/each}

	<!-- altitude axis -->
	<text x={pad.left - 6} y={baseY + 3} class="tick" text-anchor="end">{footEle}m</text>
	{#if summitElevation != null}
		<text x={pad.left - 6} y={y(eMax) + 3} class="tick" text-anchor="end">{Math.round(eMax)}m</text>
	{/if}

	<!-- run-in: mark the finish line for archetype C -->
	{#if hasRunIn}
		<line x1={x(toKm)} y1={pad.top} x2={x(toKm)} y2={baseY} stroke="var(--jaune-text)" stroke-width="1" opacity="0.7" stroke-dasharray="3 3" />
		<text x={x(toKm)} y={pad.top - 4} class="finish" text-anchor="end">FINISH</text>
	{/if}

	<!-- summit marker: a single edge-aware label, category-coloured (no dot — the label suffices) -->
	<text x={labelX} y={labelY} class="summit-label" text-anchor={labelAnchor} fill={catColor(category)}>
		{catLabel} · {name}{#if lengthKm}<tspan class="summit-meta"> · {lengthKm}km @ {avgGradient}%</tspan>{/if}
	</text>

	<!-- scrub: standalone read of distance-to-go / altitude / gradient at the cursor -->
	{#if hover}
		<g class="scrub" style="pointer-events:none">
			<line x1={hover.x} y1={pad.top} x2={hover.x} y2={baseY} stroke="var(--jaune-text)" stroke-width="1" opacity="0.65" />
			<circle cx={hover.x} cy={hover.y} r="4" fill="var(--jaune-text)" />
			<g transform="translate({hover.x},{Math.max(pad.top + 11, hover.y - 12)})">
				<text text-anchor={hover.anchor} class="scrub-label">
					{hover.kmToGo.toFixed(1)}km · {Math.round(hover.ele)}m{#if Math.abs(hover.grade) >= FLAT_GRADE}
						· <tspan class="scrub-grade" style="fill: {SEVERITY_COLOR[gradientSeverity(hover.grade)]}"
							>{hover.grade > 0 ? '' : '−'}{Math.abs(hover.grade).toFixed(1)}%</tspan
						>{/if}
				</text>
			</g>
		</g>
	{/if}
</svg>

<style>
	.banding {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		touch-action: none;
		cursor: crosshair;
	}
	.grad {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		fill: #fff;
		/* halo so the figure reads on any band colour, dark or light */
		paint-order: stroke;
		stroke: rgba(0, 0, 0, 0.55);
		stroke-width: 2.4px;
		stroke-linejoin: round;
	}
	.grad.descent {
		fill: var(--text-2);
		stroke: var(--surface);
	}
	.tick {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--text-3);
	}
	.finish {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 700;
		fill: var(--jaune-text);
	}
	.summit-label {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 700;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.summit-meta {
		font-weight: 500;
		fill: var(--text-2);
	}
	.scrub-label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		fill: var(--jaune-text);
		/* halo so the readout stays legible over any band colour, dark or light */
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.scrub-grade {
		font-weight: 700;
	}
</style>
