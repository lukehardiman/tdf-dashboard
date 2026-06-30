<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Map as MlMap, Marker as MlMarker, GeoJSONSource } from 'maplibre-gl';
	import {
		trackToGeoJSON,
		trackBounds,
		trackUpToFraction,
		coordAtFraction,
		type LngLat
	} from '$lib/render/route';
	import type { ProfileSprint } from '$lib/data/profiles';

	let {
		track,
		/** CSS custom-property name to colour the route line with (resolved at runtime). */
		colorVar = '--jaune',
		/** 0..1 position along the route to mark (e.g. driven by the profile scrub). */
		markerFraction = null,
		/** Intermediate sprints to pin on the route (circuit re-marks already collapsed). */
		sprints = [],
		label = 'route',
		/** Standalone (true) draws its own border/radius; embedded in a unit, pass false. */
		framed = true
	}: {
		track: LngLat[];
		colorVar?: string;
		markerFraction?: number | null;
		sprints?: ProfileSprint[];
		label?: string;
		framed?: boolean;
	} = $props();

	// Tile source isolated here so it's a one-line swap without touching anything else.
	// OpenFreeMap is free, open, keyless and unmetered — good default for static + viral.
	//
	// KNOWN EXTERNAL RISK: tile-source reliability under race-day spike traffic. If
	// OpenFreeMap is down or throttled mid-race, every map silently fails to its
	// 'error' state (the route still renders on the profile above, so the page degrades
	// gracefully rather than breaking). Fallback plan, not yet built:
	//   1. MapTiler (api key, generous free tier) — fastest swap, just change this URL + key.
	//   2. Self-hosted Protomaps PMTiles (a single static .pmtiles France/Alps/Pyrenees
	//      extract on our own CDN, read client-side) — removes the third-party runtime
	//      dependency entirely; best for guaranteed race-week availability.
	// Decide before go-live; for now this is the documented single point of change.
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
	const DRAW_MS = 1500;

	let container = $state<HTMLDivElement | null>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');

	// Non-reactive handles (no $state — these are imperative resources).
	let maplibre: typeof import('maplibre-gl') | null = null;
	let map: MlMap | null = null;
	let marker: MlMarker | null = null;
	let endpoints: MlMarker[] = [];
	let sprintMarkers: MlMarker[] = [];
	let raf = 0;
	let observer: IntersectionObserver | null = null;

	const hasTrack = $derived(track.length >= 2);

	function resolveColor(): string {
		const v =
			typeof getComputedStyle !== 'undefined' && container
				? getComputedStyle(container).getPropertyValue(colorVar).trim()
				: '';
		return v || '#ffd400';
	}

	function prefersReducedMotion(): boolean {
		return (
			typeof matchMedia !== 'undefined' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	// Lazy-load: only spin up MapLibre once the map scrolls into view.
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
			// Heavy lib + CSS pulled in here only — kept out of the page chunk.
			maplibre = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');

			map = new maplibre.Map({
				container,
				style: STYLE_URL,
				bounds: trackBounds(track),
				fitBoundsOptions: { padding: 44 },
				cooperativeGestures: true, // don't hijack page scroll
				attributionControl: false
			});
			map.addControl(
				new maplibre.AttributionControl({ compact: true }),
				'bottom-right'
			);
			map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			// Distance scale — metric only. Sits bottom-left, themed unobtrusively below so it
			// reads on tiles in either mode without shouting (overrides the default chunky widget).
			map.addControl(new maplibre.ScaleControl({ unit: 'metric', maxWidth: 96 }), 'bottom-left');

			map.on('load', () => {
				if (!map) return;
				// Empty source + layers; the reactive renderTrack() effect fills them in for
				// the current track — and re-fills on client-side nav to another stage.
				map.addSource('route', { type: 'geojson', data: trackToGeoJSON([]) });
				map.addLayer({
					id: 'route-casing',
					type: 'line',
					source: 'route',
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': '#000', 'line-opacity': 0.35, 'line-width': 6 }
				});
				map.addLayer({
					id: 'route-line',
					type: 'line',
					source: 'route',
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: { 'line-color': resolveColor(), 'line-width': 3.5 }
				});
				status = 'ready';
			});

			map.on('error', (e) => {
				console.warn('[RouteMap] map error', e?.error ?? e);
				status = 'error';
			});
		} catch (e) {
			console.warn('[RouteMap] failed to load', e);
			status = 'error';
		}
	}

	function addEndpoint(at: LngLat, color: string, title: string) {
		if (!map || !maplibre) return;
		const el = document.createElement('div');
		el.className = 'route-endpoint';
		el.style.background = color;
		el.title = title;
		endpoints.push(new maplibre.Marker({ element: el }).setLngLat(at).addTo(map));
	}

	// Finish = a chequered flag (the universal race-finish symbol), shared with the decisive-zone
	// map so the finish looks identical everywhere. A flag, not a coloured dot — self-evident without
	// relying on the start/finish colour convention, and a different SHAPE from the red flamme pill.
	// Anchored bottom-left so the pole base sits on the line. Style: global .finish-flag in app.css.
	function addFinishFlag(at: LngLat) {
		if (!map || !maplibre) return;
		const el = document.createElement('div');
		el.className = 'finish-flag';
		el.title = 'Finish';
		endpoints.push(
			new maplibre.Marker({ element: el, anchor: 'bottom-left' }).setLngLat(at).addTo(map)
		);
	}

	// Intermediate sprint = a green pin (the points-classification colour), distinct in shape from the
	// green START dot (a labelled pill, not a bare dot) and from the chequered FINISH flag. Carries the
	// km on its label (and hover title); a circuit sprint reads "Sprint" with no km — the GPX can't say
	// which lap is the official one. Style: global .sprint-pin below. Anchored bottom (tip on the line).
	function addSprint(s: ProfileSprint) {
		if (!map || !maplibre) return;
		const el = document.createElement('div');
		el.className = 'sprint-pin';
		el.title = s.viaCircuit
			? 'Intermediate sprint · finishing circuit'
			: s.km != null
				? `Intermediate sprint · km ${s.km}`
				: 'Intermediate sprint';
		const chev = document.createElement('span');
		chev.className = 'sprint-chev';
		chev.textContent = '»';
		const lbl = document.createElement('span');
		lbl.className = 'sprint-label';
		lbl.textContent = s.viaCircuit || s.km == null ? 'Sprint' : `${Math.round(s.km)} km`;
		el.append(chev, lbl);
		sprintMarkers.push(
			new maplibre.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lon, s.lat]).addTo(map)
		);
	}

	// Render (or re-render) the current track onto a ready map. Runs on first load AND on
	// client-side nav to another stage (the component instance is reused, only props change).
	function renderTrack(t: LngLat[]) {
		if (!map || t.length < 2) return;
		cancelAnimationFrame(raf);
		for (const m of endpoints) m.remove();
		endpoints = [];
		for (const m of sprintMarkers) m.remove();
		sprintMarkers = [];
		map.setPaintProperty('route-line', 'line-color', resolveColor());
		map.fitBounds(trackBounds(t), { padding: 44, animate: false });
		addEndpoint(t[0], '#1a8f3c', 'Start');
		addFinishFlag(t[t.length - 1]);
		for (const s of sprints) addSprint(s);
		// Expose the rendered route's start coord — lets tests confirm the map tracks nav.
		if (container) container.dataset.routeStart = `${t[0][0].toFixed(3)},${t[0][1].toFixed(3)}`;
		const src = map.getSource('route') as GeoJSONSource | undefined;
		if (prefersReducedMotion()) {
			src?.setData(trackToGeoJSON(t));
		} else {
			animateDraw(t);
		}
	}

	// Re-render whenever the track (or sprint set) changes, or the map first becomes ready.
	$effect(() => {
		const t = track;
		void sprints; // re-run if the sprint markers change for the current stage
		if (status !== 'ready') return;
		renderTrack(t);
	});

	function animateDraw(t: LngLat[]) {
		const start = performance.now();
		const step = (now: number) => {
			if (!map) return;
			const p = Math.min(1, (now - start) / DRAW_MS);
			const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
			const src = map.getSource('route') as GeoJSONSource | undefined;
			src?.setData(trackToGeoJSON(trackUpToFraction(t, eased)));
			if (p < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
	}

	// Scrub → map marker sync. Cheap; updates the marker as the profile is scrubbed.
	$effect(() => {
		const f = markerFraction;
		if (status !== 'ready' || !map || !maplibre) return;
		if (f == null) {
			marker?.remove();
			marker = null;
			return;
		}
		const at = coordAtFraction(track, f);
		if (!marker) {
			const el = document.createElement('div');
			el.className = 'route-scrub';
			marker = new maplibre.Marker({ element: el }).setLngLat(at).addTo(map);
		} else {
			marker.setLngLat(at);
		}
	});

	onDestroy(() => {
		// onDestroy also fires during SSR — guard the browser-only teardown.
		if (!browser) return;
		cancelAnimationFrame(raf);
		observer?.disconnect();
		marker?.remove();
		for (const m of endpoints) m.remove();
		for (const m of sprintMarkers) m.remove();
		endpoints = [];
		sprintMarkers = [];
		map?.remove();
		map = null;
	});
</script>

<div class="map-wrap" class:framed>
	<div
		bind:this={container}
		class="map"
		role="img"
		aria-label="Route map for {label}"
	></div>
	{#if status === 'loading' || status === 'idle'}
		<div class="map-state mono" aria-hidden="true">Loading map…</div>
	{:else if status === 'error'}
		<div class="map-state mono">Map unavailable — route track shown on the profile above.</div>
	{/if}
</div>

<style>
	.map-wrap {
		position: relative;
		/* Sized to share a laptop viewport with the profile below; fitBounds frames the
		   route regardless of aspect, so a shorter frame doesn't crop awkwardly. */
		height: clamp(240px, 40vh, 360px);
		overflow: hidden;
		background: var(--ink-2);
	}
	/* Standalone use draws its own frame; embedded in the stage-anatomy unit it doesn't. */
	.map-wrap.framed {
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.map {
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
	/* MapLibre injects its own elements; style our custom markers globally. */
	:global(.route-endpoint) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	:global(.route-scrub) {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--jaune);
		border: 2px solid var(--ink);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--jaune) 45%, transparent);
	}
	/* Intermediate-sprint pin: a green (points-classification) pill with a chevron + km label, with a
	   small downward pointer so it reads as marking a POINT on the route. Distinct from the green start
	   DOT and the chequered finish flag. White text + casing keep it legible on tiles, dark or light. */
	:global(.sprint-pin) {
		/* NB: MapLibre owns this element's transform (positioning) — don't set transform here.
		   anchor:'bottom' puts the pill's bottom on the line; the ::after pointer dips to it. */
		position: relative;
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 2px 7px 2px 5px;
		background: #1f9e4b;
		color: #fff;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		border-radius: 999px;
		border: 1.5px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
		cursor: default;
	}
	:global(.sprint-pin)::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -7px;
		margin-left: -4px;
		border: 4px solid transparent;
		border-top-color: #1f9e4b;
	}
	:global(.sprint-pin .sprint-chev) {
		font-size: 11px;
		font-weight: 700;
		opacity: 0.9;
	}
	:global(.maplibregl-ctrl-attrib) {
		font-size: 10px;
	}
	/* Scale bar: muted to match the theme, no heavy box. A thin ruler line + small label that
	   sits quietly in the corner over tiles, dark or light — informative, never attention-grabbing. */
	:global(.maplibregl-ctrl-scale) {
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
</style>
