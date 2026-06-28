# CLAUDE.md — TdF Stage Dashboard

Standing brief for working in this repo. Read this every session before changing code.
Also read README.md (project overview) and, for the data model, src/lib/data/types.ts.

## What this is
A lightweight, slick, SEO-friendly stage-by-stage dashboard for Grand Tours —
filling the event-coverage niche steephill.tv left behind. v1 = Tour de France 2026.
An Intervals.icu project. Deploys as a prerendered static site to a subdomain
(likely tour.intervals.icu).

## Stack — LOCKED. Do not change without explicit approval.
- SvelteKit + @sveltejs/adapter-static, fully prerendered. No server in the hot path.
- Svelte 5 (runes mode). No other UI framework. No Vuetify. No Tailwind.
- View Transitions API for the card → stage-page morph.
- MapLibre GL for route maps (lazy-loaded).
- Plain CSS with design tokens in src/app.css. Keep it that way.
If you think the stack needs to change, STOP and ask first with your reasoning.

## Priorities, in order
1. UX feel + perceived performance. This may get viral spike traffic; a snappy
   first impression drives shares. Small client payload is a feature.
2. Correctness of race data. Wrong climbs/distances erode trust instantly.
3. SEO. Per-stage pages must be genuinely distinct, substantive, server-rendered.

## Engineering standards — required, not optional
- TEST AS YOU BUILD. Every new pure function ships with unit tests in the same PR.
  - Vitest for unit logic. Targets: GPX parsing, src/lib/render/profile.ts geometry,
    src/lib/state.ts date/live-state logic, climb-derivation. These are pure —
    test them in isolation, no browser.
  - Playwright for E2E: routing, home→event redirect, stage pages render, prev/next,
    View Transitions don't crash, reduced-motion respected.
  - Run the full suite before declaring any item done. Don't mark work complete
    with failing or skipped tests.
- DRY. The data model is event-agnostic on purpose. Don't hardcode "Tour de France"
  or 2026 in components — derive from the event object. New events should need only
  a data file + registry entry, no component changes.
- Keep the profile renderer (src/lib/render/profile.ts) FRAMEWORK-FREE. It's the
  portable core and the most testable unit. No Svelte imports in it.
- Build-time over runtime. Parse GPX, derive climbs, generate OG images at build —
  not in the browser. Propose the approach before adding a prebuild step.
- TypeScript strict. No `any` without a comment justifying it.
- Accessibility floor: visible focus, keyboard nav, prefers-reduced-motion,
  semantic HTML, alt/aria on the SVG profiles. Already scaffolded — maintain it.

## Content rule — strict
Editorial summaries and town notes are hand-written and must stay accurate.
DO NOT auto-generate prose to fill gaps. DO NOT fabricate climb categories,
gradients, or distances. If data is missing, leave a clear TODO and ask.
No thin or duplicated content — domain quality risk is real for Intervals.

## Workflow
- Confirm `npm install && npm run build && npm run preview` is green before starting.
- Pause for review after each numbered task in a handoff — don't run ahead.
- Preview live behaviour with ?date=YYYY-MM-DD (overrides "today").
- Conventional commits. Small, reviewable changes over big drops.

## Known stubs (the work)
1. Elevation profiles are SYNTHESISED, not real GPX (synthesiseSeries in profile.ts).
2. Route map is a placeholder frame on the stage page.
3. Climb data complete only for marquee stages (6, 19, 20).
4. Where-to-watch, timetable, live results/standings: specced, not built.
