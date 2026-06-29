# TdF Dashboard — Project Context

A stage-by-stage Grand Tour dashboard. v1 = Tour de France 2026. A self-contained mini-project
within the broader Intervals.icu engagement. Fast, SEO-friendly, Intervals-native conversion hook.
Fills the gap steephill.tv left. Differentiator: honest per-stage climb/terrain analysis + a
finish-zoom that adapts to stage type.

This doc is the persistent context for the project — read it to onboard a fresh session.
Keep it terse and current; it's a reference + decision log, not a narrative.

---

## STACK
- **SvelteKit + adapter-static**, fully prerendered. Svelte 5 runes. NO other UI framework.
- **MapLibre GL** for maps (lazy-loaded, OpenFreeMap tiles).
- Framework-free renderers (plain TS) for profiles, climb banding, sectors — not Svelte-coupled.
- View Transitions API for card→page morph.
- Vitest (unit) + Playwright (e2e). ~160+ unit tests, ~16 e2e.
- Deploys static to Vercel.

## REPO
- GitHub: `github.com/lukehardiman/tdf-dashboard`, branch `main`.
- Local: `~/Dev/tdf-dashboard/`.
- `CLAUDE.md` = standing brief for Claude Code (engineering standards). This file = project context.

## DEPLOYMENT
- **Vercel**, auto-deploys on push to `main`. Team: S2S (Hobby) — preview only, not prod subdomain yet.
- **Output Directory override = `build`** (set in Vercel project settings). adapter-static writes to
  `build/`; Vercel defaults to looking for `public/` — without the override the deploy fails with
  "No Output Directory named public". Keep adapter-static (NOT adapter-vercel) — it's a static site.
- Eventual home: a subdomain (likely `tour.intervals.icu`).

### ⚠️ DEPLOY GOTCHA — GPX absent on build server (critical, already bit us)
`gpx-src/` is gitignored (the data moat — see below), so it's ABSENT on Vercel's build server.
The `prebuild` runs `build-profiles.ts`. It MUST NOT clobber the committed profile JSON when no GPX
is present — it warns and exits, leaving committed data intact. The committed `profiles/*.json` ARE
the deploy artifact. If this guard is ever removed, deploys render broken synthesised data against a
broken scale (profiles overflow their boxes). Regenerate JSON locally with `npm run profiles` when
GPX changes; commit the JSON.

---

## ARCHITECTURE

### Data flow
Raw GPX (local only) → `build-profiles.ts` → committed per-stage JSON → site renders from JSON.
- Raw GPX: `gpx-src/*.gpx` — GITIGNORED, build-time input only, never served (team-sourced = moat).
  `gpx-src/source-manifest.json` IS committed (traceability, no sensitive data).
- Derived/committed: `src/lib/data/profiles/*.json` (per-stage), `previews.json`, `scale.json`,
  `summaries.json`. These are the deploy artifact — site builds without GPX present.
- Event/editorial data: `src/lib/data/tdf2026.ts` (route, hand-written stage summaries, official
  elevationGainM seeds, restDays, team/rider counts — 23 teams / 184 riders for 2026). `types.ts` =
  event-agnostic model (no hardcoded "Tour de France"/2026 in components — drop-in for future Tours).

### Key files
- Renderers (framework-free): `src/lib/render/` — `profile.ts`, `climbBanding.ts`, `curvature.ts`,
  `finish.ts` (archetype classifier), `ttSectors.ts`, `gpx.ts`, `route.ts`.
- Components: `StageAnatomy.svelte` (the merged unit — see below), `StageProfile.svelte`,
  `ClimbBandingDetail.svelte`, `FlatFinishDetail.svelte`, `TTCourseProfile.svelte`,
  `FinishZoom.svelte` (dispatcher), `StageCard.svelte`, `StageSelector.svelte`, `TypologyBar.svelte`,
  `TypologyKey.svelte`, `RouteMap.svelte`, `RestDay.svelte`.
- Routes: `/` → index (21 stage cards), `/[event]/stage-[n]/` → stage detail. Event-agnostic.

