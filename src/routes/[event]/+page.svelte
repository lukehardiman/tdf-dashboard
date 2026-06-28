<script lang="ts">
	import StageCard from '$lib/components/StageCard.svelte';
	import RestDay from '$lib/components/RestDay.svelte';
	import TypologyBar from '$lib/components/TypologyBar.svelte';
	import TypologyKey from '$lib/components/TypologyKey.svelte';
	import { stageState, dayState, focusStage, timeline, isRestDay, toISODate, raceStatus, formatDate } from '$lib/state';
	import { tick } from 'svelte';

	let { data } = $props();
	const event = $derived(data.event);

	// "Now" — overridable via ?date=YYYY-MM-DD for previewing live behaviour.
	let now = $state(new Date());
	$effect(() => {
		const p = new URLSearchParams(window.location.search).get('date');
		if (p) now = new Date(p + 'T12:00:00');
	});

	const items = $derived(timeline(event));
	const focus = $derived(focusStage(event, now));

	// Masthead status pill: tell the visitor where the race is. Pre-race / finished have nowhere to
	// jump, so the pill goes static; on a stage or rest day it's a live "jump to today" control.
	const status = $derived(raceStatus(event, now));
	const statusLabel = $derived.by(() => {
		switch (status.phase) {
			case 'pre':
				return `Starts ${formatDate(status.startsISO)}`;
			case 'stage':
				return `${formatDate(status.dateISO)} · Stage ${status.stage.n}`;
			case 'rest':
				return `${formatDate(status.dateISO)} · Rest day`;
			case 'post':
				return 'Tour finished';
		}
	});
	const statusStatic = $derived(status.phase === 'pre' || status.phase === 'post');

	// Today's scroll target: the rest-day marker if today is a rest day, else the stage.
	const todaySelector = $derived(
		isRestDay(event, now) ? `[data-rest="${toISODate(now)}"]` : `[data-stage="${focus.n}"]`
	);

	async function jumpToday() {
		await tick();
		const el = document.querySelector(todaySelector);
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	// Auto-scroll to the focus stage on first load during the race window.
	let scrolled = $state(false);
	$effect(() => {
		if (scrolled) return;
		const inWindow = now >= new Date(event.startDate) && now <= new Date(event.endDate + 'T23:59');
		if (inWindow) {
			scrolled = true;
			jumpToday();
		}
	});

</script>

<svelte:head>
	<title>{event.name} — Stage-by-Stage Dashboard, Profiles & Routes</title>
	<meta
		name="description"
		content="Every stage of the {event.name}: interactive elevation profiles, route maps, climbs, distances and finish analysis. {event.stages.length} stages, {event.totalDistanceKm.toLocaleString()}km."
	/>
	<link rel="canonical" href="/{event.slug}/" />
</svelte:head>

<TypologyBar {event} showJump jumpLabel={statusLabel} jumpDisabled={statusStatic} onJumpToday={jumpToday} />

<main>
	<section class="hero">
		<div class="hero-grid">
			<div>
				<p class="eyebrow mono">113th edition · 4–26 July</p>
				<h1>The race,<br />stage by stage.</h1>
				<p class="lede">
					Every stage of the {event.year} Tour — elevation profiles, climbs, routes and
					finish analysis, in one place. Built for the people who actually watch.
				</p>
			</div>
			<dl class="facts mono">
				<div><dt>Distance</dt><dd>{event.totalDistanceKm.toLocaleString()}<span>km</span></dd></div>
				<div><dt>Elevation</dt><dd>{event.totalElevationM.toLocaleString()}<span>m ↑</span></dd></div>
				{#if event.teamCount}<div><dt>Teams</dt><dd>{event.teamCount}</dd></div>{/if}
				{#if event.riderCount}<div><dt>Riders</dt><dd>{event.riderCount}</dd></div>{/if}
			</dl>
		</div>
	</section>

	<div class="key-row">
		<TypologyKey />
	</div>

	<section class="stages">
		{#each items as item (item.kind === 'stage' ? `s${item.stage.n}` : `r${item.date}`)}
			{#if item.kind === 'stage'}
				<StageCard
					stage={item.stage}
					{event}
					state={stageState(item.stage, now)}
					series={data.previews[item.stage.n]}
				/>
			{:else}
				<RestDay date={item.date} location={item.location} state={dayState(item.date, now)} />
			{/if}
		{/each}
	</section>

	<footer class="foot">
		<p class="mono">
			An <a href="https://intervals.icu">Intervals.icu</a> project · Route data from official sources ·
			Built for the steephill generation.
		</p>
	</footer>
</main>

<style>
	main { max-width: var(--maxw); margin: 0 auto; padding: 0 20px 80px; }

	.hero { padding: 64px 0 40px; }
	.hero-grid {
		display: grid;
		gap: 32px;
		grid-template-columns: 1fr;
	}
	.eyebrow {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--jaune-text);
		margin: 0 0 18px;
	}
	h1 {
		font-size: clamp(2.6rem, 7vw, 4.6rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--text);
	}
	.lede {
		margin: 22px 0 0;
		font-size: 1.05rem;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 46ch;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1px;
		background: var(--line);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		align-self: start;
	}
	.facts > div { background: var(--surface); padding: 18px 20px; }
	.facts dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); }
	.facts dd { margin: 6px 0 0; font-size: 1.9rem; font-weight: 700; color: var(--text); line-height: 1; }
	.facts dd span { font-size: 0.8rem; color: var(--text-3); margin-left: 3px; font-weight: 500; }

	/* Colour key sits between the intro and the listing it explains. */
	.key-row { padding: 0 0 16px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }

	.stages { display: flex; flex-direction: column; gap: 12px; }

	.foot { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--line); }
	.foot p { font-size: 0.76rem; color: var(--text-3); }
	.foot a { color: var(--text-2); border-bottom: 1px solid var(--line-2); }

	@media (min-width: 820px) {
		.hero-grid { grid-template-columns: 1.4fr 1fr; align-items: end; }
		.facts { grid-template-columns: repeat(2, 1fr); }
	}
</style>
