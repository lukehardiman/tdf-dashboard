<script lang="ts">
	// The finish-zoom HERO (spec §6). One component; the stage's own geometry picks the treatment.
	// Reads the classifier, then frames the decisive zone:
	//   B summit      → the final climb, banded (the climb IS the finish)
	//   C climb-runin → the final climb + run-in to the line, banded with a descent-grey run-in
	//   E punchy      → the closing ramp, banded
	//   D flat        → the technical final kilometres (flamme rouge, corners, drag) — no banding
	//   A tt          → NOT shown here. A time trial has no decisive zone (the whole course is the
	//                   test), so its analysis lives in the merged TT course profile (StageAnatomy),
	//                   not in a second graphic of the same course.
	import type { Stage } from '$lib/data/types';
	import type { ProfileClimb } from '$lib/data/profiles';
	import type { ElePoint } from '$lib/render/profile';
	import type { LngLat } from '$lib/render/curvature';
	import { classifyStageFinish, finishMapWindowKm, type FinishArchetype } from '$lib/render/finish';
	import ClimbBandingDetail from './ClimbBandingDetail.svelte';
	import FlatFinishDetail from './FlatFinishDetail.svelte';
	import FinishMap from './FinishMap.svelte';

	let {
		stage,
		series,
		climbs,
		track,
		finishTrack = [],
		distanceKm
	}: {
		stage: Stage;
		series: ElePoint[];
		climbs: ProfileClimb[];
		track: LngLat[];
		/** Dense final-km track (raw GPX) for the zoomed finish map. */
		finishTrack?: LngLat[];
		distanceKm: number;
	} = $props();

	const archetype = $derived<FinishArchetype>(
		classifyStageFinish({ type: stage.type, distanceKm, climbs, series })
	);

	// The decisive climb = the last categorised climb (max summitKm).
	const finalClimb = $derived(
		climbs.length ? climbs.reduce((a, b) => (b.summitKm > a.summitKm ? b : a)) : null
	);

	const HEADERS: Record<FinishArchetype, string> = {
		summit: 'The final climb',
		'climb-runin': 'The final climb & run-in',
		punchy: 'The finish',
		flat: 'The finish',
		tt: 'Where it’s won'
	};

	// Eyebrow kicker. "Decisive zone" fits the finish archetypes (B/C/E/D) — there IS a span that
	// decides the day. A time trial has no single decisive zone (the whole ride is the test), so it
	// gets its own framing.
	const KICKERS: Record<FinishArchetype, string> = {
		summit: 'Decisive zone',
		'climb-runin': 'Decisive zone',
		punchy: 'Decisive zone',
		flat: 'Decisive zone',
		tt: 'The course'
	};

	// The decisive-zone window (km) — the SAME span the profile frames — that the plan-view map
	// should show, or 0 when this archetype shows no map. Computed by the shared classifier so the
	// map and profile (and the build-time finishTrack artifact) can never drift apart: D = final
	// 5 km, C-with-descent = the whole climb→line (e.g. S20 Sarenne→Alpe ≈ 27 km), B/E/A = no map.
	const mapWindowKm = $derived(
		finishMapWindowKm({ type: stage.type, distanceKm, climbs, series })
	);
	// Pair a map only where corners are the decisive, profile-invisible factor (the window fn returns
	// 0 elsewhere) AND the dense finish track was emitted for it.
	const showFinishMap = $derived(mapWindowKm > 0 && finishTrack.length >= 2);

	// Profile scrub → finish map. The detail profile reports km-to-go under the cursor; the map
	// places its tracking dot that far back from the line. The map is sliced to the SAME window as
	// the profile (below), so the dot tracks 1:1 across the whole profile.
	let scrubKmToGo = $state<number | null>(null);

	// Frame geometry per archetype.
	const frame = $derived.by(() => {
		const fc = finalClimb;
		if (!fc) return null;
		if (archetype === 'summit') {
			return { fromKm: fc.startKm, summitKm: fc.summitKm, toKm: fc.summitKm };
		}
		if (archetype === 'climb-runin') {
			return { fromKm: fc.startKm, summitKm: fc.summitKm, toKm: distanceKm };
		}
		if (archetype === 'punchy') {
			const summit = Math.min(fc.summitKm, distanceKm);
			const rampFrame = Math.max(fc.lengthKm ?? 3, 3);
			return { fromKm: Math.max(0, summit - rampFrame), summitKm: summit, toKm: summit };
		}
		return null;
	});

</script>

{#if archetype !== 'tt'}
	<section class="finish-zoom" aria-labelledby="fz-h">
		<h2 id="fz-h" class="fz-head"><span class="kicker">{KICKERS[archetype]}</span> {HEADERS[archetype]}</h2>

		{#if (archetype === 'summit' || archetype === 'climb-runin' || archetype === 'punchy') && finalClimb && frame}
			<ClimbBandingDetail
				{series}
				fromKm={frame.fromKm}
				summitKm={frame.summitKm}
				toKm={frame.toKm}
				name={finalClimb.name}
				category={finalClimb.category}
				lengthKm={finalClimb.lengthKm}
				avgGradient={finalClimb.avgGradient}
				summitElevation={finalClimb.summitElevation}
				onScrub={showFinishMap ? (k) => (scrubKmToGo = k) : undefined}
			/>
		{:else if archetype === 'flat'}
			<FlatFinishDetail
				{series}
				{track}
				{finishTrack}
				{distanceKm}
				finalKm={mapWindowKm}
				finishName={stage.finish.name}
				onScrub={showFinishMap ? (k) => (scrubKmToGo = k) : undefined}
			/>
		{/if}

		<!-- Plan-view of the final km: shows the corners the elevation profile can't. Only where
		     corners decide it — sprint run-ins (D) and technical descents to the line (C). -->
		{#if showFinishMap}
			<FinishMap
				track={finishTrack}
				colorVar="--t-{stage.type}"
				finishName={stage.finish.name}
				label={stage.finish.name}
				windowKm={mapWindowKm}
				{scrubKmToGo}
			/>
		{/if}
	</section>
{/if}

<style>
	.finish-zoom {
		margin-top: 24px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		/* Bottom padding matches the horizontal so the map (the last child) is inset equally on its
		   left, right and bottom — symmetric in its panel. */
		padding: 16px 18px 18px;
	}
	.fz-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 1.15rem;
		font-weight: 700;
		margin: 0 0 10px;
		color: var(--text);
	}
	.kicker {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--jaune-text);
	}
</style>
