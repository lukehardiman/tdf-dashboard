import { describe, it, expect } from 'vitest';

// End-to-end regression: the climb extents in the BUILT profile JSON must keep matching the
// official ASO figures the hybrid was signed off against. This guards the whole pipeline
// (parse → resolve → build) so a future change can't silently regress the famous climbs.
// Mirror of scripts/validate-climbs.ts, runnable in CI off the committed JSON.

type Climb = {
	name: string;
	category: number | 'hc';
	mode: string;
	lengthKm: number;
	avgGradient: number;
	elevationGainM: number;
};

const modules = import.meta.glob<{ default: { climbs: Climb[] } }>('./profiles/stage-*.json', {
	eager: true
});
const all: Climb[] = Object.values(modules).flatMap((m) => m.default.climbs);
const find = (name: string) => all.find((c) => c.name === name)!;

// ASO references (letour.fr): [length km, avg gradient %].
const ASO: Record<string, [number, number]> = {
	'Col de la Croix de Fer': [24, 5.2],
	'Grand Ballon': [21.5, 4.8],
	'Col du Galibier': [17.7, 6.9],
	'Col du Télégraphe': [11.9, 7.1],
	'Col de Sarenne': [12.8, 7.3],
	"Ballon d'Alsace": [8.9, 6.9],
	'Col du Haag': [11.2, 7.3]
};

describe('climbs regression: hybrid extents match ASO (from built JSON)', () => {
	for (const [name, [len, grad]] of Object.entries(ASO)) {
		it(`${name} within ±0.3km / ±0.2%`, () => {
			const c = find(name);
			expect(c, `${name} present`).toBeTruthy();
			expect(Math.abs(c.lengthKm - len), `length ${c.lengthKm} vs ${len}`).toBeLessThanOrEqual(0.3);
			expect(Math.abs(c.avgGradient - grad), `grad ${c.avgGradient} vs ${grad}`).toBeLessThanOrEqual(0.2);
		});
	}

	it('the two fixed climbs took the expected modes', () => {
		expect(find('Col de la Croix de Fer').mode).toBe('chain'); // misplaced komstart
		expect(find('Grand Ballon').mode).toBe('walk-back'); // missing komstart
	});

	it('the clean majority stayed clean (nothing over-fixed)', () => {
		for (const name of ['Col du Galibier', 'Col du Télégraphe', 'Col de Sarenne', 'Col du Tourmalet', 'Col d\'Aspin'])
			expect(find(name).mode, name).toBe('clean');
	});

	it('every climb has a real, positive length (no "n/a") and an ascent', () => {
		const hcCat1 = all.filter((c) => c.category === 'hc' || c.category === 1);
		for (const c of hcCat1) {
			expect(c.lengthKm, c.name).toBeGreaterThan(0);
			expect(c.elevationGainM, c.name).toBeGreaterThan(0);
		}
	});
});
