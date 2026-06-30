// Accessor for the build-time-collected official stage times (scripts/fetch-stage-times.py
// writes src/lib/data/stage-times.json from procyclingstats). Mirrors the profiles accessor:
// a stage with no entry simply isn't in the map, and the caller omits the line rather than
// fabricating one. Start time is official (PCS); expectedFinish is an optional phase-2 override.

import type { StageTimes } from './types';
import raw from './stage-times.json';

const byStage = (raw as { stages?: Record<string, StageTimes> }).stages ?? {};

/** Official times for a stage, or null when none have been collected yet (→ omit the line). */
export function stageTimes(n: number): StageTimes | null {
	const t = byStage[String(n)];
	if (!t || !t.startTime) return null;
	return { startTime: t.startTime, tz: t.tz, expectedFinish: t.expectedFinish ?? null };
}
