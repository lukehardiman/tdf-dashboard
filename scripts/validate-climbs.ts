// Regression guard: re-runs the HC + Cat-1 climb validation table FROM the built profile
// JSON (not the spike), proving the port preserved what the diagnosis proved. Re-run after
// any climb-pipeline change: `node scripts/validate-climbs.ts`. Known ASO references must
// stay within tolerance; the mode split must stay 17 clean / 1 chain / 1 walk-back for 2026.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '../src/lib/data/profiles');
const TOL_LEN = 0.3; // km
const TOL_GRAD = 0.2; // %

const ASO: Record<string, [number, number]> = {
	'Col de la Croix de Fer': [24, 5.2],
	'Grand Ballon': [21.5, 4.8],
	'Col du Galibier': [17.7, 6.9],
	'Col du Télégraphe': [11.9, 7.1],
	'Col de Sarenne': [12.8, 7.3],
	"Ballon d'Alsace": [8.9, 6.9],
	'Col du Haag': [11.2, 7.3]
};

type Climb = {
	name: string;
	category: number | 'hc';
	mode: string;
	lengthKm: number;
	avgGradient: number;
	elevationGainM: number;
};

const rows: { n: number; c: Climb }[] = [];
for (let n = 1; n <= 21; n++) {
	const f = JSON.parse(fs.readFileSync(path.join(DIR, `stage-${n}.json`), 'utf8'));
	for (const c of f.climbs as Climb[]) if (c.category === 'hc' || c.category === 1) rows.push({ n, c });
}

console.log('St | Cat | Climb                           | Mode      | Len    Grad   Asc   | ASO        | ΔLen  ΔGrad');
console.log('-'.repeat(104));
let fails = 0;
for (const { n, c } of rows) {
	const a = ASO[c.name];
	const cat = c.category === 'hc' ? 'HC' : 'C1';
	let asoc = '    —      ';
	let d = '';
	if (a) {
		const dl = +(c.lengthKm - a[0]).toFixed(1);
		const dg = +(c.avgGradient - a[1]).toFixed(1);
		const bad = Math.abs(dl) > TOL_LEN || Math.abs(dg) > TOL_GRAD;
		if (bad) fails++;
		asoc = `${String(a[0]).padStart(5)}/${a[1]}`;
		d = `${dl >= 0 ? '+' : ''}${dl}  ${dg >= 0 ? '+' : ''}${dg}${bad ? '  ❌' : ''}`;
	}
	console.log(
		`${String(n).padStart(2)} | ${cat}  | ${c.name.padEnd(30)} | ${c.mode.padEnd(9)} | ` +
			`${String(c.lengthKm).padStart(4)}km ${String(c.avgGradient).padStart(4)}% ↑${String(c.elevationGainM).padStart(4)}m | ${asoc.padEnd(10)} | ${d}`
	);
}

const modes = rows.reduce<Record<string, number>>((a, { c }) => ((a[c.mode] = (a[c.mode] || 0) + 1), a), {});
console.log('\nModes:', JSON.stringify(modes));
if (fails) {
	console.error(`\n❌ ${fails} climb(s) outside tolerance (±${TOL_LEN}km / ±${TOL_GRAD}%)`);
	process.exit(1);
}
console.log(`\n✅ All ${Object.keys(ASO).length} ASO-referenced climbs within ±${TOL_LEN}km / ±${TOL_GRAD}%`);
