<script lang="ts">
	import { CURRENT_EVENT_SLUG } from '$lib';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// SINGLE-EVENT MODE: redirect home → the current event dashboard.
	// FUTURE (multi-event): replace this redirect with an event index that lists
	// WorldTour events segmented by active / upcoming / past. The event registry
	// in src/lib/index.ts already supports multiple events.
	const target = `/${CURRENT_EVENT_SLUG}/`;
	onMount(() => goto(target, { replaceState: true }));
</script>

<svelte:head>
	<meta http-equiv="refresh" content="0; url={target}" />
	<title>Tour de France 2026 — Stage Dashboard</title>
	<link rel="canonical" href={target} />
</svelte:head>

<noscript>
	<a href={target}>Continue to the Tour de France 2026 dashboard</a>
</noscript>
