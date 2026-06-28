<script lang="ts">
	// The stage-typology colour key. Lives in the CONTENT (not the masthead) so it explains the
	// swatches actually on screen — the listing cards on the home page, and the breadcrumb dot +
	// type badge on a stage page — while leaving the masthead free for product nav.
	import { TYPE_LABELS, type StageType } from '$lib/data/types';
	const types: StageType[] = ['flat', 'hills', 'mountains', 'itt', 'ttt'];
</script>

<div class="key" role="list" aria-label="Stage type colours">
	{#each types as t (t)}
		<span class="key-item" role="listitem">
			<span class="swatch" style="background: var(--t-{t})"></span>
			<span class="key-label">{TYPE_LABELS[t]}</span>
		</span>
	{/each}
</div>

<style>
	.key {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.key-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.key-label {
		font-size: 0.72rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	@media (max-width: 460px) {
		.key {
			gap: 10px 12px;
		}
	}
</style>
