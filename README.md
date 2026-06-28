# TdF Stage Dashboard

A lightweight, slick, SEO-friendly stage-by-stage dashboard for Grand Tours —
built to fill the event-coverage niche steephill.tv left behind. v1 covers the
Tour de France 2026.

## Stack
- **SvelteKit** + **adapter-static** — fully prerendered to static HTML, no server
  in the hot path. Deploy the `build/` dir to any static host / CDN.
- No Astro, no Next, no Vuetify. Svelte chosen for minimal client payload and
  built-in transition primitives (UX-at-scale is the priority).
- **View Transitions API** for the card → stage-page morph.
- Profile rendering is **framework-free** (`src/lib/render/profile.ts`) so it
  ports across shells if this ever moves.

## Architecture
- `/` → redirects to the current event (single-event mode). Becomes a segmented
  event index (active/future/past) later — registry already multi-event.
- `/[event]/` → index dashboard: 21 stage cards, typology colour-coding,
  auto-scroll to today, live state.
- `/[event]/stage-[n]/` → full stage page: large interactive profile, route map
  (placeholder), climbs, finish analysis, town detail, Intervals hook, prev/next.
- Event slug in routes from day one → multi-event (`/giro-2027/`) and a future
  move to a path (`www.intervals.icu/tour-de-france-2026/`) are deploy changes,
  not rewrites.

## Data
- `src/lib/data/tdf2026.ts` — verified 2026 route (towns, dates, distances, types)
  + hand-written editorial summaries/town notes + seeded climb data for key stages.
- `src/lib/data/types.ts` — event-agnostic data model.
- `src/lib/index.ts` — event registry + current-event pointer.

## KNOWN STUBS (the handoff work)
1. **Elevation profiles are SYNTHESISED** from stage metadata, not real GPX.
   `synthesiseSeries()` in `src/lib/render/profile.ts` is the placeholder.
   The renderer (`buildGeometry`) consumes a real `{km, ele}[]` series unchanged —
   swap the source, the visual stays.
2. **Route map is a placeholder frame** on the stage page — MapLibre GL + GPX
   track to be wired in.
3. **Climb data** is complete only for marquee stages (6, 19, 20). Remaining
   stages need climbs from the ASO roadbook / GPX extraction.
4. **Where-to-watch, timetable, live results/standings** — specced, not built.

## Dev
```
npm install
npm run dev      # dev server
npm run build    # prerender to build/
npm run preview  # serve the static build
```
Preview live behaviour: `/[event]/?date=2026-07-16` overrides "today".
