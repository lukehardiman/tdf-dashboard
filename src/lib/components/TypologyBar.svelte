<script lang="ts">
	import type { EventMeta } from '$lib/data/types';
	import { theme } from '$lib/theme.svelte';

	let {
		event,
		onJumpToday,
		showJump = false,
		jumpLabel = 'Today',
		jumpDisabled = false
	}: {
		event: EventMeta;
		onJumpToday?: () => void;
		showJump?: boolean;
		/** Status pill text — e.g. "Tue 14 Jul · Stage 10", or "Starts 4 Jul" before the race. */
		jumpLabel?: string;
		/** When there's nowhere to jump (pre-race / finished), show a static pill, not a link. */
		jumpDisabled?: boolean;
	} = $props();
</script>

<header class="bar">
	<div class="inner">
		<div class="brand">
			<!-- Intervals mark → out to the product (brand + funnel). Self-contained crimson
			     disc: carries its own contrast, no per-theme variant, never tinted. -->
			<a
				class="brand-mark-link"
				href="https://intervals.icu"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Intervals.icu"
			>
				<img src="/intervals-logo-round.svg" alt="Intervals.icu" class="brand-mark" width="26" height="26" />
			</a>
			<!-- Wordmark → home within the microsite. Display-font logotype with a mono eyebrow. -->
			<a class="brand-word" href="/{event.slug}" aria-label="{event.name} dashboard — home">
				<span class="brand-eyebrow">Dashboard</span>
				<span class="brand-name">{event.name}</span>
			</a>
		</div>

		<div class="actions">
			{#if showJump}
				{#if jumpDisabled}
					<span class="jump jump-static" aria-live="polite">
						<span class="jump-dot dim"></span> {jumpLabel}
					</span>
				{:else}
					<button class="jump" onclick={onJumpToday} aria-label="Jump to {jumpLabel}">
						<span class="jump-dot"></span> {jumpLabel}
					</button>
				{/if}
			{/if}

			<button
				class="theme-toggle"
				onclick={() => theme.toggle()}
				aria-label={theme.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
				title={theme.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
			>
				{#if theme.current === 'dark'}
					<!-- sun: click to go light -->
					<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<circle cx="12" cy="12" r="4.2" />
						<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
					</svg>
				{:else}
					<!-- moon: click to go dark -->
					<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
						<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z" />
					</svg>
				{/if}
			</button>
		</div>
	</div>
</header>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--ink) 82%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--line);
	}
	.inner {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 11px 20px;
		display: flex;
		align-items: center;
		gap: 20px;
	}
	/* Lockup: Intervals mark + a mono "Dashboard" eyebrow stacked over the display-font wordmark. */
	.brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
	.brand-mark-link { display: inline-flex; align-items: center; }
	.brand-mark { display: block; width: 26px; height: 26px; }
	.brand-word {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		line-height: 1;
		white-space: nowrap;
	}
	.brand-eyebrow {
		font-family: var(--font-mono);
		text-transform: uppercase;
		font-weight: 600;
		font-size: 0.58rem;
		letter-spacing: 0.16em;
		color: var(--text-3);
	}
	.brand-name {
		font-family: var(--font-display);
		font-style: normal;
		font-weight: 700;
		font-size: 1.3rem;
		line-height: 1;
		letter-spacing: -0.01em;
		color: var(--text);
	}

	.actions { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--ink-2);
		color: var(--text-2);
		cursor: pointer;
		transition: color 0.18s var(--ease), border-color 0.18s var(--ease), transform 0.18s var(--ease);
	}
	.theme-toggle:hover { color: var(--text); border-color: var(--line-2); transform: translateY(-1px); }

	.jump {
		display: flex; align-items: center; gap: 6px;
		background: var(--jaune);
		color: var(--jaune-ink);
		border: none;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 0.76rem;
		padding: 6px 12px;
		border-radius: 999px;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.18s var(--ease);
	}
	button.jump:hover { transform: translateY(-1px); }
	.jump-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--jaune-ink); }
	/* Pre-race / finished: nothing to jump to — a muted, non-interactive status pill. */
	.jump-static {
		background: var(--ink-2);
		color: var(--text-2);
		cursor: default;
		border: 1px solid var(--line);
	}
	.jump-dot.dim { background: var(--text-3); }

	@media (max-width: 460px) {
		.inner { gap: 12px; }
	}
</style>
