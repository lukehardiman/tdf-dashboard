<script lang="ts">
	import StageAnatomy from '$lib/components/StageAnatomy.svelte';
	import FinishZoom from '$lib/components/FinishZoom.svelte';
	import TypologyBar from '$lib/components/TypologyBar.svelte';
	import TypologyKey from '$lib/components/TypologyKey.svelte';
	import StageSelector from '$lib/components/StageSelector.svelte';
	import { TYPE_LABELS } from '$lib/data/types';
	import { formatDateLong } from '$lib/state';

	let { data } = $props();
	const { event, stage, prev, next, series, track, finishTrack } = $derived(data);

	const catLabel = (c: number | 'hc') => (c === 'hc' ? 'HC' : `Cat ${c}`);

	// Climbs: GPX-derived waypoints are the source of truth (data.climbs); fall back to
	// hand-seeded stage.climbs only if a stage has no GPX profile. Repeated ascents of the
	// same climb on a finishing circuit (Montjuïc ×3 on stage 2, Montmartre ×3 on stage 21)
	// collapse into one row with a ×N badge and each lap's summit-km, while the profile above
	// still shows the distinct spikes.
	type DisplayClimb = {
		name: string;
		category: number | 'hc';
		lengthKm: number | null;
		avgGradient: number | null;
		/** Real ascent (m) — the number that matters on every climb. */
		elevationGainM: number | null;
		/** Summit altitude (m) — only meaningful on the high climbs. */
		summitElevation: number | null;
		summitKms: number[];
	};
	const climbs = $derived.by<DisplayClimb[]>(() => {
		const src = data.climbs ?? stage.climbs;
		const byKey = new Map<string, DisplayClimb>();
		for (const c of src) {
			const key = `${c.category}·${c.name}`;
			const existing = byKey.get(key);
			if (existing) {
				existing.summitKms.push(c.summitKm);
			} else {
				byKey.set(key, {
					name: c.name,
					category: c.category,
					lengthKm: c.lengthKm,
					avgGradient: c.avgGradient,
					elevationGainM: 'elevationGainM' in c ? (c.elevationGainM ?? null) : null,
					summitElevation: c.summitElevation,
					summitKms: [c.summitKm]
				});
			}
		}
		return [...byKey.values()].sort((a, b) => a.summitKms[0] - b.summitKms[0]);
	});

	// Sea-level altitude is signal on the big climbs, noise on Cat 4 hilltops — show it only
	// where it's the point (HC and Cat 1). Ascent (↑) is always shown.
	const showAltitude = (cat: number | 'hc') => cat === 'hc' || cat === 1;

	// Structured data for SEO.
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SportsEvent',
			name: `${event.name} — Stage ${stage.n}: ${stage.start.name} to ${stage.finish.name}`,
			startDate: stage.date,
			sport: 'Cycling',
			location: {
				'@type': 'Place',
				name: `${stage.start.name} – ${stage.finish.name}, France`
			},
			description: stage.summary
		})
	);
</script>

