<script lang="ts">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import type { EventMeta } from '$lib/data/types';
	import { theme } from '$lib/theme.svelte';

	let {
		event,
		onJumpToday,
		showJump = false,
		jumpLabel = 'Today',
		jumpDisabled = false,
		nav
	}: {
		event: EventMeta;
		onJumpToday?: () => void;
		showJump?: boolean;
		/** Status pill text — e.g. "Tue 14 Jul · Stage 10", or "Starts 4 Jul" before the race. */
		jumpLabel?: string;
		/** When there's nowhere to jump (pre-race / finished), show a static pill, not a link. */
		jumpDisabled?: boolean;
		/** Primary navigation pinned in the masthead, right of the wordmark (e.g. the stage selector). */
		nav?: Snippet;
	} = $props();

	// Condense on scroll: full height at the top, slim bar once scrolled. The masthead is sticky so
	// stage nav is always reachable, but a tall permanent header would claw back the map+profile
	// co-visibility we fought for — so it shrinks to just logo + nav as soon as the page moves.
	let condensed = $state(false);
	$effect(() => {
		if (!browser) return;
		let raf = 0;
		const update = () => {
			raf = 0;
			condensed = window.scrollY > 12;
		};
		const onScroll = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<header class="bar" class:condensed>
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

		{#if nav}
			<!-- Primary nav (the stage selector) lives here, right of the wordmark — it's the page's
			     key navigation, so it stays in the masthead and survives the condense-on-scroll. -->
			<div class="masthead-nav">{@render nav()}</div>
		{/if}

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
		transition: padding 0.2s var(--ease);
	}
	/* Condensed (scrolled): slim the bar to just logo + nav so it reclaims minimal vertical space. */
	.condensed .inner {
		padding-top: 5px;
		padding-bottom: 5px;
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
		max-height: 1.4em;
		overflow: hidden;
		transition: max-height 0.2s var(--ease), opacity 0.2s var(--ease);
	}
	/* On scroll the eyebrow collapses away, leaving the wordmark + nav as the slim bar. */
	.condensed .brand-eyebrow {
		max-height: 0;
		opacity: 0;
	}
	.brand-name {
		font-family: var(--font-display);
		font-style: normal;
		font-weight: 700;
		font-size: 1.3rem;
		line-height: 1;
		letter-spacing: -0.01em;
		color: var(--text);
		transition: font-size 0.2s var(--ease);
	}
	.condensed .brand-name {
		font-size: 1.05rem;
	}

	/* The stage selector: primary navigation, so a touch larger/more prominent than the old
	   breadcrumb-sized text. font-size cascades into StageSelector's trigger (it inherits). */
	.masthead-nav {
		flex-shrink: 0;
		font-size: 0.92rem;
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

	/* Narrow screens: the stage selector is the must-keep element, so tighten the gaps, drop the
	   eyebrow and shrink the wordmark to guarantee logo + full wordmark + selector fit one row. */
	@media (max-width: 560px) {
		.inner { gap: 10px; padding-left: 14px; padding-right: 14px; }
		.brand { gap: 7px; }
		.brand-eyebrow { max-height: 0; opacity: 0; }
		.brand-name { font-size: 1rem; }
		.masthead-nav { font-size: 0.82rem; }
	}
	@media (max-width: 360px) {
		/* Last-resort on the very smallest phones: let the wordmark truncate (clean ellipsis)
		   before the selector is ever squeezed off — the selector is the must-keep element. */
		.brand { flex-shrink: 1; min-width: 0; }
		.brand-word { min-width: 0; overflow: hidden; }
		/* width:100% pins the text box to the (shrunk) wordmark width so text-overflow renders
		   the ellipsis on the text itself, rather than the parent hard-clipping mid-word. */
		.brand-name { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	}

	@media (prefers-reduced-motion: reduce) {
		.inner,
		.brand-eyebrow,
		.brand-name {
			transition: none;
		}
	}
</style>
