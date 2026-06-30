#!/usr/bin/env python3
"""
Collect OFFICIAL stage start times from procyclingstats → src/lib/data/stage-times.json.

DIRECT-PARSE (library-free). We do NOT use the procyclingstats Stage parser: its
_find_header_list("Race information") block-finder is stale and returns None on the 2026 pages
(verified — the page is reachable and the data is present; only the library's locator is broken).
So we fetch the page ourselves with requests (which gets the real 200/~40KB page from a residential
IP) and read the info-box <li> rows directly. Bypasses the one broken part, nothing else.

WHY THIS RUNS LOCALLY (not in CI/build):
    PCS is Cloudflare-fronted; a datacenter/CI IP gets a 403 challenge, a residential IP gets the
    real page. So this is a LOCAL one-shot collector that commits a static artifact — same model as
    build-profiles against local-only gpx-src. The dashboard only ever reads the committed JSON.

WHAT WE READ:
    The "Race information" box has labelled rows. We take:
      • Start time  → official, with tz, e.g. "13:05 (13:05 CEST)"  → stored as "13:05" + "CEST"
      • Date, Departure, Arrival, Distance → used ONLY to cross-check PCS stage N == our stage N
        (catches numbering drift — the trap where a "stage 6" figure was really stage 5).
    PCS has NO expected-arrival TIME (Departure/Arrival are TOWNS), so we collect the START only.
    expectedFinish stays an optional phase-2 override backfilled by hand from letour.fr.

USAGE:
    python3 scripts/fetch-stage-times.py          # collect + cross-check + write + print table
    python3 scripts/fetch-stage-times.py --dry    # collect + print, do NOT write the file
"""

import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
    from selectolax.parser import HTMLParser
except ImportError:
    sys.exit("Missing deps. Run:  pip install requests selectolax   (both ship with procyclingstats)")

URL = "https://www.procyclingstats.com/race/tour-de-france/2026/stage-{n}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "lib" / "data" / "stage-times.json"
WANT_LABELS = ("Start time", "Date", "Departure", "Arrival", "Distance")

# PCS's 2026 "Start time" rows are bare HH:MM (no "(… CEST)" suffix), so there's no tz to parse.
# The whole 2026 Tour runs in France + Spain in July → uniformly CEST (UTC+2). Apply that as the
# documented race-local zone when PCS omits one. A future non-CEST event would set this differently.
RACE_TZ = "CEST"

# Our authored route, embedded for the cross-check (mirror of src/lib/data/tdf2026.ts).
# Update if the route changes. Towns matched loosely (substring, accent-insensitive).
EXPECTED = {
    1:  ("ttt",       "Barcelona",        "Barcelona",          19.6),
    2:  ("hills",     "Tarragona",        "Barcelona",          168.5),
    3:  ("mountains", "Granollers",       "Les Angles",         195.9),
    4:  ("hills",     "Carcassonne",      "Foix",               181.9),
    5:  ("flat",      "Lannemezan",       "Pau",                158.3),
    6:  ("mountains", "Pau",              "Gavarnie-Gedre",     186.2),
    7:  ("flat",      "Hagetmau",         "Bordeaux",           175.1),
    8:  ("flat",      "Perigueux",        "Bergerac",           180.4),
    9:  ("hills",     "Malemort",         "Ussel",              185.5),
    10: ("hills",     "Aurillac",         "Le Lioran",          166.6),
    11: ("flat",      "Vichy",            "Nevers",             161.3),
    12: ("flat",      "Magny-Cours",      "Chalon-sur-Saone",   179.1),
    13: ("hills",     "Dole",             "Belfort",            205.8),
    14: ("mountains", "Mulhouse",         "Le Markstein",       155.3),
    15: ("mountains", "Champagnole",      "Plateau de Solaison", 183.9),
    16: ("itt",       "Evian-les-Bains",  "Thonon-les-Bains",   26.1),
    17: ("flat",      "Chambery",         "Voiron",             174.7),
    18: ("mountains", "Voiron",           "Orcieres-Merlette",  185.2),
    19: ("mountains", "Gap",              "Alpe d'Huez",        127.9),
    20: ("mountains", "Bourg d'Oisans",   "Alpe d'Huez",        170.9),
    21: ("flat",      "Thoiry",           "Paris",              133.0),
}
TT_TYPES = {"ttt", "itt"}


def deaccent(s: str) -> str:
    table = str.maketrans("àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ’", "aaaeeeeiioouuucAAAEEEEIIOOUUUC'")
    return (s or "").translate(table)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", deaccent(s).lower()).strip()


def parse_info_box(html: str) -> dict:
    """Read the labelled info-box rows directly from <li> items — bypassing the library's broken
    'Race information' container lookup. Robust to BOTH renderings: separate label/value child
    nodes ("Start time:" / "13:05…") AND a single inline text node ("Start time: 13:05…"). Scans
    all <li>; only the info rows start with our labels, so unrelated lists are ignored."""
    tree = HTMLParser(html)
    info: dict = {}
    for li in tree.css("li"):
        text = re.sub(r"\s+", " ", li.text(separator=" ")).strip()
        for want in WANT_LABELS:
            if want in info:
                continue
            # \b after the label so "Arrival" doesn't match a nav item like "Arrivals board".
            m = re.match(rf"{re.escape(want)}\b\s*:?\s*(\S.*)$", text)
            if m:
                info[want] = m.group(1).strip()
    return info


