<script lang="ts">
	import type { Stage, EventMeta } from '$lib/data/types';
	import type { ElePoint } from '$lib/render/profile';
	import type { LngLat } from '$lib/render/route';
	import type { ClimbMarkerInput } from '$lib/render/profile';
	import { classifyStageFinish, type FinishArchetype } from '$lib/render/finish';
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

	// The "Finish" vital is derived from the SAME geometry classifier that drives the Decisive Zone,
	// not the crude summitFinish boolean — so a flat city sprint reads "Flat", a punchy kick reads
	// "Uphill", a TT reads "Time trial", instead of everything collapsing to "Summit"/"Valley"
	// ("Valley" was nonsense for sprints and time trials alike).
	const FINISH_LABEL: Record<FinishArchetype, string> = {
		summit: 'Summit',
		'climb-runin': 'Climb + run-in',
		punchy: 'Uphill',
		flat: 'Flat',
		tt: 'Time trial'
	};
	const finishLabel = $derived.by(() => {
		if (!series || !series.length) return stage.summitFinish ? 'Summit' : 'Flat';
		const arch = classifyStageFinish({
			type: stage.type,
			distanceKm: series[series.length - 1].km,
			climbs: (climbs ?? []).map((c) => ({ category: c.category, summitKm: c.summitKm })),
			series
		});
		return FINISH_LABEL[arch];
	});
</script>

<!-- The anatomy of a stage as one tool: vital stats, then the two spatial views (map above
     profile) flush inside a single bordered unit. Scrub the profile, watch the map dot. -->
<section class="anatomy">
	<dl class="stat-strip mono">
		<div><dt>Distance</dt><dd>{stage.distanceKm}<span>km</span></dd></div>
		<div><dt>Elevation</dt><dd>{stage.elevationGainM.toLocaleString()}<span>m ↑</span></dd></div>
		<div><dt>Climbs</dt><dd>{climbCount || '—'}</dd></div>
		<div><dt>Finish</dt><dd class="sm">{finishLabel}</dd></div>
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
		<span class="pane-label mono">{isTT ? 'Time-trial course' : 'Elevation profile'}</span>
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