<svelte:head>
	<title>{event.name} Stage {stage.n}: {stage.start.name} → {stage.finish.name} — Profile, Route & Climbs</title>
	<meta
		name="description"
		content="Stage {stage.n} of the {event.name}: {stage.start.name} to {stage.finish.name}, {stage.distanceKm}km, {stage.elevationGainM.toLocaleString()}m climbing. {TYPE_LABELS[stage.type]} stage. Profile, route map, climbs and finish analysis."
	/>
	<link rel="canonical" href="/{event.slug}/stage-{stage.n}/" />
	<meta property="og:title" content="{event.name} Stage {stage.n}: {stage.start.name} → {stage.finish.name}" />
	<meta property="og:description" content={stage.summary} />
	<meta property="og:type" content="article" />
	{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<TypologyBar {event}>
	{#snippet nav()}
		<StageSelector {event} current={stage.n} />
	{/snippet}
</TypologyBar>

<main>
	<!-- The typology key sits in a band below the (sticky) masthead — it's reference, not navigation,
	     so it's fine to scroll away. It explains the swatch in the stage selector above and the type
	     badge on the header below. -->
	<div class="key-row">
		<TypologyKey />
	</div>

	<header class="head t-{stage.type}">
		<div class="head-top">
			<span class="big-num mono">{stage.n}</span>
			<div class="head-meta">
				<span class="type-tag" style="--tag: var(--t-{stage.type})">{TYPE_LABELS[stage.type]}</span>
				<span class="date mono">{formatDateLong(stage.date)}</span>
			</div>
		</div>
		<h1>
			<span>{stage.start.name}</span>
			<span class="dest"><span class="arrow" aria-hidden="true">→</span> {stage.finish.name}</span>
		</h1>
		<p class="summary">{stage.summary}</p>
	</header>

	<!-- The anatomy of a stage as one unified tool: vital stats, then map + profile as a
	     co-visible pair (scrub the profile, watch the map dot) — one bordered unit, no gaps. -->
	<StageAnatomy
		{event}
		{stage}
		{series}
		{track}
		climbs={data.climbs}
		climbCount={(data.climbs ?? stage.climbs).length}
	/>

	{#if climbs.length}
		<section class="block">
			<div class="block-label mono">All categorised climbs</div>
			<div class="climbs">
				{#each climbs as c (c.category + c.name)}
					<div class="climb">
						<div class="climb-cat" data-hc={c.category === 'hc'}>{catLabel(c.category)}</div>
						<div class="climb-name">
							{c.name}{#if c.summitKms.length > 1}<span class="climb-laps">×{c.summitKms.length}</span>{/if}
						</div>
						<div class="climb-stats mono">
							{#if c.lengthKm != null && c.avgGradient != null}
								<span>{c.lengthKm}km</span>
								<span>{c.avgGradient}%</span>
							{:else}
								<span class="climb-unknown" title="The source GPX has no climb-start marker for this ascent, so length and gradient can't be measured.">length n/a</span>
							{/if}
							{#if c.elevationGainM != null}
								<span class="ascent" title="Total ascent (real elevation gained)">↑{c.elevationGainM.toLocaleString()}m</span>
							{/if}
							{#if showAltitude(c.category) && c.summitElevation != null}
								<span class="summit-alt" title="Summit altitude above sea level">{c.summitElevation.toLocaleString()}m summit</span>
							{/if}
							<span class="km-mark">@ {c.summitKms.map((k) => `${k}km`).join(', ')}</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Finish-zoom hero: the stage's geometry selects the treatment (decisive climb / climb +
	     run-in / punchy ramp / flat technical finale). Placement polish + adaptive prominence is
	     a later pass; this wires the classifier to the §4 renderer. -->
	{#if series && series.length}
		<FinishZoom
			{stage}
			{series}
			climbs={data.climbs ?? []}
			track={track ?? []}
			finishTrack={finishTrack ?? []}
			distanceKm={series[series.length - 1].km}
		/>
	{/if}

	<!-- Town detail -->
	<section class="block">
		<div class="block-label mono">Start &amp; finish</div>
		<div class="towns-grid">
			<div class="town">
				<span class="town-role mono">Départ</span>
				<h3>{stage.start.name}</h3>
				{#if stage.start.note}<p>{stage.start.note}</p>{/if}
			</div>
			<div class="town">
				<span class="town-role mono">Arrivée</span>
				<h3>{stage.finish.name}</h3>
				{#if stage.finish.note}<p>{stage.finish.note}</p>{/if}
			</div>
		</div>
	</section>

	<!-- Intervals-native hook -->
	<section class="block hook">
		<div class="hook-inner">
			<div>
				<h3>Ride this stage</h3>
				<p>Push the route to your Intervals.icu calendar as a planned ride, or compare your
				own power and times on the climbs.</p>
			</div>
			<div class="hook-actions">
				<a class="btn-primary" href="https://intervals.icu">Open in Intervals</a>
				{#if stage.gpxPath}<a class="btn-ghost" href={stage.gpxPath} download>Download GPX</a>{/if}
			</div>
		</div>
	</section>

	<!-- Prev / next -->
	<nav class="pager">
		{#if prev}
			<a class="pager-link prev" href="/{event.slug}/stage-{prev.n}/">
				<span class="mono">← Stage {prev.n}</span>
				<span class="pager-towns">{prev.start.name} → {prev.finish.name}</span>
			</a>
		{:else}<span></span>{/if}
		{#if next}
			<a class="pager-link next" href="/{event.slug}/stage-{next.n}/">
				<span class="mono">Stage {next.n} →</span>
				<span class="pager-towns">{next.start.name} → {next.finish.name}</span>
			</a>
		{:else}<span></span>{/if}
	</nav>
</main>

<style>
	main { max-width: 1080px; margin: 0 auto; padding: 0 20px 80px; }

	.key-row { padding: 18px 0 0; }

	.head { padding: 28px 0 32px; position: relative; }
	.head-top { display: flex; align-items: center; gap: 18px; }
	.big-num {
		font-family: var(--font-display);
		font-size: 4.4rem;
		font-weight: 800;
		line-height: 0.8;
		color: var(--text);
	}
	.head-meta { display: flex; flex-direction: column; gap: 8px; }
	.type-tag {
		font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
		color: var(--tag);
		border: 1px solid color-mix(in srgb, var(--tag) 40%, transparent);
		background: color-mix(in srgb, var(--tag) 12%, transparent);
		padding: 3px 9px; border-radius: 999px; width: fit-content;
	}
	.date { font-size: 0.82rem; color: var(--text-3); }

	h1 {
		margin: 22px 0 0;
		font-size: clamp(2rem, 5.5vw, 3.4rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
		color: var(--text);
	}
	h1 .dest { display: inline-flex; align-items: center; gap: 12px; white-space: nowrap; }
	h1 .arrow { color: var(--text-3); font-weight: 300; }
	.summary { margin: 18px 0 0; font-size: 1.08rem; line-height: 1.55; color: var(--text-2); max-width: 64ch; }

	/* The stage-anatomy unit (keystats + map + profile) sets its own top margin. */
	.block { margin-top: 36px; }
	.block-label {
		font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em;
		color: var(--text-3); margin-bottom: 14px;
	}

	.climbs { display: flex; flex-direction: column; gap: 8px; }
	.climb {
		display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px;
		background: var(--surface); border: 1px solid var(--line);
		border-radius: var(--radius-sm); padding: 13px 16px;
	}
	.climb-cat {
		font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700;
		color: var(--text-2); border: 1px solid var(--line-2); border-radius: 6px;
		padding: 3px 8px; white-space: nowrap;
	}
	.climb-cat[data-hc='true'] { color: var(--t-mountains); border-color: color-mix(in srgb, var(--t-mountains) 50%, transparent); }
	.climb-name { font-weight: 600; color: var(--text); }
	.climb-laps {
		font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700;
		color: var(--jaune-text); margin-left: 8px; vertical-align: 1px;
	}
	.climb-stats { display: flex; gap: 14px; font-size: 0.8rem; color: var(--text-2); }
	.climb-stats .km-mark { color: var(--text-3); }
	.climb-stats .ascent { color: var(--text); font-weight: 600; }
	.climb-stats .summit-alt { color: var(--text-3); }
	.climb-unknown { color: var(--text-3); font-style: italic; }

	.towns-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
	.town { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
	.town-role { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--jaune-text); }
	.town h3 { margin: 8px 0 0; font-size: 1.3rem; color: var(--text); }
	.town p { margin: 10px 0 0; font-size: 0.92rem; line-height: 1.5; color: var(--text-2); }

	.hook { margin-top: 40px; }
	.hook-inner {
		background: linear-gradient(135deg, color-mix(in srgb, var(--jaune) 10%, var(--surface)), var(--surface));
		border: 1px solid color-mix(in srgb, var(--jaune) 30%, var(--line));
		border-radius: var(--radius); padding: 26px;
		display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between;
	}
	.hook h3 { font-size: 1.35rem; color: var(--text); }
	.hook p { margin: 8px 0 0; color: var(--text-2); max-width: 44ch; font-size: 0.95rem; }
	.hook-actions { display: flex; gap: 10px; flex-wrap: wrap; }
	.btn-primary {
		background: var(--jaune); color: var(--jaune-ink); font-weight: 700;
		padding: 11px 20px; border-radius: 999px; font-size: 0.9rem;
		transition: transform 0.18s var(--ease);
	}
	.btn-primary:hover { transform: translateY(-1px); }
	.btn-ghost {
		border: 1px solid var(--line-2); color: var(--text); font-weight: 600;
		padding: 11px 20px; border-radius: 999px; font-size: 0.9rem;
	}
	.btn-ghost:hover { border-color: var(--text-3); }

	.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 44px; }
	.pager-link {
		display: flex; flex-direction: column; gap: 5px;
		background: var(--surface); border: 1px solid var(--line);
		border-radius: var(--radius); padding: 16px 18px;
		transition: border-color 0.2s, transform 0.2s var(--ease);
	}
	.pager-link:hover { border-color: var(--line-2); transform: translateY(-2px); }
	.pager-link.next { text-align: right; }
	.pager-link span:first-child { font-size: 0.78rem; color: var(--jaune-text); font-weight: 600; }
	.pager-towns { font-size: 0.85rem; color: var(--text-2); }

	@media (min-width: 720px) {
		.towns-grid { grid-template-columns: 1fr 1fr; }
	}

	/* Narrow screens: each climb stacks its stats under the name so nothing runs off the edge. */
	@media (max-width: 560px) {
		.climb {
			grid-template-columns: auto 1fr;
			grid-template-areas: 'cat name' 'stats stats';
			gap: 9px 12px;
		}
		.climb-cat { grid-area: cat; }
		.climb-name { grid-area: name; align-self: center; }
		.climb-stats { grid-area: stats; flex-wrap: wrap; gap: 8px 14px; }
	}
</style>
