import { describe, it, expect } from 'vitest';
import { stageState, focusStage, isRestDay, toISODate, stageOn, timeline, dayState, raceStatus, startLine } from './state';
import { tdf2026 } from './data/tdf2026';
import type { StageTimes } from './data/types';

describe('state: raceStatus', () => {
	it('is pre before the Grand Départ', () => {
		const s = raceStatus(tdf2026, new Date('2026-06-28T10:00:00'));
		expect(s.phase).toBe('pre');
		if (s.phase === 'pre') expect(s.startsISO).toBe(tdf2026.startDate);
	});

	it('reports the current stage on a stage day', () => {
		const s = raceStatus(tdf2026, new Date('2026-07-16T10:00:00')); // stage 12
		expect(s.phase).toBe('stage');
		if (s.phase === 'stage') {
			expect(s.stage.n).toBe(12);
			expect(s.dateISO).toBe('2026-07-16');
		}
	});

	it('reports a rest day within the race window', () => {
		const s = raceStatus(tdf2026, new Date('2026-07-13T10:00:00')); // first rest day
		expect(s.phase).toBe('rest');
		if (s.phase === 'rest') expect(s.location).toBe('Cantal');
	});

	it('is post after the final stage', () => {
		const s = raceStatus(tdf2026, new Date('2026-07-27T10:00:00'));
		expect(s.phase).toBe('post');
	});
});

describe('state: startLine', () => {
	const road: StageTimes = { startTime: '13:05', tz: 'CEST' };

	it('returns null when there are no times (omit, never fabricate)', () => {
		expect(startLine(null, 'flat')).toBeNull();
		expect(startLine(undefined, 'mountains')).toBeNull();
		expect(startLine({ startTime: '', tz: 'CEST' }, 'flat')).toBeNull();
	});

	it('leads a road stage with "Starts" and no finish when none supplied', () => {
		const line = startLine(road, 'flat');
		expect(line).toEqual({ lead: 'Starts', time: '13:05', tz: 'CEST', finish: null });
	});

	it('shows the official expected finish on a road stage when supplied', () => {
		const line = startLine({ ...road, expectedFinish: '16:11' }, 'hills');
		expect(line?.finish).toBe('16:11');
		expect(line?.lead).toBe('Starts');
	});

	it('leads a time trial with "First rider" (not a mass start)', () => {
		expect(startLine(road, 'itt')?.lead).toBe('First rider');
		expect(startLine(road, 'ttt')?.lead).toBe('First rider');
	});

	it('never projects a finish for a time trial, even if one is present', () => {
		const line = startLine({ ...road, expectedFinish: '17:20' }, 'itt');
		expect(line?.finish).toBeNull();
	});
});

describe('state: stageState', () => {
	it('marks the stage on the current date as today', () => {
		const now = new Date('2026-07-16T10:00:00'); // stage 12
		expect(stageState(tdf2026.stages[11], now)).toBe('today');
	});

	it('marks earlier stages as past and later as upcoming', () => {
		const now = new Date('2026-07-16T10:00:00');
		expect(stageState(tdf2026.stages[0], now)).toBe('past');
		expect(stageState(tdf2026.stages[20], now)).toBe('upcoming');
	});
});

describe('state: focusStage', () => {
	it('returns today when racing', () => {
		const now = new Date('2026-07-06T10:00:00'); // stage 3
		expect(focusStage(tdf2026, now).n).toBe(3);
	});

	it('returns the next upcoming stage before the race starts', () => {
		const now = new Date('2026-07-01T10:00:00');
		expect(focusStage(tdf2026, now).n).toBe(1);
	});

	it('returns the next stage on a rest day', () => {
		const now = new Date('2026-07-13T10:00:00'); // rest day; next is stage 10
		expect(focusStage(tdf2026, now).n).toBe(10);
	});

	it('returns the final stage after the race ends', () => {
		const now = new Date('2026-08-01T10:00:00');
		expect(focusStage(tdf2026, now).n).toBe(21);
	});
});

describe('state: rest days & stageOn', () => {
	it('detects rest days', () => {
		expect(isRestDay(tdf2026, new Date('2026-07-13T10:00:00'))).toBe(true);
		expect(isRestDay(tdf2026, new Date('2026-07-14T10:00:00'))).toBe(false);
	});

	it('returns null on a rest day from stageOn', () => {
		expect(stageOn(tdf2026, new Date('2026-07-13T10:00:00'))).toBeNull();
	});
});

describe('state: timeline', () => {
	const items = timeline(tdf2026);

	it('contains all stages plus the rest days', () => {
		expect(items.filter((i) => i.kind === 'stage')).toHaveLength(21);
		expect(items.filter((i) => i.kind === 'rest')).toHaveLength(2);
	});

	it('is in chronological order', () => {
		for (let i = 1; i < items.length; i++) {
			expect(items[i].date >= items[i - 1].date).toBe(true);
		}
	});

	it('places rest days between the correct stages', () => {
		const idx = (pred: (i: (typeof items)[number]) => boolean) => items.findIndex(pred);
		const rest1 = idx((i) => i.kind === 'rest' && i.date === '2026-07-13');
		const s9 = idx((i) => i.kind === 'stage' && i.stage.n === 9);
		const s10 = idx((i) => i.kind === 'stage' && i.stage.n === 10);
		expect(s9).toBeLessThan(rest1);
		expect(rest1).toBeLessThan(s10);

		const rest2 = idx((i) => i.kind === 'rest' && i.date === '2026-07-20');
		const s15 = idx((i) => i.kind === 'stage' && i.stage.n === 15);
		const s16 = idx((i) => i.kind === 'stage' && i.stage.n === 16);
		expect(s15).toBeLessThan(rest2);
		expect(rest2).toBeLessThan(s16);
	});
});

describe('state: dayState', () => {
	it('marks a rest day as today on its date', () => {
		expect(dayState('2026-07-13', new Date('2026-07-13T10:00:00'))).toBe('today');
		expect(dayState('2026-07-13', new Date('2026-07-14T10:00:00'))).toBe('past');
		expect(dayState('2026-07-20', new Date('2026-07-13T10:00:00'))).toBe('upcoming');
	});
});

describe('state: toISODate', () => {
	it('formats to YYYY-MM-DD', () => {
		expect(toISODate(new Date('2026-07-04T23:30:00Z'))).toBe('2026-07-04');
	});
});
