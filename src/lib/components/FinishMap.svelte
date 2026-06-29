<script lang="ts">
	// Zoomed plan-view of the final kilometres, to PAIR with the decisive-zone profile. For sprint
	// (D) and technical-descent (C) finishes the decisive factor is CORNERS — invisible on an
	// elevation profile, obvious in plan view — so the map earns its place exactly where the profile
	// is weakest. Fed the DENSE finishTrack (raw GPX, corners intact; see scripts/build-profiles.ts):
	// the route is already road-accurate, so no map-matching is needed and we draw a thin line so the
	// bends read crisply. A flamme-rouge (1 km to go) marker and the finish marker orient the viewer.
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
	import { trackToGeoJSON, trackBounds, type LngLat } from '$lib/render/route';
	import { haversineKm } from '$lib/render/curvature';

	let {
		track,
		colorVar = '--jaune',
		finishName,
		label = 'finish'
	}: {
		track: LngLat[];
		/** CSS custom-property name to colour the route line with (resolved at runtime). */
		colorVar?: string;
		finishName: string;
		label?: string;
	} = $props();

	// Same keyless, unmetered tile source as the main route map (single point of change there).
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	let container = $state<HTMLDivElement | null>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');

	let maplibre: typeof import('maplibre-gl') | null = null;
	let map: MlMap | null = null;
	let markers: MlMarker[] = [];
	let observer: IntersectionObserver | null = null;

	const hasTrack = $derived(track.length >= 2);

	function resolveColor(): string {
		const v =
			typeof getComputedStyle !== 'undefined' && container
				? getComputedStyle(container).getPropertyValue(colorVar).trim()
				: '';
		return v || '#ffd400';
	}

	// The point 1 km from the line — walk back along the dense track summing real distance.
	function flammeRougeCoord(t: LngLat[]): LngLat | null {
		let cum = 0;
		for (let i = t.length - 1; i > 0; i--) {
			cum += haversineKm(t[i], t[i - 1]);
			if (cum >= 1) return t[i - 1];
		}
		return null; // track shorter than 1 km
	}

	// Lazy-load: only spin up MapLibre once the map scrolls into view (it's below the fold).
	$effect(() => {
		if (!container || !hasTrack) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					observer?.disconnect();
					observer = null;
					void init();
				}
			},
			{ rootMargin: '250px' }
		);
		observer.observe(container);
		return () => {
			observer?.disconnect();
			observer = null;
		};
	});

	async function init() {
		if (status !== 'idle' || !container || !hasTrack) return;
		status = 'loading';
		try {
			maplibre = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');

			map = new maplibre.Map({
				container,
				style: STYLE_URL,
				bounds: trackBounds(track),
				fitBoundsOptions: { padding: 38 },
				cooperativeGestures: true,
				attributionControl: false
			});
			map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right');
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			map.addControl(new maplibre.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-left');

			map.on('load', () => {
				if (!map) return;
				map.addSource('finish', { type: 'geojson', data: trackToGeoJSON(track) });
				map.addLayer({
					id: 'finish-casing',
					type: 'line',
					source: 'finish',
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': '#000', 'line-opacity': 0.3, 'line-width': 4 }
				});
				// Thin line so tight corners read crisply rather than blobbing (the diagnosis showed a
				// thicker line was part of the "sloppy" look; the raw track itself is road-accurate).
				map.addLayer({
					id: 'finish-line',
					type: 'line',
					source: 'finish',
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': resolveColor(), 'line-width': 2.4 }
				});
				addMarkers();
				status = 'ready';
			});

			map.on('error', (e) => {
				console.warn('[FinishMap] map error', e?.error ?? e);
				status = 'error';
			});
		} catch (e) {
			console.warn('[FinishMap] failed to load', e);
			status = 'error';
		}
	}

	function marker(cls: string, title: string): HTMLDivElement {
		const el = document.createElement('div');
		el.className = cls;
		el.title = title;
		return el;
	}

	function addMarkers() {
		if (!map || !maplibre) return;
		for (const m of markers) m.remove();
		markers = [];
		// Finish line marker (gold — pairs with the profile's yellow finish line).
		markers.push(
			new maplibre.Marker({ element: marker('finish-line-marker', `Finish — ${finishName}`) })
				.setLngLat(track[track.length - 1])
				.addTo(map)
		);
		// Flamme rouge — 1 km to go (red — pairs with the profile's red 1 km marker).
		const fr = flammeRougeCoord(track);
		if (fr) {
			markers.push(
				new maplibre.Marker({ element: marker('flamme-marker', '1 km to go') })
					.setLngLat(fr)
					.addTo(map)
			);
		}
	}

	onDestroy(() => {
		if (!browser) return;
		observer?.disconnect();
		for (const m of markers) m.remove();
		markers = [];
		map?.remove();
		map = null;
	});
</script>

<div class="finish-map-wrap">
	<div bind:this={container} class="finish-map" role="img" aria-label="Final kilometres into {label}"></div>
	{#if status === 'loading' || status === 'idle'}
		<div class="map-state mono" aria-hidden="true">Loading map…</div>
	{:else if status === 'error'}
		<div class="map-state mono">Map unavailable — the run-in is described in the profile above.</div>
	{/if}
</div>

<style>
	.finish-map-wrap {
		position: relative;
		height: clamp(220px, 34vh, 320px);
		margin-top: 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--ink-2);
	}
	.finish-map {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.map-state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 0.78rem;
		color: var(--text-3);
		pointer-events: none;
		padding: 0 20px;
		text-align: center;
	}
	/* Finish marker: gold disc, pairs with the profile's yellow finish line. */
	:global(.finish-line-marker) {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		background: var(--jaune);
		border: 2px solid var(--ink);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--jaune) 50%, transparent);
	}
	/* Flamme rouge (1 km to go): small red dot, pairs with the profile's red 1 km marker. */
	:global(.flamme-marker) {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: var(--t-mountains);
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	/* Scale bar: muted to match the theme (same treatment as the route map). */
	:global(.finish-map-wrap .maplibregl-ctrl-scale) {
		font-family: var(--font-mono);
		font-size: 9px;
		line-height: 1.3;
		color: var(--text-2);
		background: color-mix(in srgb, var(--surface) 72%, transparent);
		border: 1px solid var(--line);
		border-top: none;
		border-radius: 0 0 3px 3px;
		padding: 1px 5px 2px;
		box-shadow: none;
		margin: 0 0 8px 8px;
	}
	:global(.finish-map-wrap .maplibregl-ctrl-attrib) {
		font-size: 10px;
	}
</style>