### StageAnatomy (the unified stage unit)
Keystats strip + map + elevation profile merged into ONE bordered/rounded unit (flush sections,
hairline dividers, no inner cards). Section labels = solid-surface pills sitting ON the map/profile.
Scrub state lives inside the unit (profile emits → map consumes). Reclaimed ~130px for co-visibility
(scrub profile + watch map dot in one viewport). Profile section clips its top edge so peaks don't
perforate the map above.

---

## GPX → CONTENT PIPELINE (how everything is derived)

### Terrain (profile shape)
GPX track points (lat/lon/ele, DEM-derived, ~clean) → profile series. Distance reconciles to ASO
0 to −1%. Headline elevation gain = official letour.fr D+ (hand-seeded in tdf2026.ts, verified);
profile shape = honest GPX integration (numbers agree, no dual display).

### Climbs (identification, category, length, ascent) — THE HARD-WON PART
GPX waypoints carry komstart/komend with names, categories, gradients → climb IDENTIFICATION,
category, name, position. That part scales (drop in GPX, climbs appear).

LENGTH/ASCENT use a **hybrid resolver**, because komstart is unreliable in two ways:
- **Clean komstart** (majority, ~17/19 HC+Cat1): trust it — already ASO-accurate. Don't disturb.
- **Misplaced komstart** (multi-segment chain, e.g. Croix de Fer — komstart near summit gave 5.1km
  vs real 24km): extend to the chain's FIRST komstart, gradient-guarded (accept merged avg ≥4%;
  rejects over-merges like Aspin @2.4%).
- **Missing komstart** (e.g. Grand Ballon — summit waypoint but no start): terrain WALK-BACK from
  summit along the track to the valley low point. Guard: walk through internal flats, stop at
  sustained re-ascent (120m inter-col barrier) so it can't run into the previous col's descent.
- **Ascent** = real GPX cumulative gain over the resolved extent (counts re-climbs after internal
  dips; NOT length×avg-gradient). Gradient = net rise / resolved length, uniform across all 3 modes.

Validated against official ASO figures (letour.fr per-climb): all HC+Cat1 match within ±0.2km/±0.1%.
A regression test locks the resolver outputs; guard thresholds (4%, 4.5%, 120m) are locked in tests.
PCS (procyclingstats) was evaluated as a climb-data source — REJECTED for 2026 (race not yet run,
data empty; revisit post-race as validation only). Walk-back + komstart-hybrid is the scalable answer.

### Y-axis scale (relief honesty)
Profiles use a SHARED elevation scale across all stages (not per-stage normalisation), so a flat
stage looks flat and a mountain stage towers — scannable at a glance on the listing. Computed at
build time → `scale.json` ({baseEleM, peakEleM}); auto-recalibrates for future Tours. Min-amplitude
floor so flat stages still show readable undulation (not a dead line). MAIN profile = shared scale
(compare stages). DECISIVE-ZONE / detail graphics = LOCAL scale (exaggerate one stage's shape to
read it). Different jobs: shared = comparison, local = analysis.

---

## FINISH-ZOOM / ARCHETYPE LOGIC (templating)

The page adapts its finish analysis to stage type WITHOUT per-stage authoring. `finish.ts` classifies
each stage from FINISH GEOMETRY (not typology label) into 5 archetypes. Thresholds explicit/tunable:
`SUMMIT_FINISH_KM=2`, `RUNIN_MAX_KM=15`, `PUNCHY_MIN_GRADIENT=3`. Order A→B→C→E→D.

| Archetype | Match | Treatment | Finish stat |
|-----------|-------|-----------|-------------|
| A Time trial | discipline ITT/TTT | whole-course view, demand-type sectors, no zoom | from closing sector (Uphill / Flat) |
| B Summit finish | climb summit ≤2km from line, Cat2+ | banded final climb (the hero) | Summit |
| C Climb + run-in | final Cat3+ climb, 2–15km out | banded climb + descent-grey run-in to finish | Climb + run-in |
| E Punchy | uphill kick last ~2km ≥3%, no Cat2+ at line | banded closing ramp | Uphill |
| D Sprint/flat | else (no decisive late climb) | final 5km, technical: flamme rouge, corners | Flat |

