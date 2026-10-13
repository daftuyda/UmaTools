import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import lz4.block
import lz4.frame
import xxhash

ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(ROOT / "scripts/data/download-master.py"))


class MasterDownloadTests(unittest.TestCase):
    def test_compression_formats_and_invalid_size(self):
        raw = b"SQLite format 3\0" * 30
        for compressed in (lz4.frame.compress(raw), lz4.block.compress(raw)):
            self.assertEqual(MODULE["decompress"](compressed), raw)
        with self.assertRaises(ValueError):
            MODULE["decompress"](b"\xff\xff\xff\xffx")

    def test_anonymous_manifest_and_truncation(self):
        # One row: name, size and fixed-width unsigned checksum.
        encoded = b"\xbf\x11\x00\x00\x01\x20\x01\x03\x40\x10\x21\x08Windows\0\x05" + (123).to_bytes(
            8, "big"
        )
        self.assertEqual(MODULE["manifest"](encoded), [["Windows", 5, 123]])
        with self.assertRaises(ValueError):
            MODULE["manifest"](encoded[:-1])

    def test_checksum_mismatch_is_rejected(self):
        resource = MODULE["resource"]
        content = b"\xbf\x11example"
        rows = [["Windows", len(content), xxhash.xxh64(content).intdigest()]]
        with patch.dict(resource.__globals__, fetch=lambda url: content):
            self.assertEqual(resource(rows, "Windows", "Manifest")[0], content)
        with patch.dict(resource.__globals__, fetch=lambda url: b"x" * len(content)):
            with self.assertRaises(ValueError):
                resource(rows, "Windows", "Manifest")

    def test_failed_refresh_preserves_previous_snapshot(self):
        refresh = MODULE["refresh"]
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "global.json"
            target.write_text('{"previous":true}', encoding="utf-8")
            previous = target.read_bytes()
            with patch.dict(
                refresh.__globals__,
                fetch=lambda url: json.dumps({"resource_version": "../bad"}).encode(),
            ):
                with self.assertRaises(ValueError):
                    refresh(Path(temporary))
            self.assertEqual(target.read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
