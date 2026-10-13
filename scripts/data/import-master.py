#!/usr/bin/env python3
"""Export skill data from an installed game's SQLite master database."""

import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def resolve_master(source):
    source = Path(source).resolve()
    if source.is_file():
        return source
    candidates = sorted(
        set(source.glob("*_Data/Persistent/master/master.mdb"))
        | set(source.glob("master/master.mdb"))
    )
    if len(candidates) != 1:
        raise ValueError(
            "Provide a master.mdb file or a game folder containing exactly one database"
        )
    return candidates[0]


def export_master(source, server, output_dir, provenance=None):
    master = resolve_master(source)
    # SQLite backup gives a consistent read, including any committed WAL contents.
    # Never open the installed database for writing.
    with tempfile.TemporaryDirectory(prefix="umatools-master-") as temporary:
        snapshot = Path(temporary) / "master.mdb"
        with closing(sqlite3.connect(master.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(snapshot)) as copy:
                original.backup(copy)
        digest = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        with closing(sqlite3.connect(snapshot.as_uri() + "?mode=ro", uri=True)) as database:
            database.row_factory = sqlite3.Row
            columns = {row[1] for row in database.execute("PRAGMA table_info(skill_data)")}
            if not {"id", "grade_value", "rarity"}.issubset(columns):
                raise ValueError("Database is missing required skill_data columns")
            names = {}
            descriptions = {}
            for row in database.execute(
                'SELECT category, "index", text FROM text_data WHERE category IN (47, 48)'
            ):
                (names if row[0] == 47 else descriptions)[row[1]] = row[2]
            costs = dict(
                database.execute("SELECT id, need_skill_point FROM single_mode_skill_need_point")
            )
            skills = []
            for row in database.execute("SELECT * FROM skill_data ORDER BY id"):
                skill = dict(row)
                skill.update(
                    name=names.get(row["id"], ""),
                    description=descriptions.get(row["id"], ""),
                    need_skill_point=costs.get(row["id"]),
                )
                skills.append(skill)
            if not skills or not any(skill["name"] for skill in skills):
                raise ValueError("Refusing to publish an empty or unnamed skill catalog")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{server}.json"
    if target.exists():
        previous = json.loads(target.read_text(encoding="utf-8"))
        if (
            previous.get("schema_version") == 1
            and previous.get("source", {}).get("sha256") == digest
            and all(
                previous.get("source", {}).get(key) == value
                for key, value in (provenance or {}).items()
            )
        ):
            return target, len(skills), False
    payload = {
        "schema_version": 1,
        "server": server,
        "source": {
            "kind": "game-master",
            "sha256": digest,
            "hash_scope": "sqlite-backup",
            "file_modified_at": datetime.fromtimestamp(
                master.stat().st_mtime, timezone.utc
            ).isoformat(),
            "imported_at": datetime.now(timezone.utc).isoformat(),
            "game_version": None,
        },
        "skill_count": len(skills),
        "skills": skills,
    }
    payload["source"].update(provenance or {})
    # Replace only after the entire validated snapshot is written successfully.
    fd, temporary_name = tempfile.mkstemp(dir=output_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
        os.replace(temporary_name, target)
    finally:
        Path(temporary_name).unlink(missing_ok=True)
    return target, len(skills), True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--global", dest="global_source", help="Global master.mdb or game directory"
    )
    parser.add_argument("--jp", dest="jp_source", help="JP master.mdb or game directory")
    parser.add_argument("--out", type=Path, default=ROOT / "public/assets/master")
    args = parser.parse_args()
    if not args.global_source and not args.jp_source:
        parser.error("Provide --global and/or --jp; server identity is explicit, never guessed")
    for server, source in (("global", args.global_source), ("jp", args.jp_source)):
        if source:
            target, count, changed = export_master(source, server, args.out)
            print(f"{server}: {count} skills, {'updated' if changed else 'unchanged'}: {target}")


if __name__ == "__main__":
    main()
