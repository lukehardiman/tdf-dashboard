<script lang="ts">
	import type { Stage, EventMeta } from '$lib/data/types';
	import type { ElePoint } from '$lib/render/profile';
	import type { LngLat } from '$lib/render/route';
	import type { ClimbMarkerInput } from '$lib/render/profile';
	import { classifyStageFinish, type FinishArchetype } from '$lib/render/finish';
	import { classifyTTSectors } from '$lib/render/ttSectors';
	import RouteMap from './RouteMap.svelte';
	import StageProfile from './StageProfile.svelte';
	import TTCourseProfile from './TTCourseProfile.svelte';

	let {
		event,
		stage,
		series,
		track,
		climbs,
		climbCount
	}: {
		event: EventMeta;
		stage: Stage;
		series: ElePoint[] | null;
		track: LngLat[] | null;
		climbs: ClimbMarkerInput[] | null;
		climbCount: number;
	} = $props();

	// The scrub state lives here now: the profile emits it, the map consumes it — and both
	// are sections of this one unit, so co-visibility is the component's whole reason to exist.
	let scrubFraction = $state<number | null>(null);

	// A time trial is decided across the whole course, so it gets the merged TT course profile
	// (local exaggeration + scrub + demand-type sectors + corners) in place of the shared-scale
	// profile — and no separate decisive-zone graphic, which would just show the same course twice.
	const isTT = $derived(stage.type === 'itt' || stage.type === 'ttt');

	// The "Finish" vital describes the finish CHARACTER, never the discipline — the type badge
	// already says "Time Trial", so restating it here is noise. Road stages use the finish-geometry
	// archetype (the same logic as the Decisive Zone); TTs use their CLOSING sector (the same sector
	// analysis shown in the course profile below), so a hilltop TT reads "Uphill" and a flat run-in
	// reads "Flat" — consistent with what's drawn directly beneath it.
	const ROAD_FINISH: Record<FinishArchetype, string> = {
		summit: 'Summit',
		'climb-runin': 'Climb + Run-In',
		punchy: 'Uphill',
		flat: 'Flat',
		tt: 'Flat' // unreachable for road stages; archetype short-circuits to tt only for itt/ttt
	};
	const finishLabel = $derived.by(() => {
		if (!series || !series.length) return stage.summitFinish ? 'Summit' : 'Flat';
		if (isTT) {
			const sectors = classifyTTSectors(series, track && track.length === series.length ? track : null);
			const last = sectors[sectors.length - 1]?.type;
			return last === 'climb' ? 'Uphill' : last === 'descent' ? 'Downhill' : 'Flat';
		}
		const arch = classifyStageFinish({
			type: stage.type,
			distanceKm: series[series.length - 1].km,
			climbs: (climbs ?? []).map((c) => ({ category: c.category, summitKm: c.summitKm })),
			series
		});
		// A stage that FINISHES atop a summit but whose decisive categorised climb crests earlier
		// (archetype C — climb + run-in) gets a COMPOUND keystat capturing both facts: the line is at
		// a summit AND selection happens before it. A plain "Summit" would leave a viewer wondering why
		// the decisive-zone hero frames a climb km from the line. Systematic across stages 10/14/20.
		// (A punchy summit like stage 3, where the kick IS the line, has no split — keeps its archetype
		// label. A non-summit climb + run-in like stage 2 stays "Climb + Run-In".)
		if (stage.summitFinish && arch === 'climb-runin') return 'Summit · decided earlier';
		return ROAD_FINISH[arch];
	});
</script>

<!-- The anatomy of a stage as one tool: vital stats, then the two spatial views (map above
     profile) flush inside a single bordered unit. Scrub the profile, watch the map dot. -->
