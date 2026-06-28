<script lang="ts">
	import type { Stage, EventMeta } from '$lib/data/types';
	import { TYPE_SHORT, TYPE_LABELS } from '$lib/data/types';
	import { formatDate, type StageState } from '$lib/state';
	import type { ElePoint } from '$lib/render/profile';
	import StageProfile from './StageProfile.svelte';

	let {
		stage,
		event,
		state = 'upcoming',
		series = null
	}: {
		stage: Stage;
		event: EventMeta;
		state?: StageState;
		/** GPX-derived preview series; falls back to synthesised when absent. */
		series?: ElePoint[] | null;
	} = $props();

	const href = $derived(`/${event.slug}/stage-${stage.n}`);
</script>

<a
	{href}
	class="card t-{stage.type}"
	class:today={state === 'today'}
	class:past={state === 'past'}
	data-stage={stage.n}
	style="view-transition-name: stage-{stage.n};"
>
	<div class="rail" aria-hidden="true"></div>

	<div class="head">
		<div class="num-wrap">
			<span class="num mono">{stage.n}</span>
			{#if state === 'today'}<span class="live-dot" aria-label="Today"></span>{/if}
		</div>
		<div class="meta">
			<span class="date mono">{formatDate(stage.date)}</span>
			<span class="type-tag" style="--tag: var(--t-{stage.type})">{TYPE_SHORT[stage.type]}</span>
		</div>
	</div>

	<div class="body">
		<h3 class="towns">
			<span>{stage.start.name}</span>
			<span class="dest"><span class="arrow" aria-hidden="true">→</span> {stage.finish.name}</span>
		</h3>
		<div class="stats mono">
			<span>{stage.distanceKm} km</span>
			<span class="dot">·</span>
			<span>{stage.elevationGainM.toLocaleString()} m</span>
			{#if stage.summitFinish}<span class="dot">·</span><span class="summit">summit finish</span>{/if}
		</div>
	</div>

	<div class="spark">
		<StageProfile {stage} {series} width={520} height={92} showMarkers={false} />
	</div>

	<span class="cta" aria-hidden="true">View stage</span>
</a>

<style>
	.card {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-areas:
			'head body'
			'spark spark'
			'cta cta';
		gap: 12px 18px;
		padding: 18px 20px 16px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		transition: border-color 0.25s var(--ease), transform 0.25s var(--ease), background 0.25s var(--ease);
		overflow: hidden;
	}
	.card:hover {
		border-color: var(--line-2);
		transform: translateY(-2px);
		background: var(--ink-2);
	}

	.rail {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--t-flat);
	}
	.t-ttt .rail { background: var(--t-ttt); }
	.t-itt .rail { background: var(--t-itt); }
	.t-flat .rail { background: var(--t-flat); }
	.t-hills .rail { background: var(--t-hills); }
	.t-mountains .rail { background: var(--t-mountains); }

	.head { grid-area: head; }
	.num-wrap { display: flex; align-items: center; gap: 7px; }
	.num {
		font-family: var(--font-display);
		font-size: 2.4rem;
		font-weight: 800;
		line-height: 0.9;
		color: var(--text);
	}
	.live-dot {
		width: 9px; height: 9px; border-radius: 50%;
		background: var(--jaune);
		box-shadow: 0 0 0 0 var(--jaune);
		animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0% { box-shadow: 0 0 0 0 rgba(255, 212, 0, 0.5); }
		70% { box-shadow: 0 0 0 7px rgba(255, 212, 0, 0); }
		100% { box-shadow: 0 0 0 0 rgba(255, 212, 0, 0); }
	}
	.meta { display: flex; flex-direction: column; gap: 5px; margin-top: 7px; }
	.date { font-size: 0.72rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
	.type-tag {
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--tag);
		border: 1px solid color-mix(in srgb, var(--tag) 40%, transparent);
		background: color-mix(in srgb, var(--tag) 12%, transparent);
		padding: 2px 7px;
		border-radius: 999px;
		width: fit-content;
	}

	.body { grid-area: body; align-self: center; }
	.towns {
		font-size: 1.18rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 9px;
		flex-wrap: wrap;
		color: var(--text);
	}
	.dest { display: inline-flex; align-items: center; gap: 9px; white-space: nowrap; }
	.arrow { color: var(--text-3); font-weight: 400; }
	.stats { margin-top: 7px; font-size: 0.8rem; color: var(--text-2); display: flex; align-items: center; gap: 7px; }
	.dot { color: var(--text-3); }
	.summit { color: var(--t-mountains); font-weight: 600; }

	.spark { grid-area: spark; margin: 0 -4px; opacity: 0.92; }

	.cta {
		grid-area: cta;
		justify-self: end;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
		transition: color 0.2s;
	}
	.card:hover .cta { color: var(--jaune-text); }

	/* Today */
	.card.today {
		border-color: color-mix(in srgb, var(--jaune) 55%, var(--line));
		background: color-mix(in srgb, var(--jaune) 5%, var(--surface));
	}
	.card.today:hover { background: color-mix(in srgb, var(--jaune) 8%, var(--surface)); }

	/* Past — recede gently */
	.card.past { opacity: 0.62; }
	.card.past:hover { opacity: 1; }

	@media (min-width: 640px) {
		.card {
			grid-template-columns: auto 1fr 280px;
			grid-template-areas:
				'head body spark'
				'head cta spark';
			align-items: center;
		}
		.spark { align-self: center; }
	}
</style>
