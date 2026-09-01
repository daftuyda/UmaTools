#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]

DEFAULT_MDB_PATH = (
    Path(os.path.expandvars(r"%APPDATA%\..\LocalLow\Cygames\umamusume\master\master.mdb"))
    .resolve()
)
PUBLIC_ASSETS = ROOT_DIR / "public" / "assets"
DEFAULT_OUT_SKILLS = PUBLIC_ASSETS / "accel_skills_compat.json"
DEFAULT_OUT_CHARA = PUBLIC_ASSETS / "accel_skill_chara.json"
DEFAULT_SKILLS_ALL = PUBLIC_ASSETS / "skills_all.json"
DEFAULT_UMA_DATA = PUBLIC_ASSETS / "uma_data.json"

RARITY_LABELS = {
    1: "白スキル",
    2: "金スキル",
    3: "固有スキル（下位）",
    4: "固有スキル",
    5: "固有スキル",
    6: "進化スキル",
}

# Only acceleration / target-speed effect types.
# Excludes type 10 (Lane Change Speed), type 9 (Stamina Recovery), and
# type 28 (Lane Movement Speed) which pulled in non-accel skills with wrong values.
EFFECT_PRIORITY = [31, 27, 22, 29, 21]

RR_WEAK_VARS = {"infront_near_lane_time", "behind_near_lane_time"}
FIXED_RR_VARS = {"hp_per", "order", "order_rate"}
FIXED_RV_VARS = {"popularity"}

UNCERTAIN_RR_VARS = {
    "activate_count_all_team",
    "activate_count_heal",
    "activate_count_start",
    "bashin_diff_behind",
    "bashin_diff_infront",
    "blocked_front",
    "blocked_front_continuetime",
    "blocked_side_continuetime",
    "change_order_onetime",
    "change_order_up_middle",
    "compete_fight_count",
    "distance_diff_rate",
    "distance_diff_top",
    "infront_near_lane_time",
    "behind_near_lane_time",
    "is_behind_in",
    "is_move_lane",
    "is_overtake",
    "is_used_skill_id",
    "overtake_target_time",
    "temptation_count",
}
UNCERTAIN_RV_VARS = {"motivation", "post_number"}

VAR_COMPARE_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*(==|>=|<=|>|<)\s*(-?\d+)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate public/assets/accel_skills_compat.json from master.mdb without VAC legacy constants."
        )
    )
    parser.add_argument("--mdb", type=Path, default=DEFAULT_MDB_PATH, help="Path to master.mdb")
    parser.add_argument(
        "--out-skills", type=Path, default=DEFAULT_OUT_SKILLS, help="Output accel skills JSON"
    )
    parser.add_argument(
        "--with-chara",
        action="store_true",
        help="Also generate accel_skill_chara.json from local assets metadata",
    )
    parser.add_argument(
        "--out-chara", type=Path, default=DEFAULT_OUT_CHARA, help="Output accel skill chara JSON"
    )
    parser.add_argument(
        "--skills-all",
        type=Path,
        default=DEFAULT_SKILLS_ALL,
        help="Path to skills_all.json (used for JP names/rarity enrichment)",
    )
    parser.add_argument(
        "--uma-data",
        type=Path,
        default=DEFAULT_UMA_DATA,
        help="Path to uma_data.json (used for chara name mapping)",
    )
    return parser.parse_args()


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_condition(value: str | None) -> str:
    if not value:
        return ""
    s = str(value).strip()
    if not s or s == "0":
        return ""
    s = s.replace(" ", "")
    s = s.replace("&&", "&").replace("||", "@")
    s = re.sub(r"&{2,}", "&", s)
    s = re.sub(r"@{2,}", "@", s)
    s = s.strip("&@")
    return s


def combine_condition(pre: str, cond: str) -> str:
    pre = normalize_condition(pre)
    cond = normalize_condition(cond)
    if pre and cond:
        return f"{pre}&{cond}"
    return pre or cond


