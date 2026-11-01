"""Checks for source parsing, missing coordinates and safe snapshot replacement."""
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from sync_dghs import PublicProfileParser, REPORT_HEADERS, coordinates, read_export, write_directory


FIELDS = {"id": "ID", "name": "Organaization Name", "name_bn": "Organaization Name BN", "latitude": "Latitude", "longitude": "Longitude"}


def workbook(rows, headers=None):
    book = Workbook()
    sheet = book.active
    sheet.append(headers or [REPORT_HEADERS.get(key, key.replace('_', ' ').title()) for key in FIELDS])
    for row in rows:
        sheet.append(row)
    result = io.BytesIO()
    book.save(result)
    return result.getvalue()


class ImportChecks(unittest.TestCase):
    def test_unicode_and_missing_coordinates(self):
        records = read_export(workbook([[1, "Test institution", "পরীক্ষা প্রতিষ্ঠান", 23.7, 90.4], [2, "No point", "", None, None]]), FIELDS)
        self.assertEqual(records[0]["name_bn"], "পরীক্ষা প্রতিষ্ঠান")
        self.assertEqual(coordinates(records[1]["latitude"], records[1]["longitude"]), (None, None, "missing"))
        self.assertEqual(coordinates("90.4", "23.7"), (None, None, "invalid"))
        self.assertEqual(coordinates("nan", "90.4"), (None, None, "invalid"))

    def test_changed_headers_and_duplicate_ids_are_rejected(self):
        with self.assertRaises(ValueError):
            read_export(workbook([[1, "Test", "", 23.7, 90.4]], ["ID", "Latitude", "Name", "Longitude", "Name (Bangla)"]), FIELDS)
        with self.assertRaises(ValueError):
            read_export(workbook([[1, "First", "", 23.7, 90.4], [1, "Duplicate", "", 23.8, 90.5]]), FIELDS)

    def test_only_visible_profile_content_is_extracted(self):
        parser = PublicProfileParser()
        parser.feed('''<div class="tab-content"><h3>Basic Information</h3><table class="facility-registry-table"><tr><td class="bg-gray-light">Organaization Name</td><td>Test institution</td><td class="bg-gray-light">Latitude</td><td>23.7</td></tr></table><h4>Building Info</h4><p>Name: Test building</p><script>never_publish_this_value</script></div><script>phpdebugbar=session_data</script>''')
        self.assertEqual(parser.values["Organaization Name"], "Test institution")
        visible = " ".join(parser.visible_text)
        self.assertIn("Test building", visible)
        self.assertNotIn("never_publish", visible)
        self.assertNotIn("session_data", visible)

    def test_full_report_refresh_preserves_detailed_profiles(self):
        rows = [{"id": "1", "name": "Test", "name_bn": "", "latitude": "23.7", "longitude": "90.4"}]
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "dghs"
            write_directory(rows, FIELDS, output, "https://hrm.dghs.gov.bd/", 1)
            chunk_path = output / "profiles" / "0.json"
            chunk = json.loads(chunk_path.read_text())
            chunk["1"]["_profile"] = {"facilityId": "1", "fields": {"Organaization Name": "Test"}, "text": "Test snapshot", "retrievedAt": "2026-11-01T00:00:00Z"}
            chunk_path.write_text(json.dumps(chunk))
            result = write_directory(rows, FIELDS, output, "https://hrm.dghs.gov.bd/", 1)
            self.assertEqual(json.loads(chunk_path.read_text())["1"]["_profile"]["text"], "Test snapshot")
            self.assertEqual(result["profileProgress"]["completed"], 1)
            self.assertEqual(result["coordinateCoverage"], {"published": 1, "missing": 0, "invalid": 0})


if __name__ == "__main__":
    unittest.main()
