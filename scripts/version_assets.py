"""Version local CSS/JS references in the generated site to refresh browser caches."""
import argparse
import hashlib
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--directory", type=Path, required=True)
args = parser.parse_args()
root = args.directory.resolve()
pattern = re.compile(r'''((?:src|href)=["'])(\./[^"'?#]+\.(?:css|js))(?:\?[^"']*)?(["'])''')


def version(match):
    asset = (root / match[2][2:]).resolve()
    if not asset.is_relative_to(root) or not asset.is_file():
        raise ValueError(f"Missing local website asset: {match[2]}")
    digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    return f"{match[1]}{match[2]}?v={digest}{match[3]}"


for name in ("index.html", "overview.html", "helplines.html", "statistics.html", "accessibility.html", "analysis.html", "atlas.html"):
    path = root / name
    path.write_text(pattern.sub(version, path.read_text(encoding="utf-8")), encoding="utf-8")
