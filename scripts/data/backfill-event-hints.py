#!/usr/bin/env python3
"""
Backfill event-derived skill hints into support_hints.json.

Two modes:

1. **Local mode** (default): Reads support_card.json (which must have SupportSlug
   fields — added by the gametora scraper). Extracts skill hint names from event
   option text (e.g. "Masterful Gambit hint +1") and merges them into each card's
   SupportHints in support_hints.json.

2. **Remote mode** (--remote): Fetches each support card's page from GameTora,
   reads the event_skills array from __NEXT_DATA__.pageProps.itemData, resolves
   skill IDs to names via skills_all.json, and merges them into SupportHints.
   Also parses event option text for hints not covered by event_skills.

Usage:
    python scripts/data/backfill-event-hints.py [--dry-run]
    python scripts/data/backfill-event-hints.py --remote [--dry-run] [--delay 1.0]
"""
import argparse
import json
import random
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

# Fix Windows console encoding for Unicode characters like ○/◎
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
HINTS_PATH = ROOT / "public" / "assets" / "support_hints.json"
EVENTS_PATH = ROOT / "public" / "assets" / "support_card.json"
SKILLS_PATH = ROOT / "public" / "assets" / "skills_all.json"
BASE_URL = "https://gametora.com/umamusume/supports"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
}

HINT_RE = re.compile(r"(.+?)\s+hint\s+\+\d")


def load_skill_name_map() -> dict[str, str]:
    """Load skill ID → English name map from skills_all.json."""
    name_map = {}
    if not SKILLS_PATH.exists():
        print(f"WARN: {SKILLS_PATH} not found, skill names will be empty")
        return name_map
    with open(SKILLS_PATH, "r", encoding="utf-8") as f:
        skills = json.load(f)
    for item in skills:
        if not isinstance(item, dict):
            continue
        sid = item.get("id") or item.get("skill_id") or item.get("skillId")
        if sid is None:
            continue
        name = item.get("name_en") or item.get("enname") or item.get("name") or item.get("jpname") or ""
        if name:
            name_map[str(sid)] = name
    return name_map


def extract_hint_names_from_event_text(event: dict) -> list[str]:
    """Extract skill hint names from event option text (e.g. 'Masterful Gambit hint +1')."""
    names = []
    seen = set()
    for val in (event.get("EventOptions") or {}).values():
        for m in HINT_RE.finditer(str(val)):
            name = m.group(1).strip()
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def merge_hints(existing: list, event_hint_names: list[str]) -> tuple[list, int]:
    """Add event hint names to existing SupportHints. Returns (merged, count_added)."""
    known = set()
    for h in existing:
        if isinstance(h, dict):
            sid = h.get("SkillId", "")
            name = h.get("Name", "")
            if sid:
                known.add(str(sid))
            if name:
                known.add(name)
        elif isinstance(h, str):
            known.add(h)

    added = 0
    for name in event_hint_names:
        if name in known:
            continue
        existing.append({
            "SkillId": "",
            "Name": name,
            "HintLevel": None,
            "Source": "event",
        })
        known.add(name)
        added += 1
    return existing, added


# ---------------------------------------------------------------------------
# Local mode: use support_card.json with SupportSlug linkage
# ---------------------------------------------------------------------------

def backfill_local(cards: list, dry_run: bool) -> None:
    """Backfill event hints from local support_card.json (requires SupportSlug field)."""
    if not EVENTS_PATH.exists():
        print(f"ERROR: {EVENTS_PATH} not found")
        sys.exit(1)

    with open(EVENTS_PATH, "r", encoding="utf-8") as f:
        events = json.load(f)

    # Group events by SupportSlug
    events_by_slug: dict[str, list[dict]] = defaultdict(list)
    no_slug = 0
    for evt in events:
        slug = evt.get("SupportSlug", "")
        if slug:
            events_by_slug[slug].append(evt)
        else:
            no_slug += 1

    if not events_by_slug:
        print(f"ERROR: No events in {EVENTS_PATH} have a SupportSlug field.")
        print("Run the gametora scraper first to populate SupportSlug on events.")
        sys.exit(1)

    if no_slug:
        print(f"INFO: {no_slug} events without SupportSlug (skipped)")

    print(f"Found events for {len(events_by_slug)} support cards")

    # Build slug → card index
    slug_to_idx = {}
    for i, card in enumerate(cards):
        slug = card.get("SupportSlug", "")
        if slug:
            slug_to_idx[slug] = i

    total_added = 0
    cards_updated = 0

    for slug, card_events in sorted(events_by_slug.items()):
        idx = slug_to_idx.get(slug)
        if idx is None:
            print(f"  WARN: slug '{slug}' not found in support_hints.json")
            continue

        card = cards[idx]
        name = card.get("SupportName", slug)

        # Extract all hint names from event text
        all_hint_names = []
        seen = set()
        for evt in card_events:
            for h in extract_hint_names_from_event_text(evt):
                if h not in seen:
                    seen.add(h)
                    all_hint_names.append(h)

        if not all_hint_names:
            continue

        card["SupportHints"], added = merge_hints(card.get("SupportHints", []), all_hint_names)
        if added > 0:
            cards_updated += 1
            total_added += added
            print(f"  UPDATED {name} — +{added} event hints: {all_hint_names[:5]}")

    print(f"\nLocal backfill: {cards_updated} cards updated, {total_added} hints added")

    if not dry_run and total_added > 0:
        with open(HINTS_PATH, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)
        print(f"Written to {HINTS_PATH}")
    elif dry_run:
        print("(dry run — no changes written)")


