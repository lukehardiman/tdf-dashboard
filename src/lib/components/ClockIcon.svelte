<script lang="ts">
	// Small clock outline that makes a bare "12:40" parse instantly as A TIME in a dense card.
	// Deliberately a clock, NOT a flag — the chequered flag is committed to "finish" on the maps,
	// so a start-flag would muddy that; a clock is neutral and works for road starts AND TT
	// "first rider" alike. Inherits currentColor + sizes to 1em so it aligns with the time digits.
	let { size = '1em' }: { size?: string } = $props();
</script>

<svg
	class="clock"
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	aria-hidden="true"
>
	<circle cx="8" cy="8" r="5.6" />
	<path d="M8 4.7V8l2.3 1.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
	.clock {
		/* Optically centre on the digits — nudged up a hair from baseline. */
		vertical-align: -0.14em;
	}
</style>