def parse_course_constraints(raw: str) -> tuple[int | None, int | None, list[int] | None]:
    eq: set[int] = set()
    ge_vals: list[int] = []
    le_vals: list[int] = []

    for var, op, value_s in VAR_COMPARE_RE.findall(raw):
        if var != "course_distance":
            continue
        value = int(value_s)
        if op == "==":
            eq.add(value)
        elif op in (">=", ">"):
            ge_vals.append(value if op == ">=" else value + 1)
        elif op in ("<=", "<"):
            le_vals.append(value if op == "<=" else value - 1)

    cd_eq = sorted(eq) if eq else None
    cd_ge = min(ge_vals) if ge_vals else None
    cd_le = max(le_vals) if le_vals else None
    return cd_ge, cd_le, cd_eq


def parse_simple_filter_values(raw: str, var_name: str) -> set[int]:
    values: set[int] = set()
    for var, op, value_s in VAR_COMPARE_RE.findall(raw):
        if var != var_name or op != "==":
            continue
        values.add(int(value_s))
    return values


def parse_mv(raw: str) -> int | None:
    values: list[int] = []
    for var, op, value_s in VAR_COMPARE_RE.findall(raw):
        if var != "motivation":
            continue
        value = int(value_s)
        if op in ("==", ">=", ">"):
            values.append(value)
    return min(values) if values else None


def parse_uncertainty(raw: str) -> tuple[list[str], list[str], int]:
    rr: set[str] = set()
    rv: set[str] = set()
    for var, _op, _value in VAR_COMPARE_RE.findall(raw):
        if var in UNCERTAIN_RR_VARS:
            rr.add(var)
        if var in UNCERTAIN_RV_VARS:
            rv.add(var)

    rr_list = sorted(rr)
    rv_list = sorted(rv)

    score = 0
    for var in rv_list:
        if var not in FIXED_RV_VARS:
            score += 4
    for var in rr_list:
        if var in FIXED_RR_VARS:
            continue
        score += 1 if var in RR_WEAK_VARS else 2
    return rr_list, rv_list, score


def parse_first_int(pattern: str, text: str) -> int | None:
    match = re.search(pattern, text)
    if not match:
        return None
    return int(match.group(1))


def classify_random_subtype(clause: str) -> dict[str, Any] | None:
    if "phase_firstquarter_random" in clause:
        return {"type": "random", "subtype": "fq"}
    if "phase_firsthalf_random" in clause and "is_last_straight==1" in clause:
        return {"type": "random", "subtype": "fh_straight"}
    if "phase_firsthalf_random" in clause:
        return {"type": "random", "subtype": "fh"}
    if "phase_laterhalf_random" in clause:
        return {"type": "random", "subtype": "lh"}
    if "is_finalcorner_random" in clause:
        return {"type": "random", "subtype": "finalcorner_random"}
    if "is_finalcorner_laterhalf" in clause:
        return {"type": "random", "subtype": "finalcorner_lh"}
    if "all_corner_random" in clause:
        return {"type": "random", "subtype": "all_corner"}
    if "all_straight_random" in clause or "straight_random" in clause:
        return {"type": "random", "subtype": "straight_random"}
    if "distance_rate_after_random" in clause:
        return {"type": "random", "subtype": "after50"}
    if "distance_rate_after" in clause:
        return {"type": "random", "subtype": "dist_rate_after"}

    phase_random = parse_first_int(r"\bphase_random==(-?\d+)\b", clause)
    if phase_random is not None:
        if phase_random <= 0:
            return {"type": "random", "subtype": "phase0"}
        if phase_random == 1:
            return {"type": "random", "subtype": "phase1"}
        return {"type": "random", "subtype": "phase2"}

    remain_le = parse_first_int(r"\bremain_distance<=(-?\d+)\b", clause)
    remain_ge = parse_first_int(r"\bremain_distance>=(-?\d+)\b", clause)
    if remain_le is not None and remain_ge is not None:
        if abs(remain_le - remain_ge) <= 5:
            rv = round((remain_le + remain_ge) / 2)
            return {"type": "fixed", "fixed_point": "remain", "rv": rv}
        return {"type": "random", "subtype": "remain_range", "rv": max(remain_le, remain_ge)}
    if remain_le is not None:
        return {"type": "random", "subtype": "remain_lte", "rv": remain_le}
    return None


