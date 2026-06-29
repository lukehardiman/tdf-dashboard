<script lang="ts">
	// Zoomed plan-view of the final kilometres, to PAIR with the decisive-zone profile. For sprint
	// (D) and technical-descent (C) finishes the decisive factor is CORNERS — invisible on an
	// elevation profile, obvious in plan view — so the map earns its place exactly where the profile
	// is weakest. Fed the DENSE finishTrack (raw GPX, corners intact; see scripts/build-profiles.ts):
	// the route is already road-accurate, so no map-matching is needed and we draw a thin line so the
	// bends read crisply. A flamme-rouge (1 km to go) marker and the finish marker orient the viewer,
	// and a scrub dot tracks the profile hover (the profile reports km-to-go; we place the dot that
	// far back along the track).
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Map as MlMap, Marker as MlMarker, GeoJSONSource } from 'maplibre-gl';
	import { trackToGeoJSON, trackBounds, type LngLat } from '$lib/render/route';
	import { haversineKm } from '$lib/render/curvature';

	let {
		track,
		colorVar = '--jaune',
		finishName,
		label = 'finish',
		/** Show only the final `windowKm` of the track, to MATCH the paired profile's window so the
		 *  two views show the same distance (and the scrub dot tracks 1:1). Capped at the track length. */
		windowKm = Infinity,
		/** Km-to-go reported by the profile scrub (null = not scrubbing). Places the tracking dot. */
		scrubKmToGo = null
	}: {
		track: LngLat[];
		/** CSS custom-property name to colour the route line with (resolved at runtime). */
		colorVar?: string;
		finishName: string;
		label?: string;
		windowKm?: number;
		scrubKmToGo?: number | null;
	} = $props();

	// The final `windowKm` of the dense track — what the map actually draws (matches the profile).
	function sliceFinalKm(t: LngLat[], km: number): LngLat[] {
		if (!isFinite(km) || t.length < 2) return t;
		let cum = 0;
		for (let i = t.length - 1; i > 0; i--) {
			cum += haversineKm(t[i], t[i - 1]);
			if (cum >= km) return t.slice(i - 1);
		}
		return t;
	}
	const shown = $derived(sliceFinalKm(track, windowKm));

	// Same keyless, unmetered tile source as the main route map (single point of change there).
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	let container = $state<HTMLDivElement | null>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');

	let maplibre: typeof import('maplibre-gl') | null = null;
	let map: MlMap | null = null;
	let markers: MlMarker[] = []; // static: finish + flamme rouge
	let scrubMarker: MlMarker | null = null; // moving: tracks the profile scrub
	let observer: IntersectionObserver | null = null;

	const hasTrack = $derived(shown.length >= 2);

	function resolveColor(): string {
		const v =
			typeof getComputedStyle !== 'undefined' && container
				? getComputedStyle(container).getPropertyValue(colorVar).trim()
				: '';
		return v || '#ffd400';
	}

	// The point `km` back from the finish — walk the track from the end summing real distance and
	// interpolate within the straddling segment. Returns null when km is beyond the track's start.
	function coordAtKmFromEnd(t: LngLat[], km: number): LngLat | null {
		if (t.length < 2) return null;
		if (km <= 0) return t[t.length - 1];
		let cum = 0;
		for (let i = t.length - 1; i > 0; i--) {
			const d = haversineKm(t[i], t[i - 1]);
			if (cum + d >= km) {
				const f = d > 0 ? (km - cum) / d : 0;
				return [t[i][0] + (t[i - 1][0] - t[i][0]) * f, t[i][1] + (t[i - 1][1] - t[i][1]) * f];
			}
			cum += d;
		}
		return null;
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
				bounds: trackBounds(shown),
				fitBoundsOptions: { padding: 38 },
				cooperativeGestures: true,
				attributionControl: false
			});
			map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right');
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			map.addControl(new maplibre.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-left');

			map.on('load', () => {
				if (!map) return;
				// Empty source + layers; the reactive renderTrack() effect fills them for the current
				// track AND re-fills on client-side nav to another stage (the instance is reused).
				map.addSource('finish', { type: 'geojson', data: trackToGeoJSON([]) });
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

	function markerEl(cls: string, title: string, text?: string): HTMLDivElement {
		const el = document.createElement('div');
		el.className = cls;
		el.title = title;
		if (text) el.textContent = text;
		return el;
	}

	function addMarkers(t: LngLat[]) {
		if (!map || !maplibre || t.length < 2) return;
		for (const m of markers) m.remove();
		markers = [];
		// Finish line marker (gold — pairs with the profile's yellow finish line).
		markers.push(
			new maplibre.Marker({ element: markerEl('finish-line-marker', `Finish — ${finishName}`) })
				.setLngLat(t[t.length - 1])
				.addTo(map)
		);
		// Flamme rouge — 1 km to go, labelled (pairs with the profile's red "1 km" marker).
		const fr = coordAtKmFromEnd(t, 1);
		if (fr) {
			markers.push(
				new maplibre.Marker({ element: markerEl('flamme-marker', '1 km to go', '1 km') })
					.setLngLat(fr)
					.addTo(map)
			);
		}
	}

	// Render (or re-render) the current track. Runs on first ready AND on client-side nav to another
	// stage — without this the reused map keeps the PREVIOUS stage's finish (the nav-reload bug).
	function renderTrack(t: LngLat[]) {
		if (!map || t.length < 2) return;
		// Guard against the canvas underfilling its container (e.g. if the map initialised before the
		// wrap reached full height) — a short canvas would read as extra bottom padding.
		map.resize();
		(map.getSource('finish') as GeoJSONSource | undefined)?.setData(trackToGeoJSON(t));
		map.setPaintProperty('finish-line', 'line-color', resolveColor());
		map.fitBounds(trackBounds(t), { padding: 38, animate: false });
		addMarkers(t);
	}

	$effect(() => {
		const t = shown;
		if (status !== 'ready') return;
		renderTrack(t);
	});

	// Scrub → tracking dot. The profile reports km-to-go; place the dot that far back along the
	// shown track. The map window matches the profile, so km-to-go is in range and the dot tracks
	// 1:1; if it ever exceeds the shown window there's nowhere to put it → hide.
	$effect(() => {
		const k = scrubKmToGo;
		const t = shown;
		if (status !== 'ready' || !map || !maplibre) return;
		const coord = k == null ? null : coordAtKmFromEnd(t, k);
		if (!coord) {
			scrubMarker?.remove();
			scrubMarker = null;
			return;
		}
		if (!scrubMarker) {
			scrubMarker = new maplibre.Marker({ element: markerEl('finish-scrub', 'Profile position') })
				.setLngLat(coord)
				.addTo(map);
		} else {
			scrubMarker.setLngLat(coord);
		}
	});

	onDestroy(() => {
		if (!browser) return;
		observer?.disconnect();
		scrubMarker?.remove();
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
	/* Finish marker: green disc — distinct from the red flamme and the yellow scrub dot (the three
	   markers must not share a hue). Same green as the route map's endpoint markers. */
	:global(.finish-line-marker) {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		background: #1a8f3c;
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	/* Flamme rouge (1 km to go): a small red pill, pairs with the profile's red "1 km" marker. */
	:global(.flamme-marker) {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 700;
		line-height: 1;
		color: #fff;
		background: var(--t-mountains);
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 999px;
		padding: 3px 6px;
		white-space: nowrap;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	/* Scrub dot: the moving tracking dot (jaune + halo, same as the route map's scrub marker). */
	:global(.finish-scrub) {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--jaune);
		border: 2px solid var(--ink);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--jaune) 45%, transparent);
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
