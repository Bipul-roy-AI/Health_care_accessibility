"""Resume paced imports of public DGHS detailed-information profiles."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

from sync_dghs import ROOT, PROFILE, PublicProfileParser, SUMMARY_FIELDS, coordinates


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--max-seconds", type=int, default=1200)
    parser.add_argument("--directory", type=Path, default=ROOT / "data" / "dghs")
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000 or args.delay < 0.2:
        parser.error("Use 1–1000 profiles and a delay of at least 0.2 seconds")
    index_path = args.directory / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    records, fields = index["records"], index["fields"]
    progress = index.get("profileProgress", {})
    offset = int(progress.get("nextOffset", 0))
    retry_ids = [str(value) for value in progress.get("retryIds", [])]
    by_id = {record["id"]: record for record in records}
    chunks = {}
    completed = int(progress.get("completed", 0))
    failures, processed, updated = [], 0, 0
    started = time.monotonic()
    queue = list(dict.fromkeys([identifier for identifier in retry_ids if identifier in by_id] + [record["id"] for record in records[offset:]]))
    next_offset = offset
    for identifier in queue:
        if processed >= args.limit or time.monotonic() - started >= args.max_seconds:
            break
        processed += 1
        time.sleep(args.delay)
        chunk_id = str(int(identifier) // index["chunkSize"])
        if chunk_id not in chunks:
            chunks[chunk_id] = json.loads((args.directory / "profiles" / f"{chunk_id}.json").read_text(encoding="utf-8"))
        row = chunks[chunk_id][identifier]
        try:
            with urlopen(Request(PROFILE.format(identifier), headers={"User-Agent": "ShasthoPath/1.0 (public institutional directory)"}), timeout=35) as response:
                document = response.read().decode("utf-8")
            profile = PublicProfileParser()
            profile.feed(document)
            if not profile.values.get("Organaization Name") or not profile.visible_text:
                raise ValueError("Detailed-information profile structure changed")
            retrieved = datetime.now(timezone.utc).isoformat()
            if not row.get("_profile"):
                completed += 1
            row["_profile"] = {"facilityId": identifier, "url": PROFILE.format(identifier), "retrievedAt": retrieved, "fields": profile.values, "text": " ".join(profile.visible_text).replace(" \n ", "\n")}
            for key, label in fields.items():
                if key not in ("id", "code", "is_active") and label in profile.values:
                    row[key] = profile.values[label]
            summary = by_id[identifier]
            for key in SUMMARY_FIELDS:
                if key not in ("latitude", "longitude"):
                    if row.get(key) != "":
                        summary[key] = row.get(key, "")
                    else:
                        summary.pop(key, None)
            summary["lat"], summary["lon"], summary["coordinateStatus"] = coordinates(row.get("latitude"), row.get("longitude"))
            summary["retrievedAt"] = retrieved
            updated += 1
        except Exception as error:
            failures.append(identifier)
            print(f"Profile {identifier}: unavailable ({type(error).__name__}); retained previous data", flush=True)
        if identifier not in retry_ids:
            next_offset += 1
        if processed % 25 == 0:
            print(f"Processed {processed}; updated {updated}; retry {len(failures)}", flush=True)
        if len(failures) >= 10 and updated == 0:
            raise RuntimeError("DGHS profiles appear unavailable; no new snapshot was published")
    if not updated:
        if not queue:
            print("All detailed profiles have been imported.")
            return
        raise RuntimeError("No profiles updated; existing snapshot left untouched")
    for chunk_id, chunk in chunks.items():
        atomic_json(args.directory / "profiles" / f"{chunk_id}.json", chunk)
    now = datetime.now(timezone.utc).isoformat()
    index.setdefault("reportExportedAt", index["generatedAt"])
    index["generatedAt"] = now
    coverage = {"published": 0, "missing": 0, "invalid": 0}
    for record in records:
        coverage[record["coordinateStatus"]] += 1
    index["coordinateCoverage"] = coverage
    remaining_retries = [identifier for identifier in retry_ids if identifier not in queue[:processed]]
    index["profileProgress"] = {"completed": completed, "total": len(records), "nextOffset": next_offset, "retryIds": list(dict.fromkeys(remaining_retries + failures)), "lastBatchAt": now, "lastBatchSize": updated}
    atomic_json(index_path, index)
    print(json.dumps(index["profileProgress"], indent=2))


if __name__ == "__main__":
    main()