def classify_clause_segment(clause: str) -> dict[str, Any]:
    clause = normalize_condition(clause)
    if not clause:
        return {"type": "exclude"}

    if clause == "always==1":
        return {"type": "always"}

    if "slope==1" in clause and "phase_laterhalf==1" in clause:
        return {"type": "slope_up_later_half"}
    if "slope==1" in clause:
        return {"type": "slope_up"}
    if "slope==2" in clause:
        return {"type": "slope_down"}

    random_seg = classify_random_subtype(clause)
    if random_seg is not None:
        return random_seg

    rate_eq = parse_first_int(r"\bdistance_rate==(-?\d+)\b", clause)
    if rate_eq is not None:
        return {"type": "fixed", "fixed_point": "distance_rate", "rv": rate_eq}

    if "is_last_straight==1" in clause:
        if "phase>=2" in clause or "phase==2" in clause:
            return {"type": "fixed", "fixed_point": "phase2_straight"}
        return {"type": "fixed", "fixed_point": "finalstraight"}

    if "is_finalcorner==1" in clause:
        if "phase>=2" in clause or "phase==2" in clause:
            if "corner!=0" in clause:
                return {"type": "fixed", "fixed_point": "phase2_corner"}
            if "corner==0" in clause:
                return {"type": "fixed", "fixed_point": "phase2_front_straight"}
        return {"type": "fixed", "fixed_point": "finalcorner"}

    if "is_lastspurt==1" in clause or "phase==2" in clause:
        return {"type": "fixed", "fixed_point": "ls"}

    if "phase>=2" in clause and "corner!=0" in clause:
        return {"type": "random", "subtype": "phase_corner"}
    if "phase>=2" in clause and "corner==0" in clause:
        return {"type": "random", "subtype": "phase_straight"}
    if "phase_laterhalf==1" in clause and "corner==0" in clause:
        return {"type": "random", "subtype": "phase_latter_straight"}

    return {"type": "random", "subtype": "other"}


