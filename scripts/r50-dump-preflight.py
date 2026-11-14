#!/usr/bin/env python3
"""R50: inspect a PostgreSQL custom dump WITHOUT restoring data or changing a DB.

Requires pg_restore on PATH. Prints only schema/object metadata, never row data.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

IMPORTANT = (
    ("public", "project"),
    ("public", "projects"),
    ("public", "project_snapshots"),
    ("public", "project_persona"),
    ("auth", "users"),
    ("storage", "buckets"),
    ("storage", "objects"),
)
TOC_ENTRY = re.compile(r"^\s*\d+;\s+\d+\s+\d+\s+(.*)$")


def inventory(text: str) -> dict:
    objects = set()
    counts: dict[str, int] = {}
    for line in text.splitlines():
        match = TOC_ENTRY.match(line)
        if not match:
            continue
        tokens = match.group(1).split()
        if len(tokens) < 3:
            continue
        if tokens[0] in ("TABLE", "SCHEMA", "EXTENSION", "FUNCTION", "TYPE", "INDEX", "TRIGGER", "POLICY", "FK", "CONSTRAINT"):
            kind = tokens[0]
            offset = 1
        elif len(tokens) > 3 and tokens[0] == "TABLE" and tokens[1] == "DATA":
            kind = "TABLE DATA"
            offset = 2
        else:
            # pg_restore TOC has many different object kinds; only table entries
            # are needed for the compatibility gate.
            kind = " ".join(tokens[:2])
            offset = 2
        counts[kind] = counts.get(kind, 0) + 1
        if kind in ("TABLE", "TABLE DATA") and len(tokens) >= offset + 2:
            objects.add((kind, tokens[offset], tokens[offset + 1]))

    present = {f"{schema}.{table}": {
        "schema": any((kind, schema, table) in objects for kind in ("TABLE", "TABLE DATA")),
        "data_section": ("TABLE DATA", schema, table) in objects,
    } for schema, table in IMPORTANT}
    legacy = present["public.project"]["schema"]
    modern = present["public.projects"]["schema"]
    warnings = []
    if legacy and not modern:
        warnings.append("Legacy Supabase table public.project detected. R49/R50 backend expects public.projects: direct restore is incompatible.")
    elif not legacy and not modern:
        warnings.append("Neither public.project nor public.projects was found. Inspect source schema.")
    if present["storage.objects"]["schema"]:
        warnings.append("Storage metadata detected. Actual binary files are NOT included in this dump.")
    if present["auth.users"]["schema"]:
        warnings.append("Supabase Auth metadata detected. Passwords/session semantics cannot be directly copied into the custom FastAPI backend.")
    return {"format": "PostgreSQL custom dump TOC", "objects_by_type": counts,
            "important_tables": present, "warnings": warnings,
            "safe_to_restore_directly_to_geocauce": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump", type=Path, help="Path to PostgreSQL custom-format .dump")
    parser.add_argument("--json", type=Path, help="Optional location for metadata-only JSON report")
    args = parser.parse_args()
    try:
        with args.dump.open("rb") as file:
            if file.read(5) != b"PGDMP":
                parser.error("This is not a PostgreSQL custom-format PGDMP dump")
    except OSError as exc:
        parser.error(str(exc))
    try:
        process = subprocess.run(["pg_restore", "--list", str(args.dump)],
                                 capture_output=True, text=True, check=False)
    except FileNotFoundError:
        parser.error("pg_restore is not installed or not found in PATH")
    if process.returncode:
        print(process.stderr.strip(), file=sys.stderr)
        return process.returncode
    result = inventory(process.stdout)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.json:
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
