<script lang="ts">
	import type { EventMeta } from '$lib/data/types';
	import { timeline } from '$lib/state';
	import { tick } from 'svelte';

	let { event, current }: { event: EventMeta; current: number } = $props();

	const items = $derived(timeline(event));

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let panelEl = $state<HTMLDivElement | null>(null);

	const currentStage = $derived(event.stages.find((s) => s.n === current));

	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			// Focus the current stage's link so keyboard users land on where they are.
			const el =
				panelEl?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ??
				panelEl?.querySelector<HTMLAnchorElement>('a');
			el?.focus();
		}
	}

	function close(refocus = true) {
		if (!open) return;
		open = false;
		if (refocus) triggerEl?.focus();
	}

	function links(): HTMLAnchorElement[] {
		return panelEl ? Array.from(panelEl.querySelectorAll('a')) : [];
	}

	function onPanelKeydown(e: KeyboardEvent) {
		const ls = links();
		const i = ls.indexOf(document.activeElement as HTMLAnchorElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			ls[Math.min(ls.length - 1, i + 1)]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			ls[Math.max(0, i - 1)]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			ls[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			ls[ls.length - 1]?.focus();
		} else if (e.key === 'Tab') {
			// Keep it simple + predictable: Tab closes the popup.
			close(false);
		}
	}

	function onTriggerKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (!open) toggle();
		}
	}

	// Close on outside click / pointer.
	$effect(() => {
		if (!open) return;
		const onDoc = (e: PointerEvent) => {
			const t = e.target as Node;
			if (!panelEl?.contains(t) && !triggerEl?.contains(t)) close(false);
		};
		document.addEventListener('pointerdown', onDoc, true);
		return () => document.removeEventListener('pointerdown', onDoc, true);
	});
</script>

<div class="selector">
	<button
		bind:this={triggerEl}
		type="button"
		class="trigger"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Jump to another stage. Current: stage {current}"
		onclick={toggle}
		onkeydown={onTriggerKeydown}
	>
		<span class="dot" style="background: var(--t-{currentStage?.type})" aria-hidden="true"></span>
		Stage {current}
		<svg class="chev" class:up={open} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
			<path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div bind:this={panelEl} class="panel" role="menu" onkeydown={onPanelKeydown} tabindex="-1">
			{#each items as item (item.kind === 'stage' ? `s${item.stage.n}` : `r${item.date}`)}
				{#if item.kind === 'stage'}
					{@const s = item.stage}
					<a
						href="/{event.slug}/stage-{s.n}"
						class="row"
						class:current={s.n === current}
						role="menuitem"
						aria-current={s.n === current ? 'page' : undefined}
						onclick={() => close(false)}
					>
						<span class="dot" style="background: var(--t-{s.type})" aria-hidden="true"></span>
						<span class="row-n mono">Stage {s.n}</span>
						<span class="row-towns">{s.start.name} → {s.finish.name}</span>
						{#if s.n === current}<span class="tick" aria-hidden="true">✓</span>{/if}
					</a>
				{:else}
					<div class="rest" aria-hidden="true">
						<span class="rest-line"></span>
						<span class="rest-label">Rest day{#if item.location} · {item.location}{/if}</span>
						<span class="rest-line"></span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.selector {
		position: relative;
		display: inline-block;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-family: var(--font-mono);
		font-size: inherit;
		color: var(--text);
		background: var(--ink-2);
		border: 1px solid var(--line-2);
		border-radius: 999px;
		padding: 3px 10px 3px 9px;
		cursor: pointer;
		transition: border-color 0.18s, background 0.18s;
	}
	.trigger:hover {
		border-color: var(--jaune-text);
		background: var(--ink-3);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.chev {
		color: var(--text-3);
		transition: transform 0.2s var(--ease);
	}
	.chev.up {
		transform: rotate(180deg);
	}

	.panel {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 60;
		width: min(340px, 86vw);
		max-height: 62vh;
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--line-2);
		border-radius: var(--radius-sm);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
		padding: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 10px;
		border-radius: 7px;
		color: var(--text-2);
		white-space: nowrap;
	}
	.row:hover,
	.row:focus-visible {
		background: var(--ink-2);
		color: var(--text);
		outline: none;
	}
	.row-n {
		font-size: 0.78rem;
		color: var(--text);
		flex-shrink: 0;
	}
	.row-towns {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.current {
		background: color-mix(in srgb, var(--jaune) 10%, var(--surface));
	}
	.row.current .row-n {
		color: var(--jaune-text);
	}
	.tick {
		margin-left: auto;
		color: var(--jaune-text);
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.rest {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 10px;
	}
	.rest-line {
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.rest-label {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-3);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.chev {
			transition: none;
		}
	}
</style>
