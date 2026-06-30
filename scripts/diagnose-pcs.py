#!/usr/bin/env python3
"""
One-shot diagnostic: WHY does fetch-stage-times.py fail? Separates the three causes so we
don't burn launch days on an unwinnable scrape. Run from YOUR machine (residential IP):

    python3 scripts/diagnose-pcs.py

It does a RAW requests.get (no library) + a library probe, then prints an A/B/C verdict:
  A) Cloudflare challenged even your IP   → access problem (body is a "Just a moment" page)
  B) Library selector stale / PCS markup changed → real populated page, but the info-box label moved
  C) Start-time data not published yet (pre-race) → real page, but no "Race information" / "Start time" row
Only A and B are fixable by us; C means we ship empty and backfill later (omit-safe behaviour already handles it).
"""

import sys
import requests

URL = "https://www.procyclingstats.com/race/tour-de-france/2026/stage-6"


def main():
    print(f"GET {URL}\n")
    try:
        r = requests.get(URL, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}, timeout=25)
    except Exception as e:  # noqa: BLE001
        print(f"NETWORK ERROR: {type(e).__name__}: {e}")
        print("\n→ Can't even reach PCS. Check connectivity / try again.")
        return

    body = r.text
    low = body.lower()
    # A REAL Cloudflare challenge is a small, non-200 interstitial titled "Just a moment". Dormant CF
    # markers (challenge-platform script tags etc.) appear on every CF-fronted site's NORMAL pages, so
    # they must NOT classify a 200/40KB content page as a challenge. Gate on status + size + title.
    is_challenge = r.status_code in (403, 503) and ("just a moment" in low or len(body) < 8000)
    has_raceinfo = "race information" in low
    has_starttime = "start time" in low
    has_departure = "departure" in low
    has_finishtown = "gavarnie" in low  # our stage-6 finish — confirms it's really the right page

    print(f"HTTP status         : {r.status_code}")
    print(f"body bytes          : {len(body)}")
    print(f"Cloudflare challenge: {is_challenge}")
    print(f"'race information'   present: {has_raceinfo}")
    print(f"'start time'         present: {has_starttime}")
    print(f"'departure'          present: {has_departure}")
    print(f"'gavarnie' (stage-6) present: {has_finishtown}")

    # Library probe: does it find the info-box block at all?
    lib_box = None
    try:
        from procyclingstats import Stage
        s = Stage("race/tour-de-france/2026/stage-6")
        try:
            lib_box = s._find_header_list("Race information")  # noqa: SLF001 — diagnostic probe
            print(f"library finds 'Race information' block: {lib_box is not None}")
        except Exception as e:  # noqa: BLE001
            print(f"library probe error : {type(e).__name__}: {str(e)[:80]}")
    except ImportError:
        print("library probe       : (procyclingstats not importable — skipped)")

    # If we got the real page, dump the Race-information box markup so the B-fix selector can be
    # written against the actual DOM (not guessed). Paste this block back if the verdict is B.
    if has_starttime and r.status_code == 200 and len(body) > 8000:
        print("\n----- RACE-INFORMATION BOX HTML (paste this back for the B fix) -----")
        try:
            from selectolax.parser import HTMLParser
            tree = HTMLParser(body)
            dumped = False
            for h in tree.css("h3, h2, .subdiv, b"):
                if h.text() and "race information" in h.text().lower():
                    block = h.parent.html if h.parent else h.html
                    print(block[:1500])
                    dumped = True
                    break
            if not dumped:
                # Fallback: a text window around the literal "Start time".
                i = low.find("start time")
                print(body[max(0, i - 200): i + 200])
        except Exception as e:  # noqa: BLE001
            print(f"(could not extract box: {type(e).__name__}: {e})")
            i = low.find("start time")
            print(body[max(0, i - 200): i + 200])

    print("\n----- VERDICT -----")
    # Order matters: real CONTENT wins over a dormant Cloudflare marker. A 200 + sizeable body that
    # contains the start time is the real page, full stop — classify by what's IN it, not by CF tags.
    if r.status_code == 200 and len(body) > 8000 and has_starttime:
        if lib_box is None:
            print("B) STALE SELECTOR — real page reached (HTTP 200, start time IS in the body), but the")
            print("   library can't locate the info box. Already handled: fetch-stage-times.py now")
            print("   direct-parses the <li> rows instead of using the library. Just run it.")
        else:
            print("OK — page reached AND the library found the box. Run fetch-stage-times.py.")
    elif is_challenge:
        print("A) CLOUDFLARE — challenge interstitial (403/503, small body), not the stage page.")
        print("   Fix path: a real browser session, or a Cloudflare-aware fetch. NOT the library's fault.")
    elif r.status_code == 200 and has_finishtown and not has_starttime:
        print("C) DATA NOT PUBLISHED — real stage page, but NO 'start time' row yet. DEFER: ship empty,")
        print("   backfill when PCS publishes / you hand-enter from letour / John's data feed lands.")
    else:
        print(f"UNCLEAR — HTTP {r.status_code}, {len(body)}B. Save the body and inspect it / the live page.")


if __name__ == "__main__":
    main()