# ---------------------------------------------------------------------------
# Remote mode: fetch from GameTora
# ---------------------------------------------------------------------------

def extract_next_data(html: str):
    """Extract __NEXT_DATA__ JSON from HTML."""
    m = re.search(r'<script\s+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def extract_event_skill_ids(next_data: dict) -> list[int]:
    """Get event_skills IDs from __NEXT_DATA__."""
    props = next_data.get("props", {}).get("pageProps", {})
    item = props.get("itemData", {})
    event_skills = item.get("event_skills", [])
    if isinstance(event_skills, list):
        return [s for s in event_skills if isinstance(s, int)]
    return []


def extract_event_hints_from_next_data(next_data: dict) -> list[str]:
    """Extract hint names from event option text in __NEXT_DATA__."""
    props = next_data.get("props", {}).get("pageProps", {})
    event_data = (
        props.get("eventData")
        or props.get("events")
        or props.get("event")
        or props.get("event_data")
        or props.get("itemData", {}).get("eventData")
        or props.get("itemData", {}).get("events")
        or {}
    )
    if not event_data:
        return []

    # Walk the event data tree looking for reward strings
    hints = []
    seen = set()

    def walk(obj):
        if isinstance(obj, str):
            for m in HINT_RE.finditer(obj):
                name = m.group(1).strip()
                if name and name not in seen:
                    seen.add(name)
                    hints.append(name)
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(event_data)
    return hints


def backfill_remote(cards: list, dry_run: bool, delay: float) -> None:
    """Backfill event hints by fetching from GameTora."""
    try:
        import requests
    except ImportError:
        print("pip install requests")
        sys.exit(1)

    skill_names = load_skill_name_map()
    print(f"Loaded {len(skill_names)} skill names")

    total = len(cards)
    total_added = 0
    cards_updated = 0
    errors = 0
    session = requests.Session()
    session.headers.update(HEADERS)

    for i, card in enumerate(cards, 1):
        slug = card.get("SupportSlug", "")
        card_id = card.get("SupportId", "")
        name = card.get("SupportName", slug)

        if not slug and not card_id:
            print(f"[{i}/{total}] SKIP {name} — no slug or id")
            continue

        url = f"{BASE_URL}/{slug}" if slug else f"{BASE_URL}/{card_id}"

        try:
            resp = session.get(url, timeout=15)
            if resp.status_code != 200:
                print(f"[{i}/{total}] ERROR {name} — HTTP {resp.status_code}")
                errors += 1
                continue

            next_data = extract_next_data(resp.text)
            if not next_data:
                print(f"[{i}/{total}] WARN {name} — no __NEXT_DATA__")
                errors += 1
                continue

            # Collect hint names from both sources
            all_hint_names = []
            seen = set()

            # Source 1: event_skills IDs resolved to names
            event_skill_ids = extract_event_skill_ids(next_data)
            for sid in event_skill_ids:
                skill_name = skill_names.get(str(sid), "")
                if skill_name and skill_name not in seen:
                    seen.add(skill_name)
                    all_hint_names.append(skill_name)

            # Source 2: hint names from event option text
            text_hints = extract_event_hints_from_next_data(next_data)
            for h in text_hints:
                if h not in seen:
                    seen.add(h)
                    all_hint_names.append(h)

            if not all_hint_names:
                print(f"[{i}/{total}] OK {name} — no event hints")
                continue

            card["SupportHints"], added = merge_hints(card.get("SupportHints", []), all_hint_names)
            if added > 0:
                cards_updated += 1
                total_added += added
                names_preview = all_hint_names[:5]
                print(f"[{i}/{total}] UPDATED {name} — +{added} event hints: {names_preview}")
            else:
                print(f"[{i}/{total}] OK {name} — {len(all_hint_names)} event hints already present")

        except Exception as e:
            print(f"[{i}/{total}] ERROR {name} — {e}")
            errors += 1

        # Rate limit
        time.sleep(delay + random.uniform(0, 0.3))

    print(f"\nRemote backfill: {cards_updated} cards updated, {total_added} hints added, {errors} errors")

    if not dry_run and total_added > 0:
        with open(HINTS_PATH, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)
        print(f"Written to {HINTS_PATH}")
    elif dry_run:
        print("(dry run — no changes written)")


def main():
    parser = argparse.ArgumentParser(description="Backfill event hints into support_hints.json")
    parser.add_argument("--dry-run", action="store_true", help="Don't write changes")
    parser.add_argument("--remote", action="store_true",
                        help="Fetch from GameTora instead of using local support_card.json")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Delay between requests in remote mode (seconds)")
    args = parser.parse_args()

    with open(HINTS_PATH, "r", encoding="utf-8") as f:
        cards = json.load(f)
    print(f"Loaded {len(cards)} support cards from {HINTS_PATH}")

    if args.remote:
        backfill_remote(cards, args.dry_run, args.delay)
    else:
        backfill_local(cards, args.dry_run)


if __name__ == "__main__":
    main()
