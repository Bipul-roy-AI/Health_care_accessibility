"""Point-in-polygon validation against the committed Bangladesh national boundary."""
import hashlib
import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "data" / "boundaries" / "bangladesh-country.geojson"
SHA256 = "3b912c05ccbfd16bfe3e9ea6d1db76d63cdb3a590d4045e0fead1329aa362fb9"


class CountryBoundary:
    def __init__(self, geometry):
        if geometry["type"] == "FeatureCollection":
            geometries = [feature["geometry"] for feature in geometry["features"]]
        elif geometry["type"] == "Feature":
            geometries = [geometry["geometry"]]
        else:
            geometries = [geometry]
        self.polygons = []
        for item in geometries:
            if item["type"] not in ("Polygon", "MultiPolygon"):
                raise ValueError("Country boundary must contain polygons")
            polygons = [item["coordinates"]] if item["type"] == "Polygon" else item["coordinates"]
            for rings in polygons:
                xs, ys = zip(*rings[0])
                self.polygons.append(([self.compile_ring(ring) for ring in rings], (min(xs), min(ys), max(xs), max(ys))))

    @staticmethod
    def compile_ring(ring):
        south = min(p[1] for p in ring)
        north = max(p[1] for p in ring)
        height = (north - south) / 128 or 1
        bands = [[] for _ in range(128)]
        for a, b in zip(ring, ring[1:] + ring[:1]):
            first = max(0, min(127, int((min(a[1], b[1]) - south) / height)))
            last = max(0, min(127, int((max(a[1], b[1]) - south) / height)))
            for band in range(first, last + 1):
                bands[band].append((a, b))
        return {"south": south, "north": north, "height": height, "bands": bands}

    @staticmethod
    def ring_state(x, y, ring):
        """Return -1 outside, 0 on an edge, 1 inside; GeoJSON is longitude-first."""
        inside = False
        if isinstance(ring, dict):
            if y < ring["south"] or y > ring["north"]:
                return -1
            band = max(0, min(127, int((y - ring["south"]) / ring["height"])))
            edges = ring["bands"][band]
        else:
            edges = zip(ring, ring[1:] + ring[:1])
        for a, b in edges:
            ax, ay = a[:2]
            bx, by = b[:2]
            if min(ay, by) <= y <= max(ay, by) and min(ax, bx) <= x <= max(ax, bx):
                cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
                if abs(cross) < 1e-11:
                    return 0
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                inside = not inside
        return 1 if inside else -1

    def contains(self, latitude, longitude):
        x, y = longitude, latitude
        for rings, (west, south, east, north) in self.polygons:
            if not (west <= x <= east and south <= y <= north):
                continue
            state = self.ring_state(x, y, rings[0])
            if state == 0:
                return True
            if state == 1 and all(self.ring_state(x, y, hole) == -1 for hole in rings[1:]):
                return True
        return False


def load_boundary():
    payload = PATH.read_bytes()
    if hashlib.sha256(payload).hexdigest() != SHA256:
        raise ValueError("Country boundary checksum changed; verify its source before use")
    return CountryBoundary(json.loads(payload))


COUNTRY = load_boundary()


def write_coordinate_review(directory, records):
    rows = [{"id": row["id"], "code": row.get("code", ""), "name": row["name"], "reportedLatitude": row.get("reportedLatitude"), "reportedLongitude": row.get("reportedLongitude"), "reason": "Outside Bangladesh national boundary; original source coordinates retained"} for row in records if row["coordinateStatus"] == "outside"]
    rows.sort(key=lambda row: int(row["id"]))
    document = {"boundarySHA256": SHA256, "count": len(rows), "records": rows}
    (Path(directory) / "coordinate-review.json").write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