<section class="anatomy">
	<dl class="stat-strip mono">
		<div><dt>Distance</dt><dd>{stage.distanceKm}<span>km</span></dd></div>
		<div><dt>Elevation</dt><dd>{stage.elevationGainM.toLocaleString()}<span>m ↑</span></dd></div>
		<div><dt>Categorised Climbs</dt><dd>{climbCount || '—'}</dd></div>
		<div><dt>Finish</dt><dd class="sm">{#if finishLabel.includes(' · ')}{finishLabel.split(' · ')[0]}<span class="qual">{finishLabel.split(' · ')[1]}</span>{:else}{finishLabel}{/if}</dd></div>
	</dl>

	<div class="pane map-pane">
		<span class="pane-label mono">Route</span>
		{#if track}
			<RouteMap
				{track}
				framed={false}
				colorVar="--t-{stage.type}"
				markerFraction={scrubFraction}
				label="{event.name} stage {stage.n}, {stage.start.name} to {stage.finish.name}"
			/>
		{:else}
			<div class="map-placeholder">
				<span class="mono">Route map available once the stage GPX is added.</span>
			</div>
		{/if}
	</div>

	<div class="pane profile-pane" style="view-transition-name: stage-{stage.n};">
		<span class="pane-label mono">{isTT ? 'Time Trial Course' : 'Elevation Profile'}</span>
		{#if isTT && series}
			<TTCourseProfile
				{series}
				{track}
				climbs={climbs ?? []}
				stageN={stage.n}
				width={1040}
				height={232}
				onScrub={(f) => (scrubFraction = f)}
			/>
			<p class="hint mono">
				Hover or drag to read distance, altitude &amp; gradient. The sectors show the demands the
				elevation line can't — technical descents and corners{#if track}; the dot tracks the route on
					the map above{/if}.
			</p>
		{:else}
			<StageProfile
				{stage}
				{series}
				{climbs}
				width={1040}
				height={210}
				interactive
				onScrub={(f) => (scrubFraction = f)}
			/>
			<p class="hint mono">
				Hover or drag across the profile to read distance, altitude &amp; gradient{#if track}&nbsp;— the
					dot tracks the route on the map above{/if}.
			</p>
		{/if}
	</div>
</section>

<style>
	.anatomy {
		margin-top: 24px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden; /* clips the map to the unit's rounded corners */
	}

	/* Top header strip: the vital stats. */
	.stat-strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1px;
		margin: 0; /* drop the UA <dl> vertical margins so the strip sits flush above the map */
		background: var(--line); /* gap lines between stats */
	}
	.stat-strip > div {
		background: var(--ink-2);
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.stat-strip dt {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-3);
	}
	.stat-strip dd {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1;
	}
	.stat-strip dd span {
		font-size: 0.7rem;
		color: var(--text-3);
		margin-left: 2px;
	}
	.stat-strip dd.sm {
		font-size: 0.95rem;
	}
	/* Compound finish keystat (e.g. "Summit · decided earlier"): the main word stays the headline,
	   the qualifier drops to a small muted second line so the box reads cleanly and never overflows
	   — same role as a unit, but a phrase, so block not inline. */
	.stat-strip dd .qual {
		display: block;
		margin: 3px 0 0;
		font-size: 0.62rem;
		font-weight: 400;
		letter-spacing: 0.02em;
		color: var(--text-3);
	}

	.pane {
		position: relative;
		border-top: 1px solid var(--line); /* hairline between sections */
	}

	/* Section labels as pills sitting ON the surface — solid ground so they stay legible
	   over map tiles AND the terrain gradient, both themes (same principle as the scrub halo). */
	.pane-label {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 5;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 3px 9px;
		pointer-events: none;
	}

	.profile-pane {
		padding: 14px 12px 12px;
		/* Bound the profile to its own panel at the TOP edge so nothing (terrain spikes, climb
		   annotations) can bleed up onto the flush map above — the two panes share a seam with no gap
		   to absorb an overflow. Clipping ONLY the top: the other three sides extend freely (−100%),
		   so labels near the profile's left/right/internal edges are NOT re-clipped. */
		clip-path: inset(0 -100% -100% -100%);
	}
	/* Leave room so the floating ROUTE/PROFILE pill never overlaps the start of the line. */
	.profile-pane :global(svg.profile) {
		margin-top: 6px;
	}

	.map-placeholder {
		height: clamp(240px, 40vh, 360px);
		display: grid;
		place-items: center;
		background: var(--ink-2);
	}
	.map-placeholder span {
		font-size: 0.78rem;
		color: var(--text-3);
	}

	.hint {
		margin: 8px 2px 0;
		font-size: 0.72rem;
		color: var(--text-3);
	}

	@media (max-width: 560px) {
		.stat-strip {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
