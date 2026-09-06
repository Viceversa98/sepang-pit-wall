#!/usr/bin/env python3
"""
Parse Sepang race telemetry CSV -> speed LUT (+ optional analytics / summary).

Workflow A - game export:
  1. Race -> Timing panel -> CSV download (usually lands in Downloads)
  2. nub run telemetry:parse

Workflow B - parse a specific file:
  python parse_telemetry.py path/to/sepang-race-telemetry-....csv
  python parse_telemetry.py --analytics   # also write .analytics.json + .summary.json

With no path: picks newest sepang-race-telemetry-*.csv from Downloads and repo root.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import pandas as pd

TRACK_LENGTH_M = 5543
ROOT = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"

KEEP_COLS = [
    "elapsed_ms",
    "phase",
    "race_control",
    "car_id",
    "name",
    "is_player",
    "lap",
    "lap_progress",
    "distance_m",
    "speed_kmh",
    "lane_offset_m",
    "gap_ahead_m",
    "ahead_id",
    "tire_wear",
    "compound",
    "status",
    "brake",
    "drs_eligible",
    "is_boxing",
    "pit_phase",
    "pending_box",
    "finished",
    "sab_target_speed_mps",
    "sab_speed_mps",
    "sab_brake",
    "sab_throttle",
    "desk_target_speed_mps",
    "speed_error_mps",
    "desk_speed_error_mps",
    "synced_from_physics",
    "kinematic",
    "available_grip",
    "wear_rate_per_s",
    "extra_wear_delta",
    "sepang_envelope_mps",
    "straight_ceil_mps",
    "field_pace",
    "pending_box_scrub",
]


def find_latest_csv() -> Path:
    candidates: list[Path] = []
    for folder in (DOWNLOADS, ROOT):
        if not folder.is_dir():
            continue
        candidates.extend(folder.glob("sepang-race-telemetry-*.csv"))
    if not candidates:
        raise FileNotFoundError(
            "No sepang-race-telemetry-*.csv in Downloads or repo root. "
            "Export CSV from the Timing panel first, or pass a path."
        )
    return max(candidates, key=lambda p: p.stat().st_mtime)


def load_csv(csv_path: Path) -> tuple[pd.DataFrame, list[str]]:
    print(f"Loading {csv_path} ...")
    df = pd.read_csv(csv_path, comment="#", low_memory=False)
    meta: list[str] = []
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("#"):
                meta.append(line[1:].strip())
            else:
                break
    print(f"  rows={len(df)} cars={df['car_id'].nunique()}")
    return df, meta


def build_speed_lut(df: pd.DataFrame) -> list[dict]:
    print("Building speed LUT (player flying-lap p90 when possible)...")
    flying = df[df["lap"] > 1].copy() if "lap" in df.columns else df.copy()
    if "distance_m" in flying.columns and flying["distance_m"].nunique() < 100:
        print("  flying coverage thin - using all racing samples")
        flying = df[df["phase"] == "racing"].copy() if "phase" in df.columns else df.copy()
        if flying.empty:
            flying = df.copy()

    if "is_player" in flying.columns:
        player = flying[flying["is_player"] == 1].copy()
    else:
        player = flying.iloc[0:0].copy()

    src = player if len(player) > 500 else flying
    src = src.copy()
    src["station_m"] = (src["lap_progress"].astype(float) % 1.0) * TRACK_LENGTH_M
    src["dist_bin"] = (src["station_m"] // 10) * 10

    if len(player) > 500:
        profile = src.groupby("dist_bin")["speed_kmh"].quantile(0.9).reset_index()
    else:
        profile = src.groupby("dist_bin")["speed_kmh"].max().reset_index()

    profile["speed_kmh"] = profile["speed_kmh"].rolling(
        window=3, center=True, min_periods=1
    ).mean()

    return [
        {"m": int(row["dist_bin"]), "speedKph": round(float(row["speed_kmh"]), 1)}
        for _, row in profile.iterrows()
    ]


def write_speed_lut(csv_path: Path, lut_points: list[dict]) -> tuple[Path, Path]:
    data_out = ROOT / "src" / "data" / "sepang-speed-lut.json"
    data_out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "circuit": "Sepang International Circuit",
        "lengthM": TRACK_LENGTH_M,
        "source": f"parse_telemetry.py from {csv_path.name}",
        "intervalM": 10,
        "points": lut_points,
    }
    data_out.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    root_out = ROOT / "sepang_speed_lut.json"
    root_out.write_text(json.dumps(lut_points, indent=2), encoding="utf-8")
    return data_out, root_out


def write_analytics(
    csv_path: Path,
    df: pd.DataFrame,
    meta_lines: list[str],
) -> tuple[Path, Path]:
    print("Building analytics JSON (250ms downsample)...")
    racing = df[df["phase"] == "racing"].copy() if "phase" in df.columns else df.copy()
    cars = sorted(df["car_id"].astype(str).unique().tolist())

    car_summaries: list[dict] = []
    for cid in cars:
        g = df[df["car_id"].astype(str) == cid]
        rg = racing[racing["car_id"].astype(str) == cid] if len(racing) else g
        name = str(g["name"].iloc[0]) if "name" in g.columns else cid
        is_player = int(g["is_player"].iloc[0]) if "is_player" in g.columns else 0
        max_lap = int(g["lap"].max()) if "lap" in g.columns else None
        max_speed = float(rg["speed_kmh"].max()) if len(rg) else float(g["speed_kmh"].max())
        avg_speed = float(rg["speed_kmh"].mean()) if len(rg) else float(g["speed_kmh"].mean())

        lap_times_ms: list[dict] = []
        if "lap" in g.columns and "elapsed_ms" in g.columns:
            gg = g.sort_values("elapsed_ms")
            firsts = gg.groupby("lap", as_index=False)["elapsed_ms"].min().sort_values("lap")
            laps = firsts["lap"].tolist()
            times = firsts["elapsed_ms"].tolist()
            for i in range(1, len(times)):
                dt = int(times[i] - times[i - 1])
                lap_times_ms.append(
                    {
                        "lap": int(laps[i]),
                        "lap_time_ms": dt,
                        "lap_time_s": round(dt / 1000.0, 3),
                    }
                )

        tire_end = float(g["tire_wear"].iloc[-1]) if "tire_wear" in g.columns else None
        compound = str(g["compound"].iloc[0]) if "compound" in g.columns else None
        damage_max = float(g["damage"].max()) if "damage" in g.columns else None
        incidents = (
            [str(x) for x in g["incident"].dropna().unique().tolist()]
            if "incident" in g.columns
            else []
        )
        pit_rows = int(g["is_boxing"].sum()) if "is_boxing" in g.columns else 0
        finished = int(g["finished"].iloc[-1]) if "finished" in g.columns else 0

        car_summaries.append(
            {
                "car_id": cid,
                "name": name,
                "is_player": bool(is_player),
                "grid_slot": int(g["grid_slot"].iloc[0]) if "grid_slot" in g.columns else None,
                "max_lap": max_lap,
                "max_speed_kmh": round(max_speed, 1),
                "avg_speed_kmh_racing": round(avg_speed, 1),
                "lap_times": lap_times_ms,
                "tire_wear_end": round(tire_end, 2) if tire_end is not None else None,
                "compound": compound,
                "damage_max": round(damage_max, 3) if damage_max is not None else None,
                "incidents": incidents,
                "boxing_samples": pit_rows,
                "finished": bool(finished),
                "sample_count": int(len(g)),
            }
        )

    elapsed_min = int(df["elapsed_ms"].min())
    elapsed_max = int(df["elapsed_ms"].max())
    phases = df["phase"].value_counts().to_dict() if "phase" in df.columns else {}
    race_control = (
        df["race_control"].value_counts().to_dict() if "race_control" in df.columns else {}
    )

    env_src = racing if len(racing) else df
    env_src = env_src.copy()
    if "lap_progress" in env_src.columns:
        env_src["station_m"] = (env_src["lap_progress"].astype(float) % 1.0) * TRACK_LENGTH_M
    else:
        env_src["station_m"] = env_src["distance_m"] % TRACK_LENGTH_M
    env_src["dist_bin"] = (env_src["station_m"] // 10) * 10
    envelope: list[dict] = []
    for dist, grp in env_src.groupby("dist_bin"):
        envelope.append(
            {
                "m": int(dist),
                "max_kmh": round(float(grp["speed_kmh"].max()), 1),
                "p95_kmh": round(float(grp["speed_kmh"].quantile(0.95)), 1),
                "median_kmh": round(float(grp["speed_kmh"].median()), 1),
                "n": int(len(grp)),
            }
        )
    envelope.sort(key=lambda x: x["m"])

    keep_cols = [c for c in KEEP_COLS if c in df.columns]
    df_sorted = df.sort_values(["elapsed_ms", "car_id"]).copy()
    df_sorted["t_bin"] = (df_sorted["elapsed_ms"] // 250) * 250
    sampled = df_sorted.groupby(["t_bin", "car_id"], as_index=False).tail(1)
    sampled = sampled[keep_cols].copy()

    bool_cols = {
        "is_player",
        "drs_eligible",
        "is_boxing",
        "pending_box",
        "finished",
        "synced_from_physics",
        "kinematic",
    }
    int_cols = {"elapsed_ms", "lap"}

    def row_to_obj(row: pd.Series) -> dict:
        o: dict = {}
        for c in keep_cols:
            v = row[c]
            if pd.isna(v):
                o[c] = None
            elif c in bool_cols:
                o[c] = bool(int(v))
            elif c in int_cols:
                o[c] = int(v)
            elif isinstance(v, float):
                o[c] = round(float(v), 3)
            elif isinstance(v, int) and not isinstance(v, bool):
                o[c] = int(v)
            else:
                o[c] = str(v)
        return o

    series = [row_to_obj(r) for _, r in sampled.iterrows()]

    player_ids = [c["car_id"] for c in car_summaries if c["is_player"]]
    player_id = player_ids[0] if player_ids else cars[0]
    pg = (
        racing[racing["car_id"].astype(str) == str(player_id)].copy()
        if len(racing)
        else df[df["car_id"].astype(str) == str(player_id)].copy()
    )
    player_laps: list[dict] = []
    if len(pg):
        if "lap_progress" in pg.columns:
            pg["station_m"] = (pg["lap_progress"].astype(float) % 1.0) * TRACK_LENGTH_M
        else:
            pg["station_m"] = pg["distance_m"] % TRACK_LENGTH_M
        pg["dist_bin"] = (pg["station_m"] // 50) * 50
        for lap, lg in pg.groupby("lap"):
            pts = []
            for dist, grp in lg.groupby("dist_bin"):
                pts.append(
                    {
                        "m": int(dist),
                        "speed_kmh": round(float(grp["speed_kmh"].mean()), 1),
                        "brake": (
                            round(float(grp["brake"].mean()), 3) if "brake" in grp else None
                        ),
                    }
                )
            pts.sort(key=lambda x: x["m"])
            player_laps.append({"lap": int(lap), "samples_50m": pts})

    out = {
        "format": "sepang-pit-wall-telemetry-analytics-v1",
        "source_csv": csv_path.name,
        "preamble": meta_lines,
        "session": {
            "elapsed_ms_min": elapsed_min,
            "elapsed_ms_max": elapsed_max,
            "duration_s": round((elapsed_max - elapsed_min) / 1000.0, 3),
            "total_rows": int(len(df)),
            "car_count": len(cars),
            "total_laps_setting": (
                int(df["total_laps"].iloc[0]) if "total_laps" in df.columns else None
            ),
            "rain": float(df["rain"].iloc[0]) if "rain" in df.columns else None,
            "phases": {str(k): int(v) for k, v in phases.items()},
            "race_control": {str(k): int(v) for k, v in race_control.items()},
            "note": (
                "Raw CSV downsampled to 250ms hold samples for Cursor AI analytics (v2 debug cols)."
            ),
        },
        "cars": car_summaries,
        "speed_envelope_10m": envelope,
        "player_lap_profiles_50m": player_laps,
        "series_250ms": {
            "interval_ms": 250,
            "columns": keep_cols,
            "row_count": len(series),
            "rows": series,
        },
    }

    stem = csv_path.stem
    analytics_path = ROOT / f"{stem}.analytics.json"
    print(f"Writing {analytics_path} ... series={len(series)}")
    analytics_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    summary = {
        "format": out["format"] + "-summary",
        "source_csv": out["source_csv"],
        "preamble": out["preamble"],
        "session": out["session"],
        "cars": out["cars"],
        "speed_envelope_10m": out["speed_envelope_10m"],
        "player_lap_profiles_50m": out["player_lap_profiles_50m"],
        "series_note": (
            f"Full 250ms series ({len(series)} rows) is in the .analytics.json sibling file."
        ),
    }
    summary_path = ROOT / f"{stem}.summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("cars:")
    for c in car_summaries:
        laps = ", ".join(f"L{t['lap']}={t['lap_time_s']}s" for t in c["lap_times"]) or "n/a"
        print(
            f"  {c['car_id']:4} {c['name']:6} max={c['max_speed_kmh']} "
            f"avg={c['avg_speed_kmh_racing']} wear_end={c['tire_wear_end']} "
            f"laps=[{laps}] finished={c['finished']}"
        )
    return analytics_path, summary_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse Sepang race telemetry CSV -> speed LUT (+ analytics)."
    )
    parser.add_argument(
        "csv",
        nargs="?",
        type=Path,
        help="CSV path (default: newest sepang-race-telemetry-*.csv in Downloads/repo)",
    )
    parser.add_argument(
        "--analytics",
        action="store_true",
        help="Also write .analytics.json + .summary.json next to the repo root",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Alias for --analytics (LUT + analytics + summary)",
    )
    args = parser.parse_args()

    csv_path = args.csv.resolve() if args.csv else find_latest_csv()
    if not csv_path.is_file():
        raise SystemExit(f"CSV not found: {csv_path}")

    df, meta = load_csv(csv_path)
    lut = build_speed_lut(df)
    data_out, root_out = write_speed_lut(csv_path, lut)
    print(f"LUT points={len(lut)} max={max(p['speedKph'] for p in lut)}")
    print(f"  {data_out}")
    print(f"  {root_out}")

    if args.analytics or args.all:
        analytics_path, summary_path = write_analytics(csv_path, df, meta)
        print(f"  {analytics_path} ({analytics_path.stat().st_size / 1024 / 1024:.2f} MB)")
        print(f"  {summary_path} ({summary_path.stat().st_size / 1024:.1f} KB)")

    print("Done.")


if __name__ == "__main__":
    # Avoid Windows console choking on odd chars.
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