def parse_start_time(raw: str):
    """'13:05 (13:05 CEST)' → ('13:05', 'CEST'). (None, None) if no HH:MM present."""
    hm = re.search(r"\b([0-2]?\d:[0-5]\d)\b", raw or "")
    tz = re.search(r"\b([A-Z]{2,5})\b", raw or "")
    return (hm.group(1) if hm else None), (tz.group(1) if tz else None)


def parse_distance(raw: str):
    m = re.search(r"([\d.]+)", raw or "")
    return float(m.group(1)) if m else None


def fetch(n: int):
    r = requests.get(URL.format(n=n), headers=HEADERS, timeout=25)
    return r.status_code, r.text


def collect():
    rows, out_stages, warnings = [], {}, []
    for n in range(1, 22):
        exp_type, exp_start, exp_finish, exp_dist = EXPECTED[n]
        try:
            status, body = fetch(n)
        except Exception as e:  # noqa: BLE001
            rows.append((n, "ERR", "", f"fetch {type(e).__name__}: {str(e)[:50]}"))
            warnings.append(f"stage {n}: fetch failed — {type(e).__name__}: {str(e)[:100]}")
            continue

        # A challenge page is small and non-200; the real page is 200 + tens of KB.
        if status != 200 or len(body) < 8000:
            rows.append((n, "ERR", "", f"HTTP {status}, {len(body)}B (challenge?)"))
            warnings.append(f"stage {n}: HTTP {status}, body {len(body)}B — looks blocked, not parsed.")
            continue

        info = parse_info_box(body)
        hhmm, tz = parse_start_time(info.get("Start time", ""))
        tz = tz or RACE_TZ  # PCS omits the zone on 2026 pages → apply the race-local constant.
        departure = info.get("Departure", "")
        arrival = info.get("Arrival", "")
        distance = parse_distance(info.get("Distance", ""))

        flags = []
        if exp_start and norm(exp_start) not in norm(departure):
            flags.append(f"start PCS='{departure}'≠ours='{exp_start}'")
        if exp_finish and norm(exp_finish) not in norm(arrival):
            flags.append(f"finish PCS='{arrival}'≠ours='{exp_finish}'")
        if distance and exp_dist and abs(distance - exp_dist) / exp_dist > 0.03:
            flags.append(f"dist PCS={distance}≠ours={exp_dist}")
        if not hhmm:
            flags.append(f"no start time in '{info.get('Start time', '')}'")
        for f in flags:
            warnings.append(f"stage {n}: {f}")

        note = "TT first-rider" if exp_type in TT_TYPES else ""
        rows.append((n, hhmm or "—", tz or "", (note + ("  ⚠ " + "; ".join(flags) if flags else "")).strip()))
        if hhmm:
            out_stages[str(n)] = {"startTime": hhmm, "tz": tz or "", "expectedFinish": None}
        time.sleep(0.4)  # be polite to PCS between requests
    return rows, out_stages, warnings


def main():
    dry = "--dry" in sys.argv
    rows, out_stages, warnings = collect()

    print("\nstage | start | tz   | town/date cross-check")
    print("------+-------+------+--------------------------------------------")
    for n, start, tz, note in rows:
        print(f"  {n:>2}  | {start:>5} | {tz:<4} | {note}")

    s6 = out_stages.get("6")
    print("\nVALIDATION — re-pinned known-good (our stage 6 = Pau → Gavarnie-Gèdre):")
    print(f"  stage 6 start = {s6['startTime'] + ' ' + s6['tz'] if s6 else 'NOT COLLECTED'}")
    for n in (1, 16):
        v = out_stages.get(str(n))
        print(f"  stage {n} (TT) start = {v['startTime'] + ' ' + v['tz'] if v else 'NOT COLLECTED'}  → 'First rider'")

    if warnings:
        print("\n⚠ WARNINGS (resolve before trusting):")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("\n✓ No cross-check warnings — towns/distances line up with our route.")

    collected = len(out_stages)
    print(f"\nCollected start times for {collected}/21 stages.")

    if dry:
        print("--dry: not writing the file.")
        return

    # NEVER clobber the committed artifact with an empty scrape (build-profiles' written===0 guard).
    if collected == 0:
        print("\n⚠ 0 stages collected — leaving stage-times.json untouched (not overwriting with empty).")
        return

    payload = {
        "_meta": {
            "source": "procyclingstats — 'Start time' info-box row (official). Direct-parsed locally; see scripts/fetch-stage-times.py.",
            "posture": "INTERIM, PCS-sourced (stands in for ASO official). Swap to the authoritative ASO/letour feed when that access lands.",
            "timezone": "Stored as the race-local label PCS publishes (e.g. CEST). Per-viewer browser conversion is phase-2.",
            "expectedFinish": "Optional phase-2 override = official letour.fr expected arrival. null at launch → finish line omitted. We never compute a finish.",
            "ttNote": "TT stages (ttt/itt) store the first-rider start; they never get a finish.",
        },
        "stages": dict(sorted(out_stages.items(), key=lambda kv: int(kv[0]))),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    if collected < 21:
        print("NOTE: stages without a parsed start time were omitted (omit-don't-fabricate) — they show no time line.")


if __name__ == "__main__":
    main()
