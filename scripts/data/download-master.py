#!/usr/bin/env python3
"""Refresh Global skills from public CDN manifests; preserve the snapshot on failure."""

import argparse
import base64
import hashlib
import io
import json
import re
import runpy
import sqlite3
import tempfile
import urllib.request
from contextlib import closing
from pathlib import Path

import lz4.block
import lz4.frame
import xxhash

ROOT = Path(__file__).resolve().parents[2]
VERSION_URL = "https://uma.moe/api/ver"
CDN = "https://assets-umamusume-en.akamaized.net/dl/vertical"
MAX_BYTES = 128 * 1024 * 1024


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "UmaTools master updater"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("Download exceeds size limit")
    return data


def decompress(data):
    if data.startswith(b"\xbf"):
        return data
    if data.startswith(b"\x04\x22\x4d\x18"):
        with lz4.frame.open(io.BytesIO(data)) as stream:
            result = stream.read(MAX_BYTES + 1)
        if len(result) > MAX_BYTES:
            raise ValueError("Decompressed data exceeds size limit")
        return result
    size = int.from_bytes(data[:4], "little")
    if len(data) < 5 or not 0 < size <= MAX_BYTES:
        raise ValueError("Invalid LZ4 block size")
    result = lz4.block.decompress(data[4:], uncompressed_size=size)
    if len(result) != size:
        raise ValueError("Unexpected decompressed size")
    return result


def manifest(data):
    """Decode the anonymous BSV rows used by the game's manifests."""
    if data[:2] != b"\xbf\x11":
        raise ValueError("Unsupported manifest format")
    offset = 4

    def take(size):
        nonlocal offset
        if size < 0 or offset + size > len(data):
            raise ValueError("Truncated manifest")
        value = data[offset : offset + size]
        offset += size
        return value

    def integer():
        value = 0
        for _ in range(10):
            byte = take(1)[0]
            value = (value << 7) | (byte & 127)
            if byte < 128:
                return value
        raise ValueError("Invalid manifest integer")

    rows = integer()
    integer()  # Maximum row size.
    integer()  # Schema version.
    columns = integer()
    if rows > 1_000_000 or not 1 <= columns <= 64:
        raise ValueError("Invalid manifest dimensions")
    schema = []
    for _ in range(columns):
        kind = take(1)[0]
        width = integer() if ((kind - 0x21) & 0xCF) == 0 and kind != 0x51 else None
        schema.append((kind, width))
    result = []
    for _ in range(rows):
        row = []
        for kind, width in schema:
            if kind & 0xF0 == 0x40:
                end = data.find(b"\0", offset)
                if end < 0:
                    raise ValueError("Unterminated manifest string")
                row.append(take(end - offset).decode("utf-8"))
                take(1)
            elif kind & 0xF0 == 0x10:
                row.append(integer())
            elif width is not None and 1 <= width <= 8:
                row.append(int.from_bytes(take(width), "big"))
            else:
                raise ValueError("Unsupported manifest column")
        result.append(row)
    return result


def resource(rows, name, category):
    matches = [row for row in rows if row[0] == name]
    if len(matches) != 1:
        raise ValueError(f"Expected one manifest entry for {name}")
    row = matches[0]
    size, checksum = (row[4], row[5]) if len(row) >= 7 else (row[1], row[2])
    if not isinstance(size, int) or not 0 < size <= MAX_BYTES:
        raise ValueError("Invalid resource size")
    key = checksum.to_bytes(8, "big") + size.to_bytes(8, "big") + name.encode()
    digest = base64.b32encode(hashlib.sha1(key).digest()).decode().rstrip("=")
    url = f"{CDN}/resources/{category}/{digest[:2]}/{digest}"
    data = fetch(url)
    if len(data) != size or xxhash.xxh64(data).intdigest() != checksum:
        raise ValueError(f"Checksum or size mismatch for {name}")
    return decompress(data), url


def refresh(output):
    version = json.loads(fetch(VERSION_URL))
    resource_version = str(version["resource_version"])
    if not re.fullmatch(r"[0-9]{1,20}", resource_version):
        raise ValueError("Invalid resource version")
    root_url = f"{CDN}/{resource_version}/manifests/manifestdat/root.manifest.bsv.lz4"
    root = manifest(decompress(fetch(root_url)))
    platform, _ = resource(root, "Windows", "Manifest")
    master, _ = resource(manifest(platform), "master", "Manifest")
    database, database_url = resource(manifest(master), "master.mdb.lz4", "Generic")
    if not database.startswith(b"SQLite format 3\0"):
        raise ValueError("Downloaded resource is not SQLite")
    with tempfile.TemporaryDirectory(prefix="umatools-download-") as temporary:
        path = Path(temporary) / "master.mdb"
        path.write_bytes(database)
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
            if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise ValueError("Downloaded database failed SQLite integrity check")
        export = runpy.run_path(str(Path(__file__).with_name("import-master.py")))["export_master"]
        return export(
            path,
            "global",
            output,
            {
                "kind": "cdn-master",
                "game_version": version["app_version"],
                "resource_version": resource_version,
                "version_provider": VERSION_URL,
                "version_reported_at": version.get("updated_at"),
                "manifest_url": root_url,
                "database_url": database_url,
                "download_sha256": hashlib.sha256(database).hexdigest(),
                "file_modified_at": None,
            },
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "public/assets/master")
    args = parser.parse_args()
    target, count, changed = refresh(args.out)
    print(f"Global: {count} skills, {'updated' if changed else 'unchanged'}: {target}")


if __name__ == "__main__":
    main()
