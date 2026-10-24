"""Import the supplied Team Trials course pool without spreadsheet dependencies."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import xml.etree.ElementTree as ET
import zipfile


def import_tracks(workbook, sim):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(workbook) as z:
        strings = ["".join(n.itertext()) for n in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("s:si", ns)]
        rows = []
        for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).findall(".//s:sheetData/s:row", ns):
            values = {}
            for cell in row:
                value = cell.find("s:v", ns)
                text = value.text if value is not None else ""
                values[re.sub(r"\d+", "", cell.attrib["r"])] = strings[int(text)] if cell.get("t") == "s" and text else text
            rows.append((int(row.attrib["r"]), values))
    tracks = dict(zip(["Sapporo", "Hakodate", "Niigata", "Fukushima", "Nakayama", "Tokyo", "Chukyo", "Kyoto", "Hanshin", "Kokura"], range(10001, 10011)))
    tracks.update(Ooi=10101, Kawasaki=10103, Funabashi=10104, Morioka=10105)
    courses = json.loads((pathlib.Path(sim) / "data/course_data.json").read_text())
    categories = {"sprint": [], "mile": [], "medium": [], "long": [], "dirt": []}
    category = None
    for row, values in rows:
        name = values.get("A", "")
        if name in ["sprint", "mile", "med", "long", "dirt"]:
            category = "medium" if name == "med" else name
        if name not in tracks:
            continue
        distance = int(float(values["B"]))
        surface = 2 if category == "dirt" else 1
        candidates = [int(k) for k, c in courses.items() if c["raceTrackId"] == tracks[name] and c["distance"] == distance and c["surface"] == surface]
        if not candidates:
            raise ValueError(f"Unmapped row {row}: {name} {distance}")
        categories[category].append({"row": row, "track": name, "distance": distance, "courseIds": candidates})
    # Duplicate track/distance rows represent distinct layouts where those exist.
    for entries in categories.values():
        counts = collections.Counter((e["track"], e["distance"]) for e in entries)
        seen = collections.Counter()
        for e in entries:
            key = (e["track"], e["distance"])
            if len(e["courseIds"]) > 1 and counts[key] == len(e["courseIds"]):
                candidates = e["courseIds"]
                e["courseIds"] = [candidates[seen[key]]]
                seen[key] += 1
            elif len(e["courseIds"]) != 1:
                raise ValueError(f"Ambiguous layout: {e}")
    conditions = {v["I"]: float(v["J"]) for _, v in rows if v.get("I") and v.get("J")}
    return {
        "schemaVersion": 1,
        "source": {"file": pathlib.Path(workbook).name, "sha256": hashlib.sha256(pathlib.Path(workbook).read_bytes()).hexdigest(),
                   "credit": "Workbook credits Ruben for analysis", "weighting": "Equal weight per listed course row within each category; these are pool entries, not race occurrence counts.",
                   "layoutMapping": "Repeated venue/distance rows assigned to distinct course IDs in ascending order; their equal weights make row order immaterial."},
        "categories": categories,
        "conditions": {
            "season": dict(zip(["Spring", "Summer", "Autumn", "Winter"], [conditions[k] for k in ["Spring", "Summer", "Autumn", "Winter"]])),
            "weather": {k: conditions[k] for k in ["Sunny", "Cloudy", "Rainy", "Snowy"]},
            "groundCondition": dict(zip(["Good", "Yielding", "Soft", "Heavy"], [conditions[k] for k in ["Firm", "Good", "Soft", "Heavy"]]))
        }
    }

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("workbook")
    p.add_argument("--sim", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    result = import_tracks(a.workbook, a.sim)
    pathlib.Path(a.out).write_text(json.dumps(result, indent=2) + "\n")
    print({k: len(v) for k, v in result["categories"].items()})