def build_segments(raw: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    clauses = [normalize_condition(part) for part in raw.split("@") if normalize_condition(part)]
    if not clauses:
        return {"type": "exclude"}, [{"type": "exclude"}]
    segs = [classify_clause_segment(clause) for clause in clauses]
    return segs[0], segs


def pick_effect_value(
    alternatives: list[dict[str, Any]],
) -> tuple[int | None, int | None]:
    # Choose the strongest available value by type priority (VAC-compatible display bias).
    for effect_type in EFFECT_PRIORITY:
        candidates: list[tuple[int, int]] = []  # (value, duration)
        for alt in alternatives:
            duration = as_int(alt.get("time")) or 0
            for et, ev in alt.get("effects", []):
                if et != effect_type:
                    continue
                candidates.append((int(ev), duration))
        if not candidates:
            continue
        # Prefer largest absolute impact; tie-break on larger raw value.
        candidates.sort(key=lambda item: (abs(item[0]), item[0]), reverse=True)
        value, duration = candidates[0]
        return value, duration
    return None, None


def load_skills_all(path: Path) -> dict[int, dict[str, Any]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    out: dict[int, dict[str, Any]] = {}
    for entry in raw:
        skill_id = as_int(entry.get("id"))
        if skill_id is None:
            continue
        rarity = as_int(entry.get("rarity"))
        current = out.get(skill_id)
        candidate = {
            "id": skill_id,
            "jpname": entry.get("jpname") or "",
            "jpdesc": entry.get("jpdesc") or "",
            "rarity": rarity,
            "char": list(entry.get("char") or []),
            "char_e": list(entry.get("char_e") or []),
        }
        if current is None:
            out[skill_id] = candidate
            continue
        cur_key = (as_int(current.get("rarity")) or 0, 1 if current.get("jpname") else 0)
        new_key = (rarity or 0, 1 if candidate.get("jpname") else 0)
        if new_key > cur_key:
            out[skill_id] = candidate
    return out


def load_uma_name_map(path: Path) -> dict[int, str]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    out: dict[int, str] = {}
    for entry in data:
        uma_id = as_int(entry.get("UmaId"))
        if uma_id is None:
            continue
        name_jp = entry.get("UmaNameJP")
        name_en = entry.get("UmaName")
        name = name_jp or name_en
        if name:
            out[uma_id] = str(name)
    return out


def map_rarity(skill_id: int, db_rarity: int | None, skill_meta: dict[str, Any] | None) -> int:
    meta_rarity = as_int(skill_meta.get("rarity")) if skill_meta else None
    if meta_rarity in (1, 2, 3, 4, 5, 6):
        return int(meta_rarity)
    if skill_id >= 100000000:
        return 6
    if db_rarity is None:
        return 1
    # Fallback mapping from master.mdb rarity.
    if db_rarity <= 1:
        return 1
    if db_rarity == 2:
        return 2
    if db_rarity == 3:
        return 3
    if db_rarity == 4:
        return 4
    if db_rarity == 5:
        return 5
    return 1


def generate_compat(
    mdb_path: Path,
    skills_all_map: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not mdb_path.exists():
        raise FileNotFoundError(f"master.mdb not found: {mdb_path}")

    con = sqlite3.connect(str(mdb_path))
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Read names/descriptions from text_data as fallback when skills_all has no JP strings.
    names_by_id: dict[int, str] = {}
    desc_by_id: dict[int, str] = {}
    for row in cur.execute("SELECT [index], text FROM text_data WHERE category=47"):
        idx = as_int(row["index"])
        if idx is not None and row["text"]:
            names_by_id[idx] = str(row["text"])
    for row in cur.execute("SELECT [index], text FROM text_data WHERE category=48"):
        idx = as_int(row["index"])
        if idx is not None and row["text"]:
            desc_by_id[idx] = str(row["text"])

    sql = """
      SELECT
        id,
        rarity,
        precondition_1, condition_1, float_ability_time_1,
        ability_type_1_1, float_ability_value_1_1,
        ability_type_1_2, float_ability_value_1_2,
        ability_type_1_3, float_ability_value_1_3,
        precondition_2, condition_2, float_ability_time_2,
        ability_type_2_1, float_ability_value_2_1,
        ability_type_2_2, float_ability_value_2_2,
        ability_type_2_3, float_ability_value_2_3
      FROM skill_data
      ORDER BY id
    """

    rows = cur.execute(sql).fetchall()
    con.close()

    out: list[dict[str, Any]] = []
    for row in rows:
        skill_id = as_int(row["id"])
        if skill_id is None:
            continue

        alternatives: list[dict[str, Any]] = []
        for suffix in ("1", "2"):
            cond = combine_condition(row[f"precondition_{suffix}"], row[f"condition_{suffix}"])
            if not cond:
                continue
            effects: list[tuple[int, int]] = []
            for idx in ("1", "2", "3"):
                t = as_int(row[f"ability_type_{suffix}_{idx}"])
                v = as_int(row[f"float_ability_value_{suffix}_{idx}"])
                if t is None or v is None or t == 0:
                    continue
                effects.append((t, v))
            alternatives.append(
                {
                    "raw": cond,
                    "time": as_int(row[f"float_ability_time_{suffix}"]) or 0,
                    "effects": effects,
                }
            )

        if not alternatives:
            continue

        qty, dur = pick_effect_value(alternatives)
        if qty is None:
            continue

        raw = "@".join(alt["raw"] for alt in alternatives if alt["raw"])
        tm, segs = build_segments(raw)

        dt_vals = sorted(parse_simple_filter_values(raw, "distance_type"))
        gt_vals = sorted(parse_simple_filter_values(raw, "ground_type"))
        gc_vals = sorted(parse_simple_filter_values(raw, "ground_condition"))
        track_vals = sorted(parse_simple_filter_values(raw, "track_id"))
        mv = parse_mv(raw)
        cd_ge, cd_le, cd_eq = parse_course_constraints(raw)
        rr, rv, unc = parse_uncertainty(raw)

        skill_meta = skills_all_map.get(skill_id)
        db_rarity = as_int(row["rarity"])
        rar = map_rarity(skill_id, db_rarity, skill_meta)

        name = None
        desc = None
        if skill_meta:
            if skill_meta.get("jpname"):
                name = str(skill_meta["jpname"])
            if skill_meta.get("jpdesc"):
                desc = str(skill_meta["jpdesc"])
        if not name:
            name = names_by_id.get(skill_id, "")
        if not desc:
            desc = desc_by_id.get(skill_id, "")

        out.append(
            {
                "n": name,
                "e": desc,
                "dt": dt_vals,
                "gt": gt_vals,
                "gc": gc_vals,
                "mv": mv,
                "track": track_vals,
                "cd_ge": cd_ge,
                "cd_le": cd_le,
                "cd_eq": cd_eq,
                "tm": tm,
                "segs": segs,
                "raw": raw,
                "qty": qty,
                "dur": dur or 0,
                "rar": rar,
                "rarj": RARITY_LABELS.get(rar, RARITY_LABELS[1]),
                "rr": rr,
                "rv": rv,
                "unc": unc,
                "id": skill_id,
            }
        )

    # Deterministic output order.
    out.sort(key=lambda item: (item.get("rar", 0), item.get("id", 0)))
    return out


def build_skill_chara_map(
    compat_rows: list[dict[str, Any]],
    skills_all_map: dict[int, dict[str, Any]],
    uma_name_map: dict[int, str],
) -> dict[str, list[str]]:
    by_name: dict[str, set[str]] = {}
    for row in compat_rows:
        skill_id = as_int(row.get("id"))
        skill_name = row.get("n")
        if skill_id is None or not skill_name:
            continue
        meta = skills_all_map.get(skill_id)
        if not meta:
            continue
        char_ids = []
        char_ids.extend(meta.get("char") or [])
        char_ids.extend(meta.get("char_e") or [])
        for cid in char_ids:
            char_id = as_int(cid)
            if char_id is None:
                continue
            char_name = uma_name_map.get(char_id)
            if not char_name:
                continue
            by_name.setdefault(str(skill_name), set()).add(char_name)

    out: dict[str, list[str]] = {}
    for skill_name in sorted(by_name):
        out[skill_name] = sorted(by_name[skill_name])
    return out


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main() -> int:
    args = parse_args()

    mdb_path = args.mdb.resolve()
    out_skills = args.out_skills.resolve()
    out_chara = args.out_chara.resolve()
    skills_all_path = args.skills_all.resolve()
    uma_data_path = args.uma_data.resolve()

    try:
        skills_all_map = load_skills_all(skills_all_path)
        compat_rows = generate_compat(mdb_path, skills_all_map)
        write_json(out_skills, compat_rows)
        print(
            f"[accel-compat] wrote {len(compat_rows)} entries -> "
            f"{out_skills.relative_to(ROOT_DIR)}"
        )

        if args.with_chara:
            uma_name_map = load_uma_name_map(uma_data_path)
            chara_map = build_skill_chara_map(compat_rows, skills_all_map, uma_name_map)
            write_json(out_chara, chara_map)
            print(
                f"[accel-compat] wrote {len(chara_map)} keys -> "
                f"{out_chara.relative_to(ROOT_DIR)}"
            )
    except Exception as exc:  # pragma: no cover - CLI error path
        print(f"[accel-compat] {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
