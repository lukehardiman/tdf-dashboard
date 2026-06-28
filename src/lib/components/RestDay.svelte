<script lang="ts">
	import { formatDate, type StageState } from '$lib/state';

	let {
		date,
		state = 'upcoming',
		/** Host town, only if genuinely known — never invented. */
		location = undefined
	}: {
		date: string;
		state?: StageState;
		location?: string;
	} = $props();
</script>

<!-- The absence of a stage: a quiet divider. Its lighter weight is the signal. -->
<div
	class="rest"
	class:today={state === 'today'}
	class:past={state === 'past'}
	data-rest={date}
>
	{#if state === 'today'}<span class="live-dot" aria-label="Today"></span>{/if}
	<span class="date mono">{formatDate(date)}</span>
	<span class="sep" aria-hidden="true">·</span>
	<span class="label">Rest day{#if location} · {location}{/if}</span>
</div>

<style>
	.rest {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 20px;
		min-height: 0;
		color: var(--text-3);
		border: 1px dashed var(--line);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface) 45%, transparent);
	}
	.date {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-3);
	}
	.sep { color: var(--line-2); }
	.label {
		font-size: 0.82rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--text-2);
	}

	/* Today: same maillot-jaune live treatment as the cards, but understated. */
	.rest.today {
		border-style: solid;
		border-color: color-mix(in srgb, var(--jaune) 45%, var(--line));
		background: color-mix(in srgb, var(--jaune) 6%, transparent);
	}
	.rest.today .label { color: var(--text); }
	.live-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--jaune);
		animation: rest-pulse 2s infinite;
	}
	@keyframes rest-pulse {
		0% { box-shadow: 0 0 0 0 rgba(255, 212, 0, 0.5); }
		70% { box-shadow: 0 0 0 6px rgba(255, 212, 0, 0); }
		100% { box-shadow: 0 0 0 0 rgba(255, 212, 0, 0); }
	}

	.rest.past { opacity: 0.5; }

	@media (prefers-reduced-motion: reduce) {
		.live-dot { animation: none; }
	}
</style>
