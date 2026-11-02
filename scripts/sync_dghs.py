"""Import a public DGHS organization-report export into a static directory.

Only explicitly selected, publicly displayed institutional fields are requested.
No source HTML, session data, debugging output or credentials are published.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from io import BytesIO
from html.parser import HTMLParser
from html import unescape
import json
import math
import hashlib
from pathlib import Path
import shutil
import re
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from openpyxl import load_workbook
from country_boundary import COUNTRY, SHA256 as COUNTRY_SHA256, write_coordinate_review

ROOT = Path(__file__).resolve().parents[1]
REPORT = "https://hrm.dghs.gov.bd/index.php/public/facility-registry/reports/organization-list"
PROFILE = "https://hrm.dghs.gov.bd/index.php/public/facility-registry/facilities/{}/profile?tab=detailed-information"
CHUNK_SIZE = 250
REPORT_HEADERS = {"id": "ID", "division_name": "Division", "name_bn": "Name (Bangla)", "district_name": "District", "facility_agency_name": "Agency", "city_corporation_name": "City Corporation", "upazila_name": "Upazila", "paurasava_name": "Paurasava", "union_name": "Union", "email_1": "Email", "is_private": "Private", "facility_type_name": "Type"}
SUMMARY_FIELDS = ["id", "code", "name", "name_bn", "facility_type_name", "division_name", "district_name", "upazila_name", "facility_agency_name", "facility_ownership_name", "facility_function_name", "is_active", "latitude", "longitude", "mailing_address", "mobile_1", "land_phone_1", "email_1", "website_url"]


def plain(value):
    return " ".join(unescape(re.sub(r"<[^>]*>", " ", str(value or ""))).split())


class PublicProfileParser(HTMLParser):
    """Extract visible label/value pairs only, excluding all scripts and debug data."""
    def __init__(self):
        super().__init__()
        self.tables = []
        self.cells = []
        self.cell = None
        self.values = {}
        self.content_depth = 0
        self.visible_text = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag in ("script", "style"):
            self.ignored += 1
        if tag == "div":
            if self.content_depth:
                self.content_depth += 1
            elif "tab-content" in attributes.get("class", "").split():
                self.content_depth = 1
        if tag == "table":
            self.tables.append("facility-registry-table" in attributes.get("class", "").split())
        if self.tables and self.tables[-1]:
            if tag == "tr":
                self.cells = []
            elif tag in ("td", "th"):
                self.cell = ["bg-gray-light" in attributes.get("class", "").split(), []]

    def handle_data(self, data):
        if self.ignored:
            return
        if self.content_depth and data.strip():
            self.visible_text.append(" ".join(data.split()))
        if self.cell is not None:
            self.cell[1].append(data)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignored = max(0, self.ignored - 1)
        if tag == "div" and self.content_depth:
            self.content_depth -= 1
        if self.content_depth and tag in ("tr", "p", "h3", "h4", "h5"):
            self.visible_text.append("\n")
        if tag in ("td", "th") and self.cell is not None:
            self.cells.append((self.cell[0], " ".join(" ".join(self.cell[1]).split())))
            self.cell = None
        elif tag == "tr":
            for index, (is_label, label) in enumerate(self.cells[:-1]):
                if is_label and not self.cells[index + 1][0]:
                    self.values[label] = self.cells[index + 1][1]
            self.cells = []
        elif tag == "table" and self.tables:
            self.tables.pop()


def text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value).strip()


def coordinates(lat, lon):
    """Do not silently swap, geocode, clamp or replace source coordinates."""
    if not text(lat) or not text(lon):
        return None, None, "missing"
    try:
        a, b = float(lat), float(lon)
    except (ValueError, TypeError):
        return None, None, "invalid"
    if not math.isfinite(a) or not math.isfinite(b) or not (20.5 <= a <= 26.7 and 88 <= b <= 92.7):
        return None, None, "invalid"
    if not COUNTRY.contains(a, b):
        return None, None, "outside"
    return a, b, "published"


def read_export(payload, fields):
    workbook = load_workbook(BytesIO(payload), read_only=True, data_only=True)
    rows = workbook.active.iter_rows(values_only=True)
    try:
        header = next(rows)
    except StopIteration:
        raise ValueError("The DGHS export has no header")
    # Labels in the XLSX are humanized by DGHS; column order is explicit in our URL.
    keys = list(fields)
    expected = [REPORT_HEADERS.get(key, key.replace('_', ' ').title()) for key in keys]
    normalize = lambda v: "".join(c for c in text(v).lower() if c.isalnum())
    if len(header) != len(keys) or [normalize(v) for v in header] != [normalize(v) for v in expected]:
        raise ValueError("DGHS export columns changed; refusing to publish mislabelled data")
    records, seen = [], set()
    for values in rows:
        if not any(value is not None for value in values):
            continue
        row = {key: text(value) for key, value in zip(keys, values)}
        identifier = row.get("id", "")
        if not identifier.isdigit() or int(identifier) <= 0 or not row.get("name"):
            raise ValueError("DGHS export contains a row without a valid institution ID/name")
        if identifier in seen:
            raise ValueError(f"Duplicate DGHS institution ID: {identifier}")
        seen.add(identifier)
        records.append(row)
    workbook.close()
    if not records:
        raise ValueError("DGHS export contains no institution records")
    return records


def write_directory(records, fields, output, source_url, source_total=None):
    """Stage and validate everything before replacing an existing snapshot."""
    generated = datetime.now(timezone.utc).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".dghs-import-", dir=output.parent))
    previous_index = json.loads((output / "index.json").read_text(encoding="utf-8")) if (output / "index.json").exists() else None
    try:
        (staging / "profiles").mkdir()
        index_records, chunks = [], {}
        coverage = {"published": 0, "missing": 0, "invalid": 0, "outside": 0}
        for row in records:
            identifier = row["id"]
            lat, lon, quality = coordinates(row.get("latitude"), row.get("longitude"))
            coverage[quality] += 1
            summary = {key: row.get(key, "") for key in SUMMARY_FIELDS if row.get(key, "")}
            summary.update(id=identifier, lat=lat, lon=lon, coordinateStatus=quality, retrievedAt=generated)
            if quality == "outside":
                summary.update(reportedLatitude=row.get("latitude"), reportedLongitude=row.get("longitude"))
            summary.pop("latitude", None)
            summary.pop("longitude", None)
            index_records.append(summary)
            chunk = chunks.setdefault(str(int(identifier) // CHUNK_SIZE), {})
            # Empty values are reconstructed using the snapshot's complete field list.
            chunk[identifier] = {key: value for key, value in row.items() if value != ""}
        for chunk_id, data in chunks.items():
            previous_path = output / "profiles" / f"{chunk_id}.json"
            if previous_path.exists():
                previous_chunk = json.loads(previous_path.read_text(encoding="utf-8"))
                for identifier, row in data.items():
                    previous_profile = previous_chunk.get(identifier, {}).get("_profile")
                    if previous_profile:
                        row["_profile"] = previous_profile
            (staging / "profiles" / f"{chunk_id}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        metadata = {"schemaVersion": 1, "source": "DGHS facility registry", "sourceUrl": source_url, "profileUrlTemplate": PROFILE, "generatedAt": generated, "count": len(records), "sourceTotal": source_total, "coordinateCoverage": coverage, "chunkSize": CHUNK_SIZE, "fields": fields, "records": index_records}
        metadata["coordinateValidation"] = {"method": "point-in-polygon", "boundarySHA256": COUNTRY_SHA256, "boundary": "OpenStreetMap Bangladesh relation 184640"}
        enriched = {identifier for chunk in chunks.values() for identifier, row in chunk.items() if row.get("_profile")}
        if enriched:
            previous_progress = (previous_index or {}).get("profileProgress", {})
            next_offset = next((i for i, row in enumerate(index_records) if row["id"] not in enriched), len(index_records))
            record_ids = {row["id"] for row in index_records}
            metadata["profileProgress"] = {**previous_progress, "completed": len(enriched), "total": len(index_records), "nextOffset": next_offset, "retryIds": [identifier for identifier in previous_progress.get("retryIds", []) if identifier in record_ids]}
        (staging / "index.json").write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        write_coordinate_review(staging, index_records)
        backup = output.with_name(output.name + ".previous")
        if backup.exists():
            raise ValueError(f"Preserved snapshot already exists at {backup}; inspect it before importing")
        if output.exists():
            output.rename(backup)
        try:
            staging.rename(output)
        except Exception:
            if backup.exists():
                backup.rename(output)
            raise
        if backup.exists():
            shutil.rmtree(backup)
        return {key: value for key, value in metadata.items() if key != "records"}
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Read an already-downloaded official XLSX instead of fetching")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "dghs")
    parser.add_argument("--expected-count", type=int)
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "shasthopath-dghs-cache", help="Directory outside the checkout for resumable public XLSX exports")
    args = parser.parse_args()
    fields = json.loads((ROOT / "scripts" / "dghs-fields.json").read_text(encoding="utf-8"))
    query = {"submit": "Run", "is_active": "1", "columns_csv": ",".join(fields), "alias_columns_csv": ",".join(fields), "ret": "excel"}
    source_url = REPORT + "?" + urlencode(query)
    if args.input:
        payload = args.input.read_bytes()
        records = read_export(payload, fields)
    else:
        # A nationwide 62-column XLSX exceeds the source server's memory limit.
        # Use its public district filters; verify IDs against a small national export.
        args.cache.mkdir(parents=True, exist_ok=True)
        fingerprint = hashlib.sha256(json.dumps(fields).encode()).hexdigest()[:12]

        def download(selected_fields, filters, cache_key):
            cache_path = args.cache / f"{fingerprint}-{cache_key}.xlsx"
            if cache_path.exists() and time.time() - cache_path.stat().st_mtime < 3600:
                return cache_path.read_bytes()
            # Geographic controls are multi-selects in the official report form.
            encoded_filters = {(key + "[]" if key in ("division_id", "district_id", "upazila_id") else key): value for key, value in filters.items()}
            parameters = dict(query, columns_csv=",".join(selected_fields), alias_columns_csv=",".join(selected_fields), **encoded_filters)
            url = REPORT + "?" + urlencode(parameters)
            with urlopen(Request(url, headers={"User-Agent": "ShasthoPath/1.0 (public institutional directory)"}), timeout=180) as response:
                payload = response.read()
            if not payload.startswith(b"PK"):
                raise ValueError("The report did not return an XLSX; leaving existing snapshot untouched")
            cache_path.write_bytes(payload)
            return payload

        def options(kind, parent, parent_id):
            url = f"https://hrm.dghs.gov.bd/index.php/public/{kind}/json?" + urlencode({parent: parent_id})
            with urlopen(url, timeout=45) as response:
                data = json.load(response)
            items = data.get("data", {}).get("items")
            if not isinstance(items, list):
                raise ValueError("DGHS geographic filter response changed")
            return items

        print("Downloading official national ID list…", flush=True)
        def read_ids(payload):
            ids_workbook = load_workbook(BytesIO(payload), read_only=True, data_only=True)
            id_rows = ids_workbook.active.iter_rows(values_only=True)
            if text(next(id_rows)[0]).lower() != "id":
                raise ValueError("National ID export header changed")
            identifiers = [text(row[0]) for row in id_rows if row and text(row[0])]
            ids_workbook.close()
            if len(identifiers) != len(set(identifiers)):
                raise ValueError("Duplicate national institution IDs")
            return set(identifiers)

        active_ids = read_ids(download({"id": "ID"}, {"is_active": "1"}, "active-ids"))
        # The report forces active records even when is_active=0 is supplied.
        # The public directory's Active-column sorting exposes inactive entries;
        # import their visible profiles separately, rather than losing them.
        inactive_rows = {}
        start = 0
        columns = ["id", "name", "name_bn", "code", "email_1", "facility_agency_name", "facility_type_name", "is_private", "division_name", "district_name", "city_corporation_name", "upazila_name", "is_active"]
        while True:
            parameters = {"draw": "1", "start": start, "length": "100", "order[0][column]": "12", "order[0][dir]": "asc"}
            for index, column in enumerate(columns):
                parameters[f"columns[{index}][data]"] = column
                parameters[f"columns[{index}][name]"] = "facilities." + column
                parameters[f"columns[{index}][orderable]"] = "true"
            url = "https://hrm.dghs.gov.bd/index.php/public/facility-registry/facilities/datatable/json?" + urlencode(parameters)
            with urlopen(url, timeout=45) as response:
                table = json.load(response)
            found_active = False
            for source_row in table.get("data", []):
                if plain(source_row.get("is_active")).lower() in ("yes", "1"):
                    found_active = True
                    break
                identifier = plain(source_row.get("id"))
                if not identifier.isdigit():
                    raise ValueError("Invalid inactive institution ID")
                inactive_rows[identifier] = {key: plain(source_row.get(key)) for key in columns}
            if found_active or not table.get("data"):
                break
            start += len(table["data"])
        inactive_ids = set(inactive_rows)
        national_ids = active_ids | inactive_ids
        if not national_ids or not all(identifier.isdigit() for identifier in national_ids):
            raise ValueError("Invalid national institution IDs")
        if args.expected_count is not None and len(national_ids) != args.expected_count:
            raise ValueError(f"National list now contains {len(national_ids)} IDs; expected {args.expected_count}")
        if len(national_ids) != int(table["recordsTotal"]):
            raise ValueError("National export IDs and the public directory's total differ")
        districts = {}
        # The options endpoint defaults to 50 results; requesting each of the eight
        # publicly listed divisions avoids silently truncating the 64-district list.
        for division_id in range(1, 9):
            for district in options("districts", "division_id", division_id):
                districts[str(district["id"])] = district
        if len(districts) != 64:
            raise ValueError(f"Expected 64 distinct districts, received {len(districts)}")
        records = []
        for number, (district_id, district) in enumerate(districts.items(), 1):
            time.sleep(0.2)
            try:
                batch = read_export(download(fields, {"district_id": district_id}, f"district-{district_id}"), fields)
            except HTTPError as error:
                if error.code != 500:
                    raise
                # Large districts can also exceed the report's XLSX memory limit.
                subdistricts = options("upazilas", "district_id", district_id)
                if not subdistricts:
                    raise ValueError(f"Could not partition district {district_id}") from error
                batch = []
                for upazila in subdistricts:
                    time.sleep(0.2)
                    batch.extend(read_export(download(fields, {"district_id": district_id, "upazila_id": upazila["id"]}, f"upazila-{upazila['id']}"), fields))
            records.extend(batch)
            print(f"District {number}/64: {district['name']} — {len(batch)} records", flush=True)
        collected_ids = {row["id"] for row in records}
        missing = national_ids - collected_ids
        if len(collected_ids) != len(records) or collected_ids - national_ids:
            raise ValueError("District exports contain duplicate or unexpected institution IDs")
        if missing:
            print(f"Importing {len(missing)} institutions absent from district-filtered exports…", flush=True)
        for identifier in sorted(missing, key=int):
            time.sleep(0.2)
            if identifier in inactive_ids:
                profile_cache = args.cache / f"{fingerprint}-inactive-{identifier}.json"
                if profile_cache.exists() and time.time() - profile_cache.stat().st_mtime < 3600:
                    row = json.loads(profile_cache.read_text())
                else:
                    with urlopen(PROFILE.format(identifier), timeout=45) as response:
                        profile = response.read().decode("utf-8")
                    parser = PublicProfileParser()
                    parser.feed(profile)
                    if not parser.values.get("Organaization Name"):
                        raise ValueError(f"Inactive profile {identifier} could not be parsed")
                    row = {key: parser.values.get(label, "") for key, label in fields.items()}
                    row.update(inactive_rows[identifier])
                    row.update(id=identifier, is_active="0")
                    profile_cache.write_text(json.dumps(row, ensure_ascii=False))
                records.append(row)
            else:
                records.extend(read_export(download(fields, {"id": identifier}, f"institution-{identifier}"), fields))
        if {row["id"] for row in records} != national_ids or len(records) != len(national_ids):
            raise ValueError("Exports do not exactly cover the national institution ID list")
        records.sort(key=lambda row: int(row["id"]))
    if args.expected_count is not None and len(records) != args.expected_count:
        raise ValueError(f"Expected {args.expected_count} records, received {len(records)}; existing snapshot left untouched")
    source_total = args.expected_count if args.input else len(national_ids)
    result = write_directory(records, fields, args.output, source_url, source_total)
    print(json.dumps({key: result[key] for key in ["count", "generatedAt", "coordinateCoverage"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