- Geometry drives classification; typology is corroboration only. (S20 Alpe-via-Sarenne correctly = C,
  not B — Sarenne tops 14km out then descends/kicks; the classifier beat the human "summit finish" flag.)
- **Finish keystat**: derived from THIS classifier (one source of truth — same logic as the
  decisive-zone), NOT a legacy summit/valley boolean. Labels terse (header already says "Finish"):
  Summit / Climb + run-in / Uphill / Flat. TTs derive from the CLOSING TT SECTOR (not the blunt 2km
  ramp) so the stat agrees with the sector strip shown directly below — S1 (Montjuïc) = Uphill,
  S16 = Flat. "Technical"/cornering stays OUT of the Finish stat (it's a whole-course property, already
  in the sector strip / corner markers) — the Finish vital is purely gradient/shape so it's comparable
  across all 21 stages.
- TT view (A): merged into ONE TTCourseProfile (was two stacked profiles) — local-scale exaggeration
  + scrub gradient/distance/altitude + demand-type sector strip. Sectors: Climb (red), Descent
  (curvy+downhill, emphasised), Corners (curvy+flat), Power (flat). Technical sectors are
  curvature-derived (curvature.ts, verified accurate ~80m resolution) — kept because curviness is
  invisible on an elevation profile (the genuine value-add). Corner markers use LEFT/RIGHT directional
  arrows (the standard infographic convention) — NOT up-arrow + L/R letter; pick one, consistently.
  Distance markers show distance-to-finish WITHOUT a minus prefix.
- Breakaway-hill stages (S4 C2 35km out, S13 C1 30km out) = D, NOT promoted. The late climb is shown
  DESCRIPTIVELY on the main profile (decisive-zone shading: "final climb · Cat1 · km125 · 30km to line"),
  never as a predicted "breakaway." (S4/S13 noted in code as long-range-breakaway D-variant candidates.)
- Heading/label strings (pane pills, type labels) in **Title Case** in source ("Time Trial Course",
  "Individual Time Trial", "Team Time Trial"), even where CSS uppercases them on render.

---

## CORE PRINCIPLES (these govern every decision)
1. **Descriptive, not predictive.** Describe terrain/geometry facts; NEVER predict race outcomes
   ("favours sprinters", "breakaway stage" = banned). Archetype labels describe where the line/climb
   is, not who wins. A deleted "Finish analysis" prose section violated this — gone.
2. **Diagnose before fix.** Find what's actually in the data before choosing a fix. (Caught: the
   uniform walk-back doesn't converge; PCS data is empty for 2026; the GPX-clobber deploy bug.)
3. **Derive-then-validate.** Derive from data, validate against authoritative references (ASO figures)
   before trusting at scale. Lock with regression tests.
4. **Verify what ships, not the prototype.** Bugs hide in the deployed/prod environment (the GPX
   clobber only appeared on Vercel; a "validation render" was claimed but not saved). Confirm the
   live artifact, not just localhost.
5. **Honest scale / honest data.** No faked relief (shared y-axis), no wrong climb lengths, no
   ambiguous stats (ascent ↑ always; summit altitude only on HC/Cat1).
6. **Scalable to future Tours.** Drop in GPX locally → regenerate JSON → commit → deploy. No
   per-stage authoring, no ASO screenshotting. Editorial summaries are the only hand-written content.

---

## OPEN / STRATEGIC (non-blocking)
- **"Ride this stage" conversion hook** (HIGHEST-VALUE open item): fan → Intervals user → Supporter.
  Needs David: does Intervals expose a route/GPX import via URL/API? Build proceeds on link-out
  regardless. Do NOT serve raw GPX; the Intervals integration is the value.
- Header pass (Playfair wordmark + Intervals crimson logo lockup) — done; confirm in-situ.
- Light/dark mode — toggle in masthead, both themes verified.
- Live preview is up on Vercel → ready to show David (the opening for the conversion-hook talk).
- cyclingstage.com has per-stage GPX (DEM, no climb metadata) — noted as future-Tour fallback geometry
  source IF VeloViewer ever lacks an event (would need full terrain-based climb detection then).
