"""Check the committed directory, every profile chunk and coordinate coverage."""
import json
from pathlib import Path

from sync_dghs import ROOT, coordinates
from country_boundary import COUNTRY, SHA256


def validate(directory=ROOT / "data" / "dghs"):
    index = json.loads((directory / "index.json").read_text(encoding="utf-8"))
    records = index["records"]
    assert index["schemaVersion"] == 1 and index["chunkSize"] == 250
    assert len(records) == index["count"] > 0
    if index.get("sourceTotal") is not None:
        assert len(records) == index["sourceTotal"], "Directory no longer matches its source ID count"
    ids = [record["id"] for record in records]
    assert len(set(ids)) == len(ids)
    assert all(identifier.isdigit() and int(identifier) > 0 for identifier in ids)
    indexed = {record["id"]: record for record in records}
    coverage = {"published": 0, "missing": 0, "invalid": 0, "outside": 0}
    assert index["coordinateValidation"]["boundarySHA256"] == SHA256
    extracted_ids, completed = set(), 0
    allowed = set(index["fields"]) | {"_profile"}
    for path in sorted((directory / "profiles").glob("*.json")):
        chunk = json.loads(path.read_text(encoding="utf-8"))
        for identifier, row in chunk.items():
            assert identifier not in extracted_ids and identifier in indexed
            assert str(int(identifier) // 250) == path.stem
            assert row["id"] == identifier
            assert set(row) <= allowed, "Unexpected non-institutional data field"
            record = indexed[identifier]
            assert row["name"] == record["name"]
            lat, lon, status = coordinates(row.get("latitude"), row.get("longitude"))
            assert (record["lat"], record["lon"], record["coordinateStatus"]) == (lat, lon, status)
            coverage[status] += 1
            if status == "published":
                assert COUNTRY.contains(lat, lon), "A plotted point is outside Bangladesh"
            if status == "outside":
                assert record["reportedLatitude"] == row.get("latitude")
                assert record["reportedLongitude"] == row.get("longitude")
            if row.get("_profile"):
                profile = row["_profile"]
                assert profile["facilityId"] == identifier and profile["fields"].get("Organaization Name")
                assert profile["url"].startswith("https://hrm.dghs.gov.bd/index.php/public/facility-registry/facilities/")
                assert "phpdebugbar" not in profile["text"].lower()
                completed += 1
            extracted_ids.add(identifier)
    assert extracted_ids == set(ids), "Index and profile chunks contain different institutions"
    assert coverage == index["coordinateCoverage"]
    assert completed == index.get("profileProgress", {}).get("completed", 0)
    review = json.loads((directory / "coordinate-review.json").read_text(encoding="utf-8"))
    assert review["boundarySHA256"] == SHA256 and review["count"] == coverage["outside"]
    assert {row["id"] for row in review["records"]} == {row["id"] for row in records if row["coordinateStatus"] == "outside"}
    print(f"PASS: {len(records):,} unique institutions, {len(index['fields'])} report fields, {coverage['published']:,} usable points, {completed} detailed profiles; every chunk and coordinate checked.")


if __name__ == "__main__":
    validate()
