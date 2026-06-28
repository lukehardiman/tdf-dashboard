import type { EventMeta, Stage } from './types';

// Tour de France 2026 — 113th edition, 4–26 July 2026.
// Route data verified against letour.fr / cyclingstage.com (Oct 2025 official announcement).
// Editorial summaries and town notes written for this dashboard.
// Elevation gain (elevationGainM) = official letour.fr D+ per stage (verified Jun 2026).
// Climbs derived from VeloViewer route GPX waypoints at build time (see scripts/build-profiles.ts).

const stages: Stage[] = [
	{
		n: 1,
		date: '2026-07-04',
		type: 'ttt',
		start: { name: 'Barcelona', note: 'The Grand Départ opens on the Barcelona seafront, past the Sagrada Família, before climbing to Montjuïc.' },
		finish: { name: 'Barcelona' },
		distanceKm: 19.6,
		elevationGainM: 200,
		summary: 'The first opening team time trial since 1971 — but each rider is timed individually across the line, scrambling the usual TTT maths. A flat run along the coast gives way to a hilly Montjuïc finale.',
		climbs: []
	},
	{
		n: 2,
		date: '2026-07-05',
		type: 'hills',
		start: { name: 'Tarragona', note: 'A Roman city with a UNESCO-listed amphitheatre, on the Costa Daurada south of Barcelona.' },
		finish: { name: 'Barcelona', note: 'Three ascents of the Montjuïc castle climb decide the day above the city.' },
		distanceKm: 168.5,
		elevationGainM: 2500,
		summary: 'Almost all of the 2,500m of climbing comes in the back half, on a finishing circuit around Montjuïc — a short, sharp wall climbed three times. A puncheur’s stage dressed as a sprint.',
		climbs: [],
		summitFinish: false
	},
	{
		n: 3,
		date: '2026-07-06',
		type: 'mountains',
		start: { name: 'Granollers', note: 'Home to the Circuit de Barcelona-Catalunya F1 track; the start rolls out from the 16th-century Porxada market hall.' },
		finish: { name: 'Les Angles', note: 'A Pyrenean ski resort at 1,600m in the Catalan Pyrenees, just across the border into France.', elevation: 1600 },
		distanceKm: 195.9,
		elevationGainM: 3850,
		summary: 'The Tour crosses the Pyrenees onto French soil on day three — far earlier than tradition dictates. 3,850m of climbing and an uphill finish will already pull time gaps between the favourites.',
		climbs: [],
		summitFinish: true
	},
	{
		n: 4,
		date: '2026-07-07',
		type: 'hills',
		start: { name: 'Carcassonne', note: 'A walled medieval citadel, one of the most-visited monuments in France.' },
		finish: { name: 'Foix', note: 'An Ariège town beneath a three-towered château, long a Tour staging post.' },
		distanceKm: 181.9,
		elevationGainM: 2700,
		summary: 'Through the Pyrenean foothills with ~2,800m of climbing, but the final 35km runs mainly downhill — a profile that tempts the breakaway and complicates the sprinters’ teams.',
		climbs: []
	},
	{
		n: 5,
		date: '2026-07-08',
		type: 'flat',
		start: { name: 'Lannemezan', note: 'A plateau town on the edge of the high Pyrenees.' },
		finish: { name: 'Pau', note: 'The Tour’s most-visited host city after Paris — a gateway to the great Pyrenean cols.' },
		distanceKm: 158.3,
		elevationGainM: 1600,
		summary: 'A transitional day into Pau. Rolling rather than truly flat, but the fast men’s teams will back themselves to keep it together for a bunch sprint.',
		climbs: []
	},
	{
		n: 6,
		date: '2026-07-09',
		type: 'mountains',
		start: { name: 'Pau' },
		finish: { name: 'Gavarnie-Gèdre', note: 'A finish in the magnificent glacial cirque of Gavarnie, a UNESCO World Heritage site.', elevation: 1380 },
		distanceKm: 186.2,
		elevationGainM: 4100,
		summary: 'The first true mountain test. The Col d’Aspin and the mighty Tourmalet precede the haul to Gavarnie-Gèdre, in the shadow of its glacial cirque. A first summit finish for the climbers.',
		climbs: [
			{ name: 'Col d’Aspin', category: 1, summitKm: 120, lengthKm: 12, avgGradient: 6.5, summitElevation: 1490 },
			{ name: 'Col du Tourmalet', category: 'hc', summitKm: 155, lengthKm: 19, avgGradient: 7.4, summitElevation: 2115 }
		],
		summitFinish: true
	},
	{
		n: 7,
		date: '2026-07-10',
		type: 'flat',
		start: { name: 'Hagetmau', note: 'A Landes town on the Camino de Santiago — its first ever Tour appearance.' },
		finish: { name: 'Bordeaux', note: 'A wine capital and a historic sprinters’ finish on the Place des Quinconces.' },
		distanceKm: 175.1,
		elevationGainM: 850,
		summary: 'A scenic trek through the Landes forests with the odds stacked firmly against the break. Bordeaux has served up vintage bunch sprints for decades; expect another.',
		climbs: []
	},
	{
		n: 8,
		date: '2026-07-11',
		type: 'flat',
		start: { name: 'Périgueux', note: 'Capital of the Dordogne, ringed by Roman and medieval remains.' },
		finish: { name: 'Bergerac', note: 'A Dordogne wine town on the river, gateway to the Lascaux country.' },
		distanceKm: 180.4,
		elevationGainM: 1150,
		summary: 'Another for the sprinters before the race turns toward the Massif Central. Momentum and lead-out trains matter on back-to-back flat days.',
		climbs: []
	},
	{
		n: 9,
		date: '2026-07-12',
		type: 'hills',
		start: { name: 'Malemort', note: 'A Corrèze town on the edge of Brive-la-Gaillarde.' },
		finish: { name: 'Ussel', note: 'A high town on the Millevaches plateau, gateway to the Massif Central.', elevation: 630 },
		distanceKm: 185.5,
		elevationGainM: 3300,
		summary: 'The Massif Central rears up. A lumpy, attritional day with no summit finish but no respite either — ideal terrain for a breakaway to go the distance.',
		climbs: []
	},
	{
		n: 10,
		date: '2026-07-14',
		type: 'hills',
		start: { name: 'Aurillac', note: 'A Cantal town under the extinct volcanoes of the Auvergne; Bastille Day start.' },
		finish: { name: 'Le Lioran', note: 'A Cantal ski station returning to the Tour, set among ancient volcanic peaks.', elevation: 1230 },
		distanceKm: 166.6,
		elevationGainM: 3800,
		summary: 'Bastille Day in the Auvergne volcanoes — always a stage the French want to win. Relentlessly up and down through the Cantal to the Le Lioran ski station.',
		climbs: [],
		summitFinish: true
	},
	{
		n: 11,
		date: '2026-07-15',
		type: 'flat',
		start: { name: 'Vichy', note: 'A belle-époque spa town, famous for its thermal springs.' },
		finish: { name: 'Nevers', note: 'A Loire-side town on the edge of Burgundy.' },
		distanceKm: 161.3,
		elevationGainM: 1400,
		summary: 'A clear sprint opportunity as the race leaves the mountains behind for a spell. The fast men’s last easy chance before the Jura and Alps.',
		climbs: []
	},
	{
		n: 12,
		date: '2026-07-16',
		type: 'flat',
		start: { name: 'Magny-Cours', note: 'Home of the French Grand Prix motor-racing circuit.' },
		finish: { name: 'Chalon-sur-Saône', note: 'A Burgundian river port, birthplace of photography pioneer Nicéphore Niépce.' },
		distanceKm: 179.1,
		elevationGainM: 1800,
		summary: 'Flat Burgundy roads and another likely bunch sprint. The calm before the Vosges and the brutal final week.',
		climbs: []
	},
	{
		n: 13,
		date: '2026-07-17',
		type: 'hills',
		start: { name: 'Dole', note: 'A Jura town of canals and old stone, birthplace of Louis Pasteur.' },
		finish: { name: 'Belfort', note: 'A fortress city beneath its great pink-sandstone lion, between Jura and Vosges.' },
		distanceKm: 205.8,
		elevationGainM: 2400,
		summary: 'The longest stage of the race. A rolling Jura-to-Vosges day that softens legs ahead of the high mountains and rewards a strong, stubborn breakaway.',
		climbs: []
	},
	{
		n: 14,
		date: '2026-07-18',
		type: 'mountains',
		start: { name: 'Mulhouse', note: 'An industrial Alsace city, home to the national automobile and rail museums.' },
		finish: { name: 'Le Markstein', note: 'A Vosges pass and ski area that has hosted decisive Tour and Tour Femmes finales.', elevation: 1200 },
		distanceKm: 155.3,
		elevationGainM: 3800,
		summary: 'A compact, savage Vosges stage stacked with short steep climbs into Le Markstein. The kind of relentless profile where the GC can crack open unexpectedly.',
		climbs: [],
		summitFinish: true
	},
	{
		n: 15,
		date: '2026-07-19',
		type: 'mountains',
		start: { name: 'Champagnole', note: 'A Jura town surrounded by forests and waterfalls.' },
		finish: { name: 'Plateau de Solaison', note: 'A first-ever Tour finish — a steep limestone plateau above Lake Geneva.', elevation: 1500 },
		distanceKm: 183.9,
		elevationGainM: 3950,
		summary: 'Into the pre-Alps for a debut summit finish at Plateau de Solaison, a steep and little-known wall above Lake Geneva. The last test before the second rest day.',
		climbs: [],
		summitFinish: true
	},
	{
		n: 16,
		date: '2026-07-21',
		type: 'itt',
		start: { name: 'Évian-les-Bains', note: 'The spa town on the south shore of Lake Geneva, famous for its water.' },
		finish: { name: 'Thonon-les-Bains', note: 'A lakeside resort and the gateway to the Chablais Alps.' },
		distanceKm: 26.1,
		elevationGainM: 500,
		summary: 'The race’s only individual time trial — 26km along Lake Geneva. The GC contenders’ last chance to gain time against the clock before the Alps decide everything.',
		climbs: []
	},
	{
		n: 17,
		date: '2026-07-22',
		type: 'flat',
		start: { name: 'Chambéry', note: 'A Savoyard capital under the Bauges and Chartreuse massifs.' },
		finish: { name: 'Voiron', note: 'A Chartreuse town famous for its green liqueur.' },
		distanceKm: 174.7,
		elevationGainM: 2200,
		summary: 'A deceptive transition day — nominally flat, but wedged between the time trial and the Alpine climax. A breakaway’s best remaining chance.',
		climbs: []
	},
	{
		n: 18,
		date: '2026-07-23',
		type: 'mountains',
		start: { name: 'Voiron' },
		finish: { name: 'Orcières-Merlette', note: 'A high Alpine ski resort returning to the Tour, scene of famous duels.', elevation: 1825 },
		distanceKm: 185.2,
		elevationGainM: 3900,
		summary: 'The Alps begin in earnest with a long haul to the Orcières-Merlette ski station. The first of three consecutive summit-finish days that will decide the Tour.',
		climbs: [],
		summitFinish: true
	},
	{
		n: 19,
		date: '2026-07-24',
		type: 'mountains',
		start: { name: 'Gap', note: 'An Alpine crossroads town, a regular Tour host in the Hautes-Alpes.' },
		finish: { name: 'Alpe d’Huez', note: 'The 21 hairpins — cycling’s most mythologised climb, here from the traditional side.', elevation: 1850 },
		distanceKm: 127.9,
		elevationGainM: 3500,
		summary: 'A short, explosive stage to the legendary 21 bends of Alpe d’Huez. The first of back-to-back finishes on the Alpe — a format never seen before in Tour history.',
		climbs: [
			{ name: 'Alpe d’Huez', category: 'hc', summitKm: 127.9, lengthKm: 13.8, avgGradient: 8.1, summitElevation: 1850 }
		],
		summitFinish: true
	},
	{
		n: 20,
		date: '2026-07-25',
		type: 'mountains',
		start: { name: 'Bourg d’Oisans', note: 'The valley town at the foot of Alpe d’Huez.' },
		finish: { name: 'Alpe d’Huez', note: 'A second ascent in two days — this time after crossing the Croix de Fer and Galibier.', elevation: 1850 },
		distanceKm: 170.9,
		elevationGainM: 5450,
		summary: 'The queen stage. ~5,600m of climbing over the Croix de Fer, Télégraphe and Galibier — the Tour’s highest point at 2,631m — before a second summit finish on Alpe d’Huez. The day the Tour is won.',
		climbs: [
			{ name: 'Col de la Croix de Fer', category: 'hc', summitKm: 70, lengthKm: 24, avgGradient: 5.2, summitElevation: 2067 },
			{ name: 'Col du Télégraphe', category: 1, summitKm: 110, lengthKm: 12, avgGradient: 7.1, summitElevation: 1566 },
			{ name: 'Col du Galibier', category: 'hc', summitKm: 130, lengthKm: 17, avgGradient: 6.8, summitElevation: 2631 },
			{ name: 'Alpe d’Huez', category: 'hc', summitKm: 170.9, lengthKm: 13.8, avgGradient: 8.1, summitElevation: 1850 }
		],
		summitFinish: true
	},
	{
		n: 21,
		date: '2026-07-26',
		type: 'flat',
		start: { name: 'Thoiry', note: 'A town in the Yvelines, west of Paris.' },
		finish: { name: 'Paris', note: 'The Champs-Élysées finale — now with a Montmartre climb borrowed from the 2024 Olympics.' },
		distanceKm: 133.0,
		elevationGainM: 1000,
		summary: 'The procession to Paris, with a twist: the Rue Lepic ascent of Montmartre, climbed three times before the traditional Champs-Élysées sprint. Ceremony, then chaos.',
		climbs: []
	}
];

export const tdf2026: EventMeta = {
	slug: 'tour-de-france-2026',
	name: 'Tour de France 2026',
	year: 2026,
	startDate: '2026-07-04',
	endDate: '2026-07-26',
	totalDistanceKm: 3333,
	totalElevationM: 53950,
	// Official 2026 startlist (letour.fr Teams page + multiple startlist sources): 23 teams —
	// 18 WorldTeams + 5 ProTeams — at 8 riders each = 184. A larger peloton than recent editions.
	teamCount: 23,
	riderCount: 184,
	restDays: [
		{ date: '2026-07-13', location: 'Cantal' },
		{ date: '2026-07-20', location: 'Haute-Savoie' }
	],
	stages
};
